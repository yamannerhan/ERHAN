import { pgTable, text, serial, timestamp, boolean, integer, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/** Kullanıcıya bağlı şirket profili — logo/ad bir kez kaydedilir, tüm ilanlarda kullanılır */
export const companyProfilesTable = pgTable(
  "company_profiles",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    companyName: text("company_name").notNull(),
    legalName: text("legal_name"),
    logoPath: text("logo_path"),
    description: text("description"),
    website: text("website"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    city: text("city"),
    district: text("district"),
    isVerified: boolean("is_verified").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("company_profiles_user_id_uidx").on(t.userId),
    index("company_profiles_company_name_idx").on(t.companyName),
    index("company_profiles_is_verified_idx").on(t.isVerified),
  ],
);

export const insertCompanyProfileSchema = createInsertSchema(companyProfilesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCompanyProfile = z.infer<typeof insertCompanyProfileSchema>;
export type CompanyProfile = typeof companyProfilesTable.$inferSelect;
