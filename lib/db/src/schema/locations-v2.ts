import {
  pgTable, text, serial, timestamp, boolean, integer, jsonb, real, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/** OSM / Geofabrik konum hiyerarşisi — Location Classifier V2 */
export const locationsTable = pgTable(
  "locations",
  {
    id: serial("id").primaryKey(),
    osmType: text("osm_type"),
    osmId: text("osm_id"),
    locationType: text("location_type").notNull(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    provinceId: integer("province_id"),
    districtId: integer("district_id"),
    parentId: integer("parent_id"),
    adminLevel: integer("admin_level"),
    latitude: real("latitude"),
    longitude: real("longitude"),
    geometryCenter: text("geometry_center"),
    isActive: boolean("is_active").notNull().default(true),
    source: text("source").notNull().default("seed"),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("locations_normalized_name_idx").on(t.normalizedName),
    index("locations_province_id_idx").on(t.provinceId),
    index("locations_district_id_idx").on(t.districtId),
    index("locations_parent_id_idx").on(t.parentId),
    index("locations_type_idx").on(t.locationType),
    index("locations_admin_level_idx").on(t.adminLevel),
    index("locations_osm_id_idx").on(t.osmId),
    uniqueIndex("locations_osm_unique").on(t.osmType, t.osmId),
  ],
);

export const locationAliasesTable = pgTable(
  "location_aliases",
  {
    id: serial("id").primaryKey(),
    locationId: integer("location_id").notNull(),
    alias: text("alias").notNull(),
    normalizedAlias: text("normalized_alias").notNull(),
    aliasType: text("alias_type").notNull().default("name"),
    priority: integer("priority").notNull().default(0),
    isAmbiguous: boolean("is_ambiguous").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("location_aliases_norm_idx").on(t.normalizedAlias),
    index("location_aliases_location_id_idx").on(t.locationId),
  ],
);

export const jobLocationsTable = pgTable(
  "job_locations",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id").notNull(),
    locationId: integer("location_id"),
    provinceId: integer("province_id"),
    districtId: integer("district_id"),
    locationRole: text("location_role").notNull(),
    evidence: text("evidence"),
    confidence: real("confidence").notNull().default(0),
    method: text("method"),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("job_locations_job_id_idx").on(t.jobId),
    index("job_locations_location_id_idx").on(t.locationId),
    index("job_locations_role_idx").on(t.locationRole),
  ],
);

export const locationClassificationLogsTable = pgTable(
  "location_classification_logs",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id"),
    textHash: text("text_hash").notNull(),
    candidates: jsonb("candidates").$type<unknown>().notNull().default([]),
    selectedLocations: jsonb("selected_locations").$type<unknown>().notNull().default([]),
    rejectedLocations: jsonb("rejected_locations").$type<unknown>().notNull().default([]),
    confidence: real("confidence").notNull().default(0),
    status: text("status").notNull(),
    aiUsed: boolean("ai_used").notNull().default(false),
    processingTimeMs: integer("processing_time_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("loc_class_logs_job_id_idx").on(t.jobId),
    index("loc_class_logs_text_hash_idx").on(t.textHash),
  ],
);

export const unresolvedJobLocationsTable = pgTable(
  "unresolved_job_locations",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id").notNull(),
    detectedText: text("detected_text"),
    candidateLocations: jsonb("candidate_locations").$type<unknown>().default([]),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("unresolved_job_locations_job_id_idx").on(t.jobId)],
);

export const locationSyncMetaTable = pgTable("location_sync_meta", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type LocationRow = typeof locationsTable.$inferSelect;
export type LocationAliasRow = typeof locationAliasesTable.$inferSelect;
export type JobLocationRow = typeof jobLocationsTable.$inferSelect;

export const insertLocationSchema = createInsertSchema(locationsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertLocation = z.infer<typeof insertLocationSchema>;
