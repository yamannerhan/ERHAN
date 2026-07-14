import { pgTable, text, serial, timestamp, boolean, integer, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/** Hazır marka firmaları — bot ilanlarına otomatik logo */
export const knownCompaniesTable = pgTable(
  "known_companies",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    logoUrl: text("logo_url"),
    /** Kalıcı WEBP (base64, data: öneki yok) — deploy sonrası kaybolmaz */
    logoData: text("logo_data"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("known_companies_slug_uidx").on(t.slug),
    index("known_companies_name_idx").on(t.name),
  ],
);

export const knownCompanyAliasesTable = pgTable(
  "known_company_aliases",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").notNull(),
    alias: text("alias").notNull(),
    normalizedAlias: text("normalized_alias").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("known_company_aliases_norm_uidx").on(t.normalizedAlias),
    index("known_company_aliases_company_idx").on(t.companyId),
  ],
);

export const insertKnownCompanySchema = createInsertSchema(knownCompaniesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertKnownCompany = z.infer<typeof insertKnownCompanySchema>;
export type KnownCompany = typeof knownCompaniesTable.$inferSelect;
