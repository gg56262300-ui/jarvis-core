import { databaseProvider } from '../shared/database/index.js';
import type { CrmLead, CrmLeadMessage, CrmLeadSource, ReminderEvent } from './crm.types.js';

type CreateLeadInput = {
  source: 'whatsapp' | 'manual' | 'web';
  phone: string;
  name?: string | null;
  tag?: string | null;
  notes?: string | null;
  projectCode?: string | null;
  city?: string | null;
  serviceType?: string | null;
};

type AddLeadMessageInput = {
  leadId: number;
  channel: 'whatsapp';
  direction: 'inbound';
  message: string;
};

type AddReminderEventInput = {
  reminderId: number;
  eventType: 'queued' | 'processed';
  payload: string;
};

type CrmLeadRow = {
  id: number;
  source: string;
  phone: string;
  name: string | null;
  tag: string | null;
  notes: string | null;
  project_code: string | null;
  city: string | null;
  service_type: string | null;
  created_at: string;
  updated_at: string;
};

type CrmLeadMessageRow = {
  id: number;
  lead_id: number;
  channel: 'whatsapp';
  direction: 'inbound';
  message: string;
  created_at: string;
};

type UpsertLeadResult = {
  lead: CrmLead;
  isNewLead: boolean;
};

type ReminderEventRow = {
  id: number;
  reminder_id: number;
  event_type: 'queued' | 'processed';
  payload: string;
  created_at: string;
};

export class CrmService {
  listAccounts() {
    return [];
  }

  initialize() {
    databaseProvider
      .prepare(`
        CREATE TABLE IF NOT EXISTS crm_leads (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source TEXT NOT NULL,
          phone TEXT NOT NULL UNIQUE,
          name TEXT,
          tag TEXT,
          notes TEXT,
          project_code TEXT,
          city TEXT,
          service_type TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `)
      .run();

    try {
      databaseProvider.prepare(`ALTER TABLE crm_leads ADD COLUMN project_code TEXT`).run();
    } catch {
      // Column may already exist from an earlier schema version.
    }

    try {
      databaseProvider.prepare(`ALTER TABLE crm_leads ADD COLUMN city TEXT`).run();
    } catch {
      // Column may already exist from an earlier schema version.
    }

    try {
      databaseProvider.prepare(`ALTER TABLE crm_leads ADD COLUMN service_type TEXT`).run();
    } catch {
      // Column may already exist from an earlier schema version.
    }


    databaseProvider
      .prepare(`
        CREATE TABLE IF NOT EXISTS crm_lead_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          lead_id INTEGER NOT NULL,
          channel TEXT NOT NULL,
          direction TEXT NOT NULL,
          message TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (lead_id) REFERENCES crm_leads(id)
        )
      `)
      .run();

    databaseProvider
      .prepare(`
        CREATE TABLE IF NOT EXISTS reminder_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          reminder_id INTEGER NOT NULL,
          event_type TEXT NOT NULL,
          payload TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `)
      .run();
  }

  createLead(input: CreateLeadInput): CrmLead {
    return this.upsertLead(input).lead;
  }

  upsertLead(input: CreateLeadInput): UpsertLeadResult {
    this.initialize();
    const now = new Date().toISOString();

    const existing = databaseProvider
      .prepare<{ phone: string }, CrmLeadRow>(`
        SELECT id, source, phone, name, tag, notes, project_code, city, service_type, created_at, updated_at
        FROM crm_leads
        WHERE phone = @phone
      `)
      .get({ phone: input.phone });

    if (existing) {
      databaseProvider
        .prepare<{
          id: number;
          name: string | null;
          tag: string | null;
          notes: string | null;
          project_code: string | null;
          city: string | null;
          service_type: string | null;
          updated_at: string;
        }, never>(`
          UPDATE crm_leads
          SET name = COALESCE(@name, name),
              tag = COALESCE(@tag, tag),
              notes = COALESCE(@notes, notes),
              project_code = COALESCE(@project_code, project_code),
              city = COALESCE(@city, city),
              service_type = COALESCE(@service_type, service_type),
              updated_at = @updated_at
          WHERE id = @id
        `)
        .run({
          id: existing.id,
          name: input.name ?? null,
          tag: input.tag ?? null,
          notes: input.notes ?? null,
          project_code: input.projectCode ?? null,
          city: input.city ?? null,
          service_type: input.serviceType ?? null,
          updated_at: now,
        });

      return {
        lead: this.getLeadById(existing.id),
        isNewLead: false,
      };
    }

    const result = databaseProvider
      .prepare<{
        source: string;
        phone: string;
        name: string | null;
        tag: string | null;
        notes: string | null;
        project_code: string | null;
        city: string | null;
        service_type: string | null;
        created_at: string;
        updated_at: string;
      }, never>(`
        INSERT INTO crm_leads (source, phone, name, tag, notes, project_code, city, service_type, created_at, updated_at)
        VALUES (@source, @phone, @name, @tag, @notes, @project_code, @city, @service_type, @created_at, @updated_at)
      `)
      .run({
        source: input.source,
        phone: input.phone,
        name: input.name ?? null,
        tag: input.tag ?? null,
        notes: input.notes ?? null,
        project_code: input.projectCode ?? null,
        city: input.city ?? null,
        service_type: input.serviceType ?? null,
        created_at: now,
        updated_at: now,
      });

    return {
      lead: this.getLeadById(Number(result.lastInsertRowid)),
      isNewLead: true,
    };
  }

  addLeadMessage(input: AddLeadMessageInput): CrmLeadMessage {
    this.initialize();
    const now = new Date().toISOString();

    const result = databaseProvider
      .prepare<{
        lead_id: number;
        channel: 'whatsapp';
        direction: 'inbound';
        message: string;
        created_at: string;
      }, never>(`
        INSERT INTO crm_lead_messages (lead_id, channel, direction, message, created_at)
        VALUES (@lead_id, @channel, @direction, @message, @created_at)
      `)
      .run({
        lead_id: input.leadId,
        channel: input.channel,
        direction: input.direction,
        message: input.message,
        created_at: now,
      });

    return this.getLeadMessageById(Number(result.lastInsertRowid));
  }

  addReminderEvent(input: AddReminderEventInput): ReminderEvent {
    this.initialize();
    const now = new Date().toISOString();

    const result = databaseProvider
      .prepare<{
        reminder_id: number;
        event_type: 'queued' | 'processed';
        payload: string;
        created_at: string;
      }, never>(`
        INSERT INTO reminder_events (reminder_id, event_type, payload, created_at)
        VALUES (@reminder_id, @event_type, @payload, @created_at)
      `)
      .run({
        reminder_id: input.reminderId,
        event_type: input.eventType,
        payload: input.payload,
        created_at: now,
      });

    return this.getReminderEventById(Number(result.lastInsertRowid));
  }

  listReminderEvents(reminderId: number): ReminderEvent[] {
    this.initialize();

    const rows = databaseProvider
      .prepare<{ reminder_id: number }, ReminderEventRow>(`
        SELECT id, reminder_id, event_type, payload, created_at
        FROM reminder_events
        WHERE reminder_id = @reminder_id
        ORDER BY id DESC
      `)
      .all({ reminder_id: reminderId });

    return rows.map((row) => this.mapReminderEvent(row));
  }

  listLeadMessages(leadId: number): CrmLeadMessage[] {
    this.initialize();

    const rows = databaseProvider
      .prepare<{ lead_id: number }, CrmLeadMessageRow>(`
        SELECT id, lead_id, channel, direction, message, created_at
        FROM crm_lead_messages
        WHERE lead_id = @lead_id
        ORDER BY id DESC
      `)
      .all({ lead_id: leadId });

    return rows.map((row) => this.mapLeadMessage(row));
  }

  listLeads(): CrmLead[] {
    this.initialize();

    const rows = databaseProvider
      .prepare<Record<string, never>, CrmLeadRow>(`
        SELECT id, source, phone, name, tag, notes, project_code, city, service_type, created_at, updated_at
        FROM crm_leads
        ORDER BY id DESC
      `)
      .all();

    return rows.map((row) => this.mapLead(row));
  }

  private getLeadById(id: number): CrmLead {
    const row = databaseProvider
      .prepare<{ id: number }, CrmLeadRow>(`
        SELECT id, source, phone, name, tag, notes, project_code, city, service_type, created_at, updated_at
        FROM crm_leads
        WHERE id = @id
      `)
      .get({ id });

    if (!row) {
      throw new Error(`CRM lead not found: ${id}`);
    }

    return this.mapLead(row);
  }

  private getLeadMessageById(id: number): CrmLeadMessage {
    const row = databaseProvider
      .prepare<{ id: number }, CrmLeadMessageRow>(`
        SELECT id, lead_id, channel, direction, message, created_at
        FROM crm_lead_messages
        WHERE id = @id
      `)
      .get({ id });

    if (!row) {
      throw new Error(`CRM lead message not found: ${id}`);
    }

    return this.mapLeadMessage(row);
  }

  private getReminderEventById(id: number): ReminderEvent {
    const row = databaseProvider
      .prepare<{ id: number }, ReminderEventRow>(`
        SELECT id, reminder_id, event_type, payload, created_at
        FROM reminder_events
        WHERE id = @id
      `)
      .get({ id });

    if (!row) {
      throw new Error(`Reminder event not found: ${id}`);
    }

    return this.mapReminderEvent(row);
  }

  private normalizeLeadSource(value: string): CrmLeadSource {
    if (value === 'whatsapp' || value === 'manual' || value === 'web') {
      return value;
    }
    return 'manual';
  }

  private mapLead(row: CrmLeadRow): CrmLead {
    return {
      id: row.id,
      source: this.normalizeLeadSource(row.source),
      phone: row.phone,
      name: row.name,
      tag: row.tag,
      notes: row.notes,
      projectCode: row.project_code,
      city: row.city,
      serviceType: row.service_type,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapLeadMessage(row: CrmLeadMessageRow): CrmLeadMessage {
    return {
      id: row.id,
      leadId: row.lead_id,
      channel: row.channel,
      direction: row.direction,
      message: row.message,
      createdAt: row.created_at,
    };
  }

  private mapReminderEvent(row: ReminderEventRow): ReminderEvent {
    return {
      id: row.id,
      reminderId: row.reminder_id,
      eventType: row.event_type,
      payload: row.payload,
      createdAt: row.created_at,
    };
  }
}
