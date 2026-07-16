import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../../lib/logger";

let ready = false;

/** WhatsApp tabloları + listings WA kolonları — Railway Variables / drizzle push olmadan da ayaga kalksin. */
export async function ensureWhatsAppDbSchema(): Promise<void> {
  if (ready) return;
  try {
    await db.execute(sql`ALTER TABLE listings ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ`);
    await db.execute(sql`ALTER TABLE listings ADD COLUMN IF NOT EXISTS content_hash TEXT`);
    await db.execute(sql`ALTER TABLE listings ADD COLUMN IF NOT EXISTS source_message_id TEXT`);
    await db.execute(sql`ALTER TABLE listings ADD COLUMN IF NOT EXISTS source_chat_id TEXT`);
    await db.execute(sql`ALTER TABLE listings ADD COLUMN IF NOT EXISTS source_message_timestamp BIGINT`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS listings_content_hash_idx ON listings (content_hash)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS listings_source_message_id_idx ON listings (source_message_id)`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS whatsapp_sessions (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'IDLE',
        connection_mode TEXT,
        phone_masked TEXT,
        last_error TEXT,
        client_instance_id TEXT,
        ready_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS whatsapp_sources (
        id SERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        chat_name TEXT NOT NULL,
        source_type TEXT NOT NULL DEFAULT 'group',
        is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        initial_scan_status TEXT NOT NULL DEFAULT 'pending',
        initial_scan_started_at TIMESTAMPTZ,
        initial_scan_completed_at TIMESTAMPTZ,
        oldest_reached_at TIMESTAMPTZ,
        latest_scanned_message_id TEXT,
        latest_scanned_timestamp BIGINT,
        latest_scanned_at TIMESTAMPTZ,
        last_error TEXT,
        legacy_source_id INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_sources_session_chat_uidx ON whatsapp_sources (session_id, chat_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS whatsapp_sources_enabled_idx ON whatsapp_sources (is_enabled)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS whatsapp_sources_scan_status_idx ON whatsapp_sources (initial_scan_status)`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS whatsapp_processed_messages (
        id SERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        message_timestamp BIGINT NOT NULL,
        processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        result TEXT NOT NULL,
        job_posting_id INTEGER,
        content_hash TEXT
      )
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_processed_msg_uidx ON whatsapp_processed_messages (session_id, chat_id, message_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS whatsapp_processed_hash_idx ON whatsapp_processed_messages (content_hash)`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS whatsapp_scan_jobs (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        source_id INTEGER,
        status TEXT NOT NULL DEFAULT 'PENDING',
        attempts INTEGER NOT NULL DEFAULT 0,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS whatsapp_scan_jobs_status_idx ON whatsapp_scan_jobs (status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS whatsapp_scan_jobs_source_idx ON whatsapp_scan_jobs (source_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS whatsapp_scan_jobs_type_idx ON whatsapp_scan_jobs (type)`);

    ready = true;
    logger.info("wa: db schema ensured");
  } catch (err) {
    logger.error({ err }, "wa: db schema ensure failed");
    throw err;
  }
}
