import type { Pool } from "pg";

export interface SimpleDashboardRecord {
  id: string;
  name: string;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface SimpleDashboardSectionRecord {
  id: string;
  dashboard_id: string;
  name: string;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface SimpleDashboardCardRecord {
  id: string;
  dashboard_id: string;
  section_id: string | null;
  asset_metric_id: string;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export class PostgresSimpleDashboardRepository {
  constructor(private readonly pool: Pool) {}

  async listDashboards(): Promise<SimpleDashboardRecord[]> {
    const result = await this.pool.query<SimpleDashboardRecord>(`
      SELECT id, name, sort_order, created_at, updated_at
      FROM simple_dashboards
      ORDER BY sort_order, created_at, id
    `);
    return result.rows;
  }

  async listSections(): Promise<SimpleDashboardSectionRecord[]> {
    const result = await this.pool.query<SimpleDashboardSectionRecord>(`
      SELECT id, dashboard_id, name, sort_order, created_at, updated_at
      FROM simple_dashboard_sections
      ORDER BY dashboard_id, sort_order, created_at, id
    `);
    return result.rows;
  }

  async listCards(): Promise<SimpleDashboardCardRecord[]> {
    const result = await this.pool.query<SimpleDashboardCardRecord>(`
      SELECT id, dashboard_id, section_id, asset_metric_id, sort_order, created_at, updated_at
      FROM simple_dashboard_cards
      ORDER BY dashboard_id, section_id NULLS FIRST, sort_order, created_at, id
    `);
    return result.rows;
  }

  async createDashboard(name: string): Promise<SimpleDashboardRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<SimpleDashboardRecord>(`
        INSERT INTO simple_dashboards (name, sort_order)
        VALUES (
          $1,
          COALESCE((SELECT MAX(sort_order) + 1 FROM simple_dashboards), 0)
        )
        RETURNING id, name, sort_order, created_at, updated_at
      `, [name]);
      const dashboard = result.rows[0]!;
      await client.query(`
        INSERT INTO simple_dashboard_sections (dashboard_id, name, sort_order)
        VALUES ($1, 'General', 0)
      `, [dashboard.id]);
      await client.query("COMMIT");
      return dashboard;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async renameDashboard(id: string, name: string): Promise<SimpleDashboardRecord | null> {
    const result = await this.pool.query<SimpleDashboardRecord>(`
      UPDATE simple_dashboards
      SET name = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING id, name, sort_order, created_at, updated_at
    `, [id, name]);
    return result.rows[0] ?? null;
  }

  async reorderDashboards(dashboardIds: string[]): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<{ id: string }>(`
        SELECT id FROM simple_dashboards ORDER BY sort_order, created_at, id FOR UPDATE
      `);
      const existingIds = existing.rows.map(row => row.id);
      if (existingIds.length !== dashboardIds.length || existingIds.some(id => !dashboardIds.includes(id))) {
        await client.query("ROLLBACK");
        return false;
      }
      for (let index = 0; index < dashboardIds.length; index += 1) {
        await client.query(`UPDATE simple_dashboards SET sort_order = $2, updated_at = NOW() WHERE id = $1`, [dashboardIds[index], index]);
      }
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createSection(dashboardId: string, name: string): Promise<SimpleDashboardSectionRecord> {
    const result = await this.pool.query<SimpleDashboardSectionRecord>(`
      INSERT INTO simple_dashboard_sections (dashboard_id, name, sort_order)
      VALUES ($1, $2, COALESCE((SELECT MAX(sort_order) + 1 FROM simple_dashboard_sections WHERE dashboard_id = $1), 0))
      RETURNING id, dashboard_id, name, sort_order, created_at, updated_at
    `, [dashboardId, name]);
    return result.rows[0]!;
  }

  async renameSection(dashboardId: string, sectionId: string, name: string): Promise<SimpleDashboardSectionRecord | null> {
    const result = await this.pool.query<SimpleDashboardSectionRecord>(`
      UPDATE simple_dashboard_sections SET name = $3, updated_at = NOW()
      WHERE id = $1 AND dashboard_id = $2
      RETURNING id, dashboard_id, name, sort_order, created_at, updated_at
    `, [sectionId, dashboardId, name]);
    return result.rows[0] ?? null;
  }

  async deleteSection(dashboardId: string, sectionId: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const section = await client.query<{ id: string }>(`
        SELECT id
        FROM simple_dashboard_sections
        WHERE id = $1 AND dashboard_id = $2
        FOR UPDATE
      `, [sectionId, dashboardId]);
      if ((section.rowCount ?? 0) === 0) {
        await client.query("ROLLBACK");
        return false;
      }

      let replacement = await client.query<{ id: string }>(`
        SELECT id
        FROM simple_dashboard_sections
        WHERE dashboard_id = $1 AND id <> $2
        ORDER BY sort_order, created_at, id
        LIMIT 1
        FOR UPDATE
      `, [dashboardId, sectionId]);

      if ((replacement.rowCount ?? 0) === 0) {
        await client.query(`
          DELETE FROM simple_dashboard_sections
          WHERE id = $1 AND dashboard_id = $2
        `, [sectionId, dashboardId]);
        replacement = await client.query<{ id: string }>(`
          INSERT INTO simple_dashboard_sections (dashboard_id, name, sort_order)
          VALUES ($1, 'General', 0)
          RETURNING id
        `, [dashboardId]);
        await client.query(`
          UPDATE simple_dashboard_cards
          SET section_id = $2, updated_at = NOW()
          WHERE dashboard_id = $1 AND section_id IS NULL
        `, [dashboardId, replacement.rows[0]!.id]);
      } else {
        await client.query(`
          UPDATE simple_dashboard_cards
          SET section_id = $3, updated_at = NOW()
          WHERE dashboard_id = $1 AND section_id = $2
        `, [dashboardId, sectionId, replacement.rows[0]!.id]);
        await client.query(`
          DELETE FROM simple_dashboard_sections
          WHERE id = $1 AND dashboard_id = $2
        `, [sectionId, dashboardId]);
      }
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async reorderSections(dashboardId: string, sectionIds: string[]): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<{ id: string }>(`
        SELECT id FROM simple_dashboard_sections WHERE dashboard_id = $1 ORDER BY sort_order, created_at, id FOR UPDATE
      `, [dashboardId]);
      const existingIds = existing.rows.map(row => row.id);
      if (existingIds.length !== sectionIds.length || existingIds.some(id => !sectionIds.includes(id))) {
        await client.query("ROLLBACK");
        return false;
      }
      for (let index = 0; index < sectionIds.length; index += 1) {
        await client.query(`UPDATE simple_dashboard_sections SET sort_order = $3, updated_at = NOW() WHERE dashboard_id = $1 AND id = $2`, [dashboardId, sectionIds[index], index]);
      }
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteDashboard(id: string): Promise<boolean> {
    const result = await this.pool.query(
      "DELETE FROM simple_dashboards WHERE id = $1",
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async metricExists(assetMetricId: string): Promise<boolean> {
    const result = await this.pool.query(
      "SELECT 1 FROM asset_metrics WHERE id = $1",
      [assetMetricId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async dashboardExists(id: string): Promise<boolean> {
    const result = await this.pool.query(
      "SELECT 1 FROM simple_dashboards WHERE id = $1",
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async createCard(
    dashboardId: string,
    assetMetricId: string,
    sectionId: string | null
  ): Promise<SimpleDashboardCardRecord> {
    const result = await this.pool.query<SimpleDashboardCardRecord>(`
      INSERT INTO simple_dashboard_cards (
        dashboard_id,
        section_id,
        asset_metric_id,
        sort_order
      )
      VALUES (
        $1,
        $3,
        $2,
        COALESCE((
          SELECT MAX(sort_order) + 1
          FROM simple_dashboard_cards
          WHERE dashboard_id = $1 AND section_id IS NOT DISTINCT FROM $3
        ), 0)
      )
      RETURNING id, dashboard_id, section_id, asset_metric_id, sort_order, created_at, updated_at
    `, [dashboardId, assetMetricId, sectionId]);
    return result.rows[0]!;
  }

  async updateCard(
    dashboardId: string,
    cardId: string,
    assetMetricId: string,
    sectionId: string | null
  ): Promise<SimpleDashboardCardRecord | null> {
    const result = await this.pool.query<SimpleDashboardCardRecord>(`
      UPDATE simple_dashboard_cards
      SET asset_metric_id = $3, section_id = $4, updated_at = NOW()
      WHERE id = $1 AND dashboard_id = $2
      RETURNING id, dashboard_id, section_id, asset_metric_id, sort_order, created_at, updated_at
    `, [cardId, dashboardId, assetMetricId, sectionId]);
    return result.rows[0] ?? null;
  }

  async deleteCard(dashboardId: string, cardId: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM simple_dashboard_cards
       WHERE id = $1 AND dashboard_id = $2`,
      [cardId, dashboardId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async reorderCards(
    dashboardId: string,
    cardIds: string[]
  ): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<{ id: string }>(`
        SELECT id
        FROM simple_dashboard_cards
        WHERE dashboard_id = $1
        ORDER BY sort_order, created_at, id
        FOR UPDATE
      `, [dashboardId]);

      const existingIds = existing.rows.map(row => row.id);
      if (
        existingIds.length !== cardIds.length ||
        existingIds.some(id => !cardIds.includes(id))
      ) {
        await client.query("ROLLBACK");
        return false;
      }

      for (let index = 0; index < cardIds.length; index += 1) {
        await client.query(`
          UPDATE simple_dashboard_cards
          SET sort_order = $3, updated_at = NOW()
          WHERE dashboard_id = $1 AND id = $2
        `, [dashboardId, cardIds[index], index]);
      }

      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
