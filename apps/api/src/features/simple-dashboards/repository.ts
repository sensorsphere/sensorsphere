import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

export interface SimpleDashboardRecord {
  id: string;
  name: string;
  sort_order: number;
  template_id: string | null;
  template_metric_key: string | null;
  template_name: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface SimpleDashboardTemplateRecord {
  id: string;
  name: string;
  created_at: Date;
  updated_at: Date;
}

export interface SimpleDashboardTemplateSectionRecord {
  id: string;
  template_id: string;
  name: string;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface SimpleDashboardTemplateCardRecord {
  id: string;
  template_id: string;
  section_id: string;
  asset_id: string;
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


export interface SimpleDashboardEntityCardRecord {
  id: string;
  dashboard_id: string;
  section_id: string | null;
  device_id: string;
  entity_value: string;
  widget_type: string;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export class PostgresSimpleDashboardRepository {
  constructor(private readonly pool: Pool) {}

  async ensureEntityCardSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS simple_dashboard_entity_cards (
        id uuid PRIMARY KEY,
        dashboard_id uuid NOT NULL REFERENCES simple_dashboards(id) ON DELETE CASCADE,
        section_id uuid NULL REFERENCES simple_dashboard_sections(id) ON DELETE SET NULL,
        device_id uuid NOT NULL,
        entity_value text NOT NULL,
        widget_type text NOT NULL DEFAULT 'auto',
        sort_order integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        UNIQUE (dashboard_id, device_id, entity_value)
      )
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS simple_dashboard_entity_cards_dashboard_idx
      ON simple_dashboard_entity_cards (dashboard_id, section_id, sort_order)
    `);
  }

  async listEntityCards(): Promise<SimpleDashboardEntityCardRecord[]> {
    const result = await this.pool.query<SimpleDashboardEntityCardRecord>(`
      SELECT id, dashboard_id, section_id, device_id, entity_value, widget_type, sort_order, created_at, updated_at
      FROM simple_dashboard_entity_cards
      ORDER BY dashboard_id, section_id NULLS FIRST, sort_order, created_at, id
    `);
    return result.rows;
  }

  async createEntityCard(
    dashboardId: string,
    deviceId: string,
    entityValue: string,
    widgetType: string,
    sectionId: string | null
  ): Promise<SimpleDashboardEntityCardRecord> {
    const result = await this.pool.query<SimpleDashboardEntityCardRecord>(`
      INSERT INTO simple_dashboard_entity_cards (id, dashboard_id, section_id, device_id, entity_value, widget_type, sort_order)
      VALUES (
        $1, $2, $6, $3, $4, $5,
        COALESCE((SELECT MAX(sort_order) + 1 FROM simple_dashboard_entity_cards WHERE dashboard_id = $2 AND section_id IS NOT DISTINCT FROM $6), 0)
      )
      RETURNING id, dashboard_id, section_id, device_id, entity_value, widget_type, sort_order, created_at, updated_at
    `, [randomUUID(), dashboardId, deviceId, entityValue, widgetType, sectionId]);
    return result.rows[0]!;
  }

  async deleteEntityCard(dashboardId: string, cardId: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM simple_dashboard_entity_cards WHERE id = $1 AND dashboard_id = $2`,
      [cardId, dashboardId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listDashboards(): Promise<SimpleDashboardRecord[]> {
    const result = await this.pool.query<SimpleDashboardRecord>(`
      SELECT d.id, d.name, d.sort_order, d.template_id, d.template_metric_key,
             t.name AS template_name, d.created_at, d.updated_at
      FROM simple_dashboards d
      LEFT JOIN simple_dashboard_templates t ON t.id = d.template_id
      ORDER BY d.sort_order, d.created_at, d.id
    `);
    return result.rows;
  }

  async listSections(): Promise<SimpleDashboardSectionRecord[]> {
    const result = await this.pool.query<SimpleDashboardSectionRecord>(`
      SELECT id, dashboard_id, name, sort_order, created_at, updated_at
      FROM simple_dashboard_sections
      UNION ALL
      SELECT s.id, d.id AS dashboard_id, s.name, s.sort_order, s.created_at, s.updated_at
      FROM simple_dashboards d
      JOIN simple_dashboard_template_sections s ON s.template_id = d.template_id
      WHERE d.template_id IS NOT NULL
      ORDER BY dashboard_id, sort_order, created_at, id
    `);
    return result.rows;
  }

  async listCards(): Promise<SimpleDashboardCardRecord[]> {
    const result = await this.pool.query<SimpleDashboardCardRecord>(`
      SELECT id, dashboard_id, section_id, asset_metric_id, sort_order, created_at, updated_at
      FROM simple_dashboard_cards
      UNION ALL
      SELECT c.id, d.id AS dashboard_id, c.section_id, m.id AS asset_metric_id,
             c.sort_order, c.created_at, c.updated_at
      FROM simple_dashboards d
      JOIN simple_dashboard_template_cards c ON c.template_id = d.template_id
      JOIN asset_metrics m ON m.asset_id = c.asset_id AND m.metric_key = d.template_metric_key
      WHERE d.template_id IS NOT NULL
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
        RETURNING id, name, sort_order, template_id, template_metric_key, NULL::text AS template_name, created_at, updated_at
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
      RETURNING id, name, sort_order, template_id, template_metric_key, NULL::text AS template_name, created_at, updated_at
    `, [id, name]);
    return result.rows[0] ?? null;
  }

  async reorderDashboards(dashboardIds: string[]): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<{ id: string; template_id: string | null }>(`
        SELECT id, template_id FROM simple_dashboards ORDER BY sort_order, created_at, id FOR UPDATE
      `);
      const existingIds = existing.rows.map(row => row.id);
      if (existingIds.length !== dashboardIds.length || existingIds.some(id => !dashboardIds.includes(id))) {
        await client.query("ROLLBACK");
        return false;
      }
      const byId = new Map(existing.rows.map(row => [row.id, row]));
      let standardSortOrder = 0;
      for (const dashboardId of dashboardIds) {
        const dashboard = byId.get(dashboardId);
        if (!dashboard || dashboard.template_id) continue;
        await client.query(`UPDATE simple_dashboards SET sort_order = $2, updated_at = NOW() WHERE id = $1`, [dashboardId, standardSortOrder]);
        standardSortOrder += 1;
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

  async dashboardIsEditable(id: string): Promise<boolean> {
    const result = await this.pool.query(
      "SELECT 1 FROM simple_dashboards WHERE id = $1 AND template_id IS NULL",
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

  async listTemplates(): Promise<SimpleDashboardTemplateRecord[]> {
    const result = await this.pool.query<SimpleDashboardTemplateRecord>(`
      SELECT id, name, created_at, updated_at
      FROM simple_dashboard_templates
      ORDER BY LOWER(name), created_at, id
    `);
    return result.rows;
  }

  async listTemplateSections(): Promise<SimpleDashboardTemplateSectionRecord[]> {
    const result = await this.pool.query<SimpleDashboardTemplateSectionRecord>(`
      SELECT id, template_id, name, sort_order, created_at, updated_at
      FROM simple_dashboard_template_sections
      ORDER BY template_id, sort_order, created_at, id
    `);
    return result.rows;
  }

  async listTemplateCards(): Promise<SimpleDashboardTemplateCardRecord[]> {
    const result = await this.pool.query<SimpleDashboardTemplateCardRecord>(`
      SELECT id, template_id, section_id, asset_id, sort_order, created_at, updated_at
      FROM simple_dashboard_template_cards
      ORDER BY template_id, section_id, sort_order, created_at, id
    `);
    return result.rows;
  }

  async createTemplate(name: string): Promise<SimpleDashboardTemplateRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<SimpleDashboardTemplateRecord>(`
        INSERT INTO simple_dashboard_templates (name)
        VALUES ($1)
        RETURNING id, name, created_at, updated_at
      `, [name]);
      const template = result.rows[0]!;
      await client.query(`
        INSERT INTO simple_dashboard_template_sections (template_id, name, sort_order)
        VALUES ($1, 'General', 0)
      `, [template.id]);
      await client.query("COMMIT");
      return template;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async renameTemplate(id: string, name: string): Promise<SimpleDashboardTemplateRecord | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<SimpleDashboardTemplateRecord>(`
        UPDATE simple_dashboard_templates SET name = $2, updated_at = NOW()
        WHERE id = $1
        RETURNING id, name, created_at, updated_at
      `, [id, name]);
      const template = result.rows[0];
      if (!template) {
        await client.query("ROLLBACK");
        return null;
      }

      const instances = await client.query<{ id: string; template_metric_key: string }>(`
        SELECT id, template_metric_key
        FROM simple_dashboards
        WHERE template_id = $1 AND template_metric_key IS NOT NULL
        ORDER BY sort_order, created_at, id
        FOR UPDATE
      `, [id]);
      for (const instance of instances.rows) {
        const baseName = `${name} - ${instance.template_metric_key}`;
        let dashboardName = baseName;
        let suffix = 2;
        while ((await client.query(`SELECT 1 FROM simple_dashboards WHERE LOWER(name) = LOWER($1) AND id <> $2`, [dashboardName, instance.id])).rowCount) {
          dashboardName = `${baseName} (${suffix})`;
          suffix += 1;
        }
        await client.query(`UPDATE simple_dashboards SET name = $2, updated_at = NOW() WHERE id = $1`, [instance.id, dashboardName]);
      }

      await client.query("COMMIT");
      return template;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteTemplate(id: string): Promise<boolean> {
    const result = await this.pool.query(`DELETE FROM simple_dashboard_templates WHERE id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async templateExists(id: string): Promise<boolean> {
    const result = await this.pool.query(`SELECT 1 FROM simple_dashboard_templates WHERE id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async createTemplateSection(templateId: string, name: string): Promise<SimpleDashboardTemplateSectionRecord> {
    const result = await this.pool.query<SimpleDashboardTemplateSectionRecord>(`
      INSERT INTO simple_dashboard_template_sections (template_id, name, sort_order)
      VALUES ($1, $2, COALESCE((SELECT MAX(sort_order) + 1 FROM simple_dashboard_template_sections WHERE template_id = $1), 0))
      RETURNING id, template_id, name, sort_order, created_at, updated_at
    `, [templateId, name]);
    return result.rows[0]!;
  }

  async renameTemplateSection(templateId: string, sectionId: string, name: string): Promise<SimpleDashboardTemplateSectionRecord | null> {
    const result = await this.pool.query<SimpleDashboardTemplateSectionRecord>(`
      UPDATE simple_dashboard_template_sections SET name = $3, updated_at = NOW()
      WHERE id = $1 AND template_id = $2
      RETURNING id, template_id, name, sort_order, created_at, updated_at
    `, [sectionId, templateId, name]);
    return result.rows[0] ?? null;
  }

  async deleteTemplateSection(templateId: string, sectionId: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query<{ id: string }>(`
        SELECT id FROM simple_dashboard_template_sections
        WHERE id = $1 AND template_id = $2 FOR UPDATE
      `, [sectionId, templateId]);
      if (!found.rows[0]) {
        await client.query("ROLLBACK");
        return false;
      }
      const replacement = await client.query<{ id: string }>(`
        SELECT id FROM simple_dashboard_template_sections
        WHERE template_id = $1 AND id <> $2
        ORDER BY sort_order, created_at, id LIMIT 1 FOR UPDATE
      `, [templateId, sectionId]);
      if (replacement.rows[0]) {
        await client.query(`
          UPDATE simple_dashboard_template_cards SET section_id = $3, updated_at = NOW()
          WHERE template_id = $1 AND section_id = $2
        `, [templateId, sectionId, replacement.rows[0].id]);
        await client.query(`DELETE FROM simple_dashboard_template_sections WHERE id = $1 AND template_id = $2`, [sectionId, templateId]);
      } else {
        await client.query(`
          UPDATE simple_dashboard_template_sections SET name = 'General', sort_order = 0, updated_at = NOW()
          WHERE id = $1 AND template_id = $2
        `, [sectionId, templateId]);
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

  async reorderTemplateSections(templateId: string, sectionIds: string[]): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<{ id: string }>(`
        SELECT id FROM simple_dashboard_template_sections
        WHERE template_id = $1 ORDER BY sort_order, created_at, id FOR UPDATE
      `, [templateId]);
      const existingIds = existing.rows.map(row => row.id);
      if (existingIds.length !== sectionIds.length || existingIds.some(id => !sectionIds.includes(id))) {
        await client.query("ROLLBACK");
        return false;
      }
      for (let index = 0; index < sectionIds.length; index += 1) {
        await client.query(`UPDATE simple_dashboard_template_sections SET sort_order = $3, updated_at = NOW() WHERE template_id = $1 AND id = $2`, [templateId, sectionIds[index], index]);
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

  async reorderTemplateCards(templateId: string, cardIds: string[]): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<{ id: string }>(`
        SELECT id FROM simple_dashboard_template_cards
        WHERE template_id = $1 ORDER BY sort_order, created_at, id FOR UPDATE
      `, [templateId]);
      const existingIds = existing.rows.map(row => row.id);
      if (existingIds.length !== cardIds.length || existingIds.some(id => !cardIds.includes(id))) {
        await client.query("ROLLBACK");
        return false;
      }
      for (let index = 0; index < cardIds.length; index += 1) {
        await client.query(`UPDATE simple_dashboard_template_cards SET sort_order = $3, updated_at = NOW() WHERE template_id = $1 AND id = $2`, [templateId, cardIds[index], index]);
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


  async assetExists(assetId: string): Promise<boolean> {
    const result = await this.pool.query(`SELECT 1 FROM assets WHERE id = $1`, [assetId]);
    return (result.rowCount ?? 0) > 0;
  }

  async createTemplateCard(templateId: string, sectionId: string, assetId: string): Promise<SimpleDashboardTemplateCardRecord> {
    const result = await this.pool.query<SimpleDashboardTemplateCardRecord>(`
      INSERT INTO simple_dashboard_template_cards (template_id, section_id, asset_id, sort_order)
      VALUES ($1, $2, $3, COALESCE((SELECT MAX(sort_order) + 1 FROM simple_dashboard_template_cards WHERE template_id = $1 AND section_id = $2), 0))
      RETURNING id, template_id, section_id, asset_id, sort_order, created_at, updated_at
    `, [templateId, sectionId, assetId]);
    return result.rows[0]!;
  }

  async deleteTemplateCard(templateId: string, cardId: string): Promise<boolean> {
    const result = await this.pool.query(`
      DELETE FROM simple_dashboard_template_cards WHERE id = $1 AND template_id = $2
    `, [cardId, templateId]);
    return (result.rowCount ?? 0) > 0;
  }

  async createTemplateInstances(templateId: string, metricKeys: string[]): Promise<SimpleDashboardRecord[]> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const templateResult = await client.query<{ name: string }>(`
        SELECT name FROM simple_dashboard_templates WHERE id = $1 FOR UPDATE
      `, [templateId]);
      if (!templateResult.rows[0]) {
        await client.query("ROLLBACK");
        return [];
      }

      const desiredMetricKeys = [...new Set(metricKeys)];
      const desiredMetricSet = new Set(desiredMetricKeys);
      const existingResult = await client.query<SimpleDashboardRecord>(`
        SELECT d.id, d.name, d.sort_order, d.template_id, d.template_metric_key,
               $2::text AS template_name, d.created_at, d.updated_at
        FROM simple_dashboards d
        WHERE d.template_id = $1
        ORDER BY d.sort_order, d.created_at, d.id
        FOR UPDATE
      `, [templateId, templateResult.rows[0].name]);

      const instanceByMetric = new Map<string, SimpleDashboardRecord>();
      for (const instance of existingResult.rows) {
        const metricKey = instance.template_metric_key;
        if (!metricKey || !desiredMetricSet.has(metricKey) || instanceByMetric.has(metricKey)) {
          await client.query(`DELETE FROM simple_dashboards WHERE id = $1`, [instance.id]);
          continue;
        }
        instanceByMetric.set(metricKey, instance);
      }

      const resultRows: SimpleDashboardRecord[] = [];
      for (const [metricIndex, metricKey] of desiredMetricKeys.entries()) {
        const existing = instanceByMetric.get(metricKey);
        const baseName = `${templateResult.rows[0].name} - ${metricKey}`;
        if (existing) {
          let name = baseName;
          let suffix = 2;
          while ((await client.query(`SELECT 1 FROM simple_dashboards WHERE LOWER(name) = LOWER($1) AND id <> $2`, [name, existing.id])).rowCount) {
            name = `${baseName} (${suffix})`;
            suffix += 1;
          }
          const updated = await client.query<SimpleDashboardRecord>(`
            UPDATE simple_dashboards
            SET name = $2, sort_order = $3, updated_at = NOW()
            WHERE id = $1
            RETURNING id, name, sort_order, template_id, template_metric_key, $4::text AS template_name, created_at, updated_at
          `, [existing.id, name, metricIndex, templateResult.rows[0].name]);
          resultRows.push(updated.rows[0]!);
          continue;
        }

        let name = baseName;
        let suffix = 2;
        while ((await client.query(`SELECT 1 FROM simple_dashboards WHERE LOWER(name) = LOWER($1)`, [name])).rowCount) {
          name = `${baseName} (${suffix})`;
          suffix += 1;
        }
        const created = await client.query<SimpleDashboardRecord>(`
          INSERT INTO simple_dashboards (name, sort_order, template_id, template_metric_key)
          VALUES ($1, $2, $3, $4)
          RETURNING id, name, sort_order, template_id, template_metric_key, $5::text AS template_name, created_at, updated_at
        `, [name, metricIndex, templateId, metricKey, templateResult.rows[0].name]);
        resultRows.push(created.rows[0]!);
      }

      await client.query("COMMIT");
      return resultRows;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }



  async convertDashboardToTemplate(
    dashboardId: string,
    templateName: string,
    instanceMetricKey: string | null
  ): Promise<{ template: SimpleDashboardTemplateRecord; instance: SimpleDashboardRecord | null } | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const dashboardResult = await client.query<SimpleDashboardRecord>(`
        SELECT d.id, d.name, d.sort_order, d.template_id, d.template_metric_key,
               NULL::text AS template_name, d.created_at, d.updated_at
        FROM simple_dashboards d
        WHERE d.id = $1
        FOR UPDATE
      `, [dashboardId]);
      const dashboard = dashboardResult.rows[0];
      if (!dashboard || dashboard.template_id) {
        await client.query("ROLLBACK");
        return null;
      }

      const templateResult = await client.query<SimpleDashboardTemplateRecord>(`
        INSERT INTO simple_dashboard_templates (name)
        VALUES ($1)
        RETURNING id, name, created_at, updated_at
      `, [templateName]);
      const template = templateResult.rows[0]!;

      const sourceSections = await client.query<{ id: string; name: string; sort_order: number }>(`
        SELECT id, name, sort_order
        FROM simple_dashboard_sections
        WHERE dashboard_id = $1
        ORDER BY sort_order, created_at, id
      `, [dashboardId]);
      const sectionMap = new Map<string, string>();
      for (const section of sourceSections.rows) {
        const inserted = await client.query<{ id: string }>(`
          INSERT INTO simple_dashboard_template_sections (template_id, name, sort_order)
          VALUES ($1, $2, $3)
          RETURNING id
        `, [template.id, section.name, section.sort_order]);
        sectionMap.set(section.id, inserted.rows[0]!.id);
      }

      if (sourceSections.rows.length === 0) {
        const inserted = await client.query<{ id: string }>(`
          INSERT INTO simple_dashboard_template_sections (template_id, name, sort_order)
          VALUES ($1, 'General', 0)
          RETURNING id
        `, [template.id]);
        sectionMap.set("__general__", inserted.rows[0]!.id);
      }

      const sourceCards = await client.query<{ section_id: string | null; asset_id: string; sort_order: number }>(`
        SELECT c.section_id, m.asset_id, c.sort_order
        FROM simple_dashboard_cards c
        JOIN asset_metrics m ON m.id = c.asset_metric_id
        LEFT JOIN simple_dashboard_sections s ON s.id = c.section_id AND s.dashboard_id = c.dashboard_id
        WHERE c.dashboard_id = $1
        ORDER BY COALESCE(s.sort_order, 0), c.sort_order, c.created_at, c.id
      `, [dashboardId]);
      const seenAssets = new Set<string>();
      const nextSortBySection = new Map<string, number>();
      for (const card of sourceCards.rows) {
        if (seenAssets.has(card.asset_id)) continue;
        seenAssets.add(card.asset_id);
        const targetSectionId = card.section_id
          ? sectionMap.get(card.section_id)
          : sectionMap.get("__general__") ?? sectionMap.values().next().value;
        if (!targetSectionId) continue;
        const sortOrder = nextSortBySection.get(targetSectionId) ?? 0;
        await client.query(`
          INSERT INTO simple_dashboard_template_cards (template_id, section_id, asset_id, sort_order)
          VALUES ($1, $2, $3, $4)
        `, [template.id, targetSectionId, card.asset_id, sortOrder]);
        nextSortBySection.set(targetSectionId, sortOrder + 1);
      }

      let instance: SimpleDashboardRecord | null = null;
      if (instanceMetricKey) {
        const baseName = `${template.name} - ${instanceMetricKey}`;
        let name = baseName;
        let suffix = 2;
        while ((await client.query(`SELECT 1 FROM simple_dashboards WHERE LOWER(name) = LOWER($1)`, [name])).rowCount) {
          name = `${baseName} (${suffix})`;
          suffix += 1;
        }
        const instanceResult = await client.query<SimpleDashboardRecord>(`
          INSERT INTO simple_dashboards (name, sort_order, template_id, template_metric_key)
          VALUES ($1, COALESCE((SELECT MAX(sort_order) + 1 FROM simple_dashboards), 0), $2, $3)
          RETURNING id, name, sort_order, template_id, template_metric_key, $4::text AS template_name, created_at, updated_at
        `, [name, template.id, instanceMetricKey, template.name]);
        instance = instanceResult.rows[0] ?? null;
      }

      await client.query("COMMIT");
      return { template, instance };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async detachDashboard(id: string): Promise<SimpleDashboardRecord | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const dashboardResult = await client.query<SimpleDashboardRecord>(`
        SELECT d.id, d.name, d.sort_order, d.template_id, d.template_metric_key, t.name AS template_name, d.created_at, d.updated_at
        FROM simple_dashboards d
        LEFT JOIN simple_dashboard_templates t ON t.id = d.template_id
        WHERE d.id = $1 FOR UPDATE OF d
      `, [id]);
      const dashboard = dashboardResult.rows[0];
      if (!dashboard?.template_id || !dashboard.template_metric_key) {
        await client.query("ROLLBACK");
        return null;
      }

      const sectionResult = await client.query<{ id: string; name: string; sort_order: number }>(`
        SELECT id, name, sort_order FROM simple_dashboard_template_sections
        WHERE template_id = $1 ORDER BY sort_order, created_at, id
      `, [dashboard.template_id]);
      const sectionMap = new Map<string, string>();
      for (const section of sectionResult.rows) {
        const inserted = await client.query<{ id: string }>(`
          INSERT INTO simple_dashboard_sections (dashboard_id, name, sort_order)
          VALUES ($1, $2, $3) RETURNING id
        `, [id, section.name, section.sort_order]);
        sectionMap.set(section.id, inserted.rows[0]!.id);
      }

      const cards = await client.query<{ section_id: string; asset_metric_id: string; sort_order: number }>(`
        SELECT c.section_id, m.id AS asset_metric_id, c.sort_order
        FROM simple_dashboard_template_cards c
        JOIN asset_metrics m ON m.asset_id = c.asset_id AND m.metric_key = $2
        WHERE c.template_id = $1
        ORDER BY c.section_id, c.sort_order, c.created_at, c.id
      `, [dashboard.template_id, dashboard.template_metric_key]);
      for (const card of cards.rows) {
        const targetSectionId = sectionMap.get(card.section_id);
        if (!targetSectionId) continue;
        await client.query(`
          INSERT INTO simple_dashboard_cards (dashboard_id, section_id, asset_metric_id, sort_order)
          VALUES ($1, $2, $3, $4)
        `, [id, targetSectionId, card.asset_metric_id, card.sort_order]);
      }

      const updated = await client.query<SimpleDashboardRecord>(`
        UPDATE simple_dashboards
        SET template_id = NULL, template_metric_key = NULL, updated_at = NOW()
        WHERE id = $1
        RETURNING id, name, sort_order, template_id, template_metric_key, NULL::text AS template_name, created_at, updated_at
      `, [id]);
      await client.query("COMMIT");
      return updated.rows[0] ?? null;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

}
