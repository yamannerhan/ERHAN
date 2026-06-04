import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

export const telegramSessionsTable = pgTable("telegram_sessions", {
  id: serial("id").primaryKey(),
  sessionString: text("session_string"),
  phone: text("phone"),
  authState: text("auth_state").notNull().default("disconnected"),
  phoneCodeHash: text("phone_code_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
