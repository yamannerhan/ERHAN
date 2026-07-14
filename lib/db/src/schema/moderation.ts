import {
  pgTable, text, serial, timestamp, boolean, integer, jsonb, index, uniqueIndex,
} from "drizzle-orm/pg-core";

/** Permission catalog */
export const permissionsTable = pgTable(
  "permissions",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull().unique(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const rolePermissionsTable = pgTable(
  "role_permissions",
  {
    id: serial("id").primaryKey(),
    role: text("role").notNull(),
    permissionKey: text("permission_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("role_permissions_unique").on(t.role, t.permissionKey),
    index("role_permissions_role_idx").on(t.role),
  ],
);

export const moderationReportsTable = pgTable(
  "moderation_reports",
  {
    id: serial("id").primaryKey(),
    targetType: text("target_type").notNull(), // listing | comment | company | message | user
    targetId: integer("target_id").notNull(),
    reporterUserId: integer("reporter_user_id"),
    reason: text("reason").notNull(),
    reasonCode: text("reason_code"),
    status: text("status").notNull().default("pending"), // pending | investigating | resolved | rejected | escalated
    priority: text("priority").notNull().default("normal"), // low | normal | high | urgent
    assignedModeratorId: integer("assigned_moderator_id"),
    resolvedById: integer("resolved_by_id"),
    resolutionNote: text("resolution_note"),
    titleSnapshot: text("title_snapshot"),
    contentSnapshot: text("content_snapshot"),
    imageUrl: text("image_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    index("mod_reports_status_idx").on(t.status),
    index("mod_reports_target_idx").on(t.targetType, t.targetId),
    index("mod_reports_created_idx").on(t.createdAt),
    index("mod_reports_assigned_idx").on(t.assignedModeratorId),
  ],
);

export const moderationActionsTable = pgTable(
  "moderation_actions",
  {
    id: serial("id").primaryKey(),
    reportId: integer("report_id"),
    actorUserId: integer("actor_user_id").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: integer("target_id"),
    reason: text("reason"),
    meta: jsonb("meta").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("mod_actions_report_idx").on(t.reportId),
    index("mod_actions_actor_idx").on(t.actorUserId),
  ],
);

export const moderationNotesTable = pgTable(
  "moderation_notes",
  {
    id: serial("id").primaryKey(),
    reportId: integer("report_id").notNull(),
    authorId: integer("author_id").notNull(),
    note: text("note").notNull(),
    isInternal: boolean("is_internal").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("mod_notes_report_idx").on(t.reportId)],
);

export const moderationAssignmentsTable = pgTable(
  "moderation_assignments",
  {
    id: serial("id").primaryKey(),
    reportId: integer("report_id").notNull(),
    moderatorId: integer("moderator_id").notNull(),
    assignedById: integer("assigned_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("mod_assign_report_idx").on(t.reportId)],
);

export const userWarningsTable = pgTable(
  "user_warnings",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    issuedById: integer("issued_by_id").notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("user_warnings_user_idx").on(t.userId)],
);

export const userSuspensionsTable = pgTable(
  "user_suspensions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    issuedById: integer("issued_by_id").notNull(),
    reason: text("reason").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    liftedById: integer("lifted_by_id"),
    liftedAt: timestamp("lifted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("user_suspensions_user_idx").on(t.userId),
    index("user_suspensions_active_idx").on(t.isActive),
  ],
);

export const blacklistEntriesTable = pgTable(
  "blacklist_entries",
  {
    id: serial("id").primaryKey(),
    entryType: text("entry_type").notNull(), // phone | email | ip | domain | company | word | url
    value: text("value").notNull(),
    reason: text("reason"),
    createdById: integer("created_by_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("blacklist_type_idx").on(t.entryType),
    index("blacklist_value_idx").on(t.value),
  ],
);

export const filteredWordsTable = pgTable(
  "filtered_words",
  {
    id: serial("id").primaryKey(),
    word: text("word").notNull(),
    category: text("category").notNull().default("custom"),
    action: text("action").notNull().default("log"), // hide | review | warn | block | log
    isRegex: boolean("is_regex").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdById: integer("created_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index("filtered_words_word_idx").on(t.word)],
);

export const deviceSessionsTable = pgTable(
  "device_sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    deviceId: text("device_id"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    country: text("country"),
    city: text("city"),
    os: text("os"),
    browser: text("browser"),
    riskScore: integer("risk_score").notNull().default(0),
    isFlagged: boolean("is_flagged").notNull().default(false),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("device_sessions_user_idx").on(t.userId),
    index("device_sessions_ip_idx").on(t.ip),
  ],
);

export const ipActivityLogsTable = pgTable(
  "ip_activity_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id"),
    ip: text("ip").notNull(),
    deviceId: text("device_id"),
    action: text("action"),
    path: text("path"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ip_activity_ip_idx").on(t.ip),
    index("ip_activity_user_idx").on(t.userId),
  ],
);

export const riskFlagsTable = pgTable(
  "risk_flags",
  {
    id: serial("id").primaryKey(),
    targetType: text("target_type").notNull(),
    targetId: integer("target_id"),
    targetValue: text("target_value"),
    flag: text("flag").notNull(),
    severity: text("severity").notNull().default("medium"),
    createdById: integer("created_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const auditLogsTable = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    actorUserId: integer("actor_user_id"),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: integer("target_id"),
    previousData: jsonb("previous_data").$type<unknown>(),
    newData: jsonb("new_data").$type<unknown>(),
    reason: text("reason"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    requestId: text("request_id"),
    success: boolean("success").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_actor_idx").on(t.actorUserId),
    index("audit_logs_action_idx").on(t.action),
    index("audit_logs_created_idx").on(t.createdAt),
    index("audit_logs_target_idx").on(t.targetType, t.targetId),
  ],
);

export const moderatorSupportTicketsTable = pgTable(
  "moderator_support_tickets",
  {
    id: serial("id").primaryKey(),
    authorId: integer("author_id").notNull(),
    subject: text("subject").notNull(),
    category: text("category").notNull().default("other"),
    priority: text("priority").notNull().default("normal"),
    description: text("description").notNull(),
    screenshotUrl: text("screenshot_url"),
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index("mod_support_author_idx").on(t.authorId)],
);

export const announcementTargetsTable = pgTable(
  "announcement_targets",
  {
    id: serial("id").primaryKey(),
    announcementId: integer("announcement_id").notNull(),
    targetType: text("target_type").notNull(), // all | jobseekers | companies | moderators | city | users
    targetValue: text("target_value"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("announcement_targets_ann_idx").on(t.announcementId)],
);
