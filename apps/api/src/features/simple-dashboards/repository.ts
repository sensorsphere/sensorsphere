import type { Pool } from "pg";

export interface SimpleDashboardRecord {
  id: string;
  name: string;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface SimpleDashboardCardRecord {
  id: string;
  dashboard_id: string;
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

  async listCards(): Promise<SimpleDashboardCardRecord[]> {
    const result = await this.pool.query<SimpleDashboardCardRecord>(`
      SELECT id, dashboard_id, asset_metric_id, sort_order, created_at, updated_at
      FROM simple_dashboard_cards
      ORDER BY dashboard_id, sort_order, created_at, id
    `);
    return result.rows;
  }

  async createDashboard(name: string): Promise<SimpleDashboardRecord> {
    const result = await this.pool.query<SimpleDashboardRecord>(`
      INSERT INTO simple_dashboards (name, sort_order)
      VALUES (
        $1,
        COALESCE((SELECT MAX(sort_order) + 1 FROM simple_dashboards), 0)
      )
      RETURNING id, name, sort_order, created_at, updated_at
    `, [name]);
    return result.rows[0]!;
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
    assetMetricId: string
  ): Promise<SimpleDashboardCardRecord> {
    const result = await this.pool.query<SimpleDashboardCardRecord>(`
      INSERT INTO simple_dashboard_cards (
        dashboard_id,
        asset_metric_id,
        sort_order
      )
      VALUES (
        $1,
        $2,
        COALESCE((
          SELECT MAX(sort_order) + 1
          FROM simple_dashboard_cards
          WHERE dashboard_id = $1
        ), 0)
      )
      RETURNING id, dashboard_id, asset_metric_id, sort_order, created_at, updated_at
    `, [dashboardId, assetMetricId]);
    return result.rows[0]!;
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
