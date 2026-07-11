import { pgTable, text, serial, timestamp, boolean, integer, uniqueIndex } from "drizzle-orm/pg-core";

export const chatPollsTable = pgTable("chat_polls", {
  id: serial("id").primaryKey(),
  question: text("question").notNull(),
  /** JSON string[] */
  options: text("options").notNull(),
  createdBy: integer("created_by").notNull(),
  messageId: integer("message_id"),
  isClosed: boolean("is_closed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chatPollVotesTable = pgTable(
  "chat_poll_votes",
  {
    id: serial("id").primaryKey(),
    pollId: integer("poll_id").notNull(),
    userId: integer("user_id").notNull(),
    optionIndex: integer("option_index").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("chat_poll_votes_poll_user_uidx").on(t.pollId, t.userId)],
);
