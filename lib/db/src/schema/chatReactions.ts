import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";

export const chatReactionsTable = pgTable("chat_reactions", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull(),
  userId: integer("user_id").notNull(),
  emoji: text("emoji").notNull(),
  username: text("username").notNull(),
  displayName: text("display_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.messageId, t.userId, t.emoji),
]);

export type ChatReaction = typeof chatReactionsTable.$inferSelect;
