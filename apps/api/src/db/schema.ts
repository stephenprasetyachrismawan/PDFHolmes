// Drizzle schema — cermin db/migrations/0001_init.sql (§9).
// Migrasi tetap dijalankan via SQL (db/migrate.mjs); ini hanya typed query layer.
import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  bigint,
  integer,
  jsonb,
  numeric,
  customType,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const aiProvider = pgEnum("ai_provider", [
  "openai",
  "anthropic",
  "google",
  "openai_compatible",
  "codex",
]);
export const aiAuthType = pgEnum("ai_auth_type", ["api_key", "oauth_codex"]);
export const docStatus = pgEnum("doc_status", [
  "uploaded",
  "extracting",
  "extracted",
  "analyzing",
  "analyzed",
  "failed",
]);
export const fieldSource = pgEnum("field_source", [
  "extracted",
  "inferred",
  "hybrid",
]);

// pgvector belum punya tipe Drizzle native -> custom (api tak menulis embedding,
// hanya analyzer Python yang menulisnya, jadi cukup didefinisikan utk select).
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(1536)";
  },
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  cognitoSub: text("cognito_sub").notNull().unique(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  preferredLanguage: text("preferred_language").notNull().default("id"),
  minioBucket: text("minio_bucket").notNull(),
  researchInterest: text("research_interest"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aiCredentials = pgTable(
  "ai_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: aiProvider("provider").notNull(),
    authType: aiAuthType("auth_type").notNull(),
    label: text("label"),
    secretCiphertext: customType<{ data: Buffer; driverData: Buffer }>({
      dataType() {
        return "bytea";
      },
    })("secret_ciphertext").notNull(),
    secretNonce: customType<{ data: Buffer; driverData: Buffer }>({
      dataType() {
        return "bytea";
      },
    })("secret_nonce").notNull(),
    model: text("model"),
    baseUrl: text("base_url"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ userIdx: index("ai_credentials_user_idx").on(t.userId) }),
);

export const folders = pgTable(
  "folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ userParentIdx: index("folders_user_parent_idx").on(t.userId, t.parentId) }),
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    folderId: uuid("folder_id"),
    originalFilename: text("original_filename").notNull(),
    objectKey: text("object_key").notNull(),
    mime: text("mime").notNull().default("application/pdf"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    pageCount: integer("page_count"),
    contentHash: text("content_hash"),
    status: docStatus("status").notNull().default("uploaded"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ userFolderIdx: index("documents_user_folder_idx").on(t.userId, t.folderId) }),
);

export const extractions = pgTable("extractions", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .unique()
    .references(() => documents.id, { onDelete: "cascade" }),
  fullText: text("full_text"),
  teiXml: text("tei_xml"),
  sections: jsonb("sections"),
  metadata: jsonb("metadata"),
  extractorVersion: text("extractor_version"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const analyses = pgTable(
  "analyses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    language: text("language").notNull(),
    provider: aiProvider("provider"),
    model: text("model"),
    status: docStatus("status").notNull().default("analyzing"),
    tokenUsage: jsonb("token_usage"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ docIdx: index("analyses_document_idx").on(t.documentId) }),
);

export const analysisSections = pgTable(
  "analysis_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    analysisId: uuid("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    fieldKey: text("field_key").notNull(),
    label: text("label").notNull(),
    contentMd: text("content_md"),
    source: fieldSource("source").notNull().default("inferred"),
    confidence: numeric("confidence", { precision: 3, scale: 2 }),
    orderIndex: integer("order_index").notNull(),
    embedding: vector("embedding"),
  },
  (t) => ({
    analysisIdx: index("analysis_sections_analysis_idx").on(t.analysisId),
    uniqField: uniqueIndex("analysis_sections_unique_field").on(t.analysisId, t.fieldKey),
  }),
);

export type DbUser = typeof users.$inferSelect;
export type DbDocument = typeof documents.$inferSelect;
export type DbFolder = typeof folders.$inferSelect;
export type DbAnalysis = typeof analyses.$inferSelect;
export type DbAnalysisSection = typeof analysisSections.$inferSelect;
