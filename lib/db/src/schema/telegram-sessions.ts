import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

export const telegramSessionsTable = pgTable("telegram_sessions", {
  id: serial("id").primaryKey(),
  sessionString: text("session_string"),
  phone: text("phone"),
  authState: text("auth_state").notNull().default("disconnected"),
  phoneCodeHash: text("phone_code_hash"),
  botUpdateOffset: integer("bot_update_offset").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
