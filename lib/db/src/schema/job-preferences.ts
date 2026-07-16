import { pgTable, serial, integer, text, boolean, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";

/** Kullanıcı “Bana Uygun İşler” tercihleri — users tablosundan ayrı */
export const userJobPreferencesTable = pgTable(
  "user_job_preferences",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    preferredCities: jsonb("preferred_cities").$type<string[]>().notNull().default([]),
    preferredDistricts: jsonb("preferred_districts").$type<string[]>().notNull().default([]),
    nearbyDistrictsEnabled: boolean("nearby_districts_enabled").notNull().default(true),
    /** 5 | 10 | 20 | 30 | 50 | null (= mesafe önemli değil) */
    maximumDistance: integer("maximum_distance"),
    /** armed | unarmed | renewing | none | has_card — çoklu */
    securityLicenseTypes: jsonb("security_license_types").$type<string[]>().notNull().default([]),
    securityLicenseExpiry: text("security_license_expiry"),
    employmentTypes: jsonb("employment_types").$type<string[]>().notNull().default([]),
    shiftPreferences: jsonb("shift_preferences").$type<string[]>().notNull().default([]),
    projectTypes: jsonb("project_types").$type<string[]>().notNull().default([]),
    minimumSalary: integer("minimum_salary"),
    benefits: jsonb("benefits").$type<string[]>().notNull().default([]),
    experienceLevel: text("experience_level"),
    preferredRoles: jsonb("preferred_roles").$type<string[]>().notNull().default([]),
    drivingLicense: boolean("driving_license").notNull().default(false),
    drivingLicenseType: text("driving_license_type"),
    drivesActively: boolean("drives_actively").notNull().default(false),
    srcCertificate: boolean("src_certificate").notNull().default(false),
    militaryStatus: text("military_status"),
    height: text("height"),
    weight: text("weight"),
    educationLevel: text("education_level"),
    experienceYears: text("experience_years"),
    preferencesCompleted: boolean("preferences_completed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("user_job_preferences_user_uidx").on(t.userId),
    index("user_job_preferences_completed_idx").on(t.preferencesCompleted),
  ],
);

export type UserJobPreference = typeof userJobPreferencesTable.$inferSelect;
export type InsertUserJobPreference = typeof userJobPreferencesTable.$inferInsert;
