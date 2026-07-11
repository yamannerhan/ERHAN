import { pgTable, text, serial, timestamp, integer, boolean, uniqueIndex } from "drizzle-orm/pg-core";

/** Tarayıcı / PWA Web Push abonelikleri */
export const pushSubscriptionsTable = pgTable(
  "push_subscriptions",
  {
    id: serial("id").primaryKey(),
    /** Giriş yapmışsa user id; anonim ziyaretçi null */
    userId: integer("user_id"),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("push_subscriptions_endpoint_uidx").on(t.endpoint)],
);

/** Zamanlanmış / anlık push gönderim kaydı */
export const pushCampaignsTable = pgTable("push_campaigns", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  url: text("url"),
  /** instant | daily | weekly | monthly */
  schedule: text("schedule").notNull().default("instant"),
  sentCount: integer("sent_count").notNull().default(0),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});
