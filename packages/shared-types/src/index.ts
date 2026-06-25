// Tipe TS bersama antara apps/web dan apps/api. Cermin skema DB (§9) + DTO API.

export type DocStatus =
  | "uploaded"
  | "extracting"
  | "extracted"
  | "analyzing"
  | "analyzed"
  | "failed";

export type AiProvider =
  | "openai"
  | "anthropic"
  | "google"
  | "openai_compatible"
  | "codex"
  | "opencode_go";

export type FieldSource = "extracted" | "inferred" | "hybrid";

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  preferredLanguage: string;
  minioBucket: string;
  researchInterest: string | null;
}

export interface Folder {
  id: string;
  parentId: string | null;
  name: string;
  createdAt: string;
}

export interface DocumentDto {
  id: string;
  folderId: string | null;
  originalFilename: string;
  objectKey: string;
  sizeBytes: number | null;
  pageCount: number | null;
  status: DocStatus;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnalysisSection {
  id: string;
  fieldKey: string;
  label: string;
  contentMd: string | null;
  source: FieldSource;
  confidence: number | null;
  orderIndex: number;
}

export interface Analysis {
  id: string;
  documentId: string;
  language: string;
  provider: AiProvider | null;
  model: string | null;
  status: DocStatus;
  sections: AnalysisSection[];
  startedAt: string | null;
  finishedAt: string | null;
}

// ---- Payload job di Redis (dikonsumsi worker Python) ----
export interface ExtractJob {
  type: "EXTRACT";
  documentId: string;
  userId: string;
}

export interface AnalyzeJob {
  type: "ANALYZE";
  documentId: string;
  userId: string;
  language: string;
}

export type Job = ExtractJob | AnalyzeJob;

// ---- Event SSE status (api -> web) ----
export interface StatusEvent {
  documentId: string;
  status: DocStatus;
  error?: string;
  fieldKey?: string; // field yang baru terisi (streaming)
}

// Nama queue Redis (list). Harus identik dgn worker Python.
export const QUEUE_EXTRACT = "pdfholmes:queue:extract";
export const QUEUE_ANALYZE = "pdfholmes:queue:analyze";
export const CHANNEL_STATUS = "pdfholmes:status"; // pub/sub utk SSE
