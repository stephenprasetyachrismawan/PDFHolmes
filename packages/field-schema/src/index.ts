// Single source of truth utk 48 field analisis (§7 arsitektur).
// JSON kanonik di ../fields.json — dipakai TS (web/api) DAN Python (analyzer)
// agar prompt, validasi, DB, dan UI selalu sinkron.
import rawSchema from "../fields.json" with { type: "json" };

export type FieldSource = "extracted" | "inferred" | "hybrid";

export interface FieldGroup {
  key: string;
  label: string;
  tab: string;
}

export interface FieldDef {
  key: string;
  label: string;
  group: string;
  order: number;
  /** true bila biasanya terisi otomatis dari GROBID (metadata). */
  auto: boolean;
  defaultSource: FieldSource;
  prompt: string;
  featured?: boolean;
  optional?: boolean;
}

export interface FieldSchema {
  version: string;
  embeddingDim: number;
  groups: FieldGroup[];
  fields: FieldDef[];
}

export const fieldSchema: FieldSchema = rawSchema as FieldSchema;

export const FIELDS: FieldDef[] = [...fieldSchema.fields].sort(
  (a, b) => a.order - b.order,
);

export const GROUPS: FieldGroup[] = fieldSchema.groups;

export const FIELD_KEYS: string[] = FIELDS.map((f) => f.key);

export const EMBEDDING_DIM = fieldSchema.embeddingDim;

const byKey = new Map(FIELDS.map((f) => [f.key, f]));
export function getField(key: string): FieldDef | undefined {
  return byKey.get(key);
}

/** Field dikelompokkan per "tab" UI (Ikhtisar / Metodologi / Hasil / Analisis Kritis & Gap). */
export function fieldsByTab(): Record<string, FieldDef[]> {
  const tabOfGroup = new Map(GROUPS.map((g) => [g.key, g.tab]));
  const out: Record<string, FieldDef[]> = {};
  for (const f of FIELDS) {
    const tab = tabOfGroup.get(f.group) ?? "Lainnya";
    (out[tab] ??= []).push(f);
  }
  return out;
}

/** Urutan tab unik sesuai definisi grup. */
export const TAB_ORDER: string[] = [...new Set(GROUPS.map((g) => g.tab))];
