"use client";

import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { fieldsByTab, TAB_ORDER, type FieldDef } from "@pdfholmes/field-schema";
import type { AnalysisSection, DocStatus, FieldSource } from "@pdfholmes/shared-types";
import { useAnalysis, useTriggerAnalyze } from "@/lib/hooks";

const SOURCE_BADGE: Record<FieldSource, { label: string; cls: string }> = {
  extracted: { label: "Dari teks", cls: "bg-emerald-100 text-emerald-700" },
  inferred: { label: "Inferensi AI", cls: "bg-violet-100 text-violet-700" },
  hybrid: { label: "Hibrida", cls: "bg-amber-100 text-amber-700" },
};

export function AnalysisPanel({
  documentId,
  docStatus,
}: {
  documentId: string;
  docStatus: DocStatus;
}) {
  const tabs = useMemo(() => fieldsByTab(), []);
  const [activeTab, setActiveTab] = useState(TAB_ORDER[0]);
  const analysis = useAnalysis(documentId);
  const trigger = useTriggerAnalyze(documentId);

  const sectionByKey = useMemo(() => {
    const map = new Map<string, AnalysisSection>();
    for (const s of analysis.data?.sections ?? []) map.set(s.fieldKey, s);
    return map;
  }, [analysis.data]);

  const analyzing = docStatus === "analyzing";
  const hasSections = (analysis.data?.sections.length ?? 0) > 0;

  // Belum dianalisis: tampilkan tombol trigger (analisis via OpenCode Go server).
  if (!hasSections && !analyzing) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-slate-600">
          {docStatus === "analyzed"
            ? "Tidak ada hasil analisis."
            : "Dokumen siap dianalisis."}
        </p>
        <button
          onClick={() => trigger.mutate(undefined)}
          disabled={trigger.isPending || docStatus === "extracting"}
          className="rounded-lg bg-brand px-5 py-2.5 text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {docStatus === "extracting"
            ? "Menunggu ekstraksi…"
            : trigger.isPending
              ? "Memulai…"
              : "Analisis Sekarang"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Bar aksi: ulangi analisis (hasil tersimpan; tak otomatis dijalankan ulang) */}
      <div className="flex items-center justify-between border-b bg-white px-3 py-2">
        <span className="text-xs text-slate-500">
          {analyzing ? "Menganalisis…" : "Hasil analisis tersimpan"}
        </span>
        <button
          onClick={() => trigger.mutate(undefined)}
          disabled={trigger.isPending || analyzing}
          className="rounded border px-3 py-1 text-xs font-medium text-brand hover:bg-teal-50 disabled:opacity-50"
        >
          {trigger.isPending ? "Memulai…" : "↻ Ulangi Analisis"}
        </button>
      </div>

      {/* Tab (§7: Ikhtisar / Metodologi / Hasil / Analisis Kritis & Gap) */}
      <div className="flex gap-1 overflow-x-auto border-b bg-slate-50 px-2">
        {TAB_ORDER.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`whitespace-nowrap px-3 py-2 text-sm ${
              activeTab === tab
                ? "border-b-2 border-brand font-medium text-brand"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-4 overflow-auto p-4">
        {(tabs[activeTab] ?? []).map((field) => (
          <FieldCard
            key={field.key}
            field={field}
            section={sectionByKey.get(field.key)}
            loading={analyzing && !sectionByKey.has(field.key)}
          />
        ))}
      </div>
    </div>
  );
}

function FieldCard({
  field,
  section,
  loading,
}: {
  field: FieldDef;
  section?: AnalysisSection;
  loading: boolean;
}) {
  const featured = field.featured;
  return (
    <section
      className={`rounded-lg border p-4 ${
        featured ? "border-brand bg-teal-50/40" : "border-slate-200 bg-white"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className={`font-semibold ${featured ? "text-brand" : "text-slate-800"}`}>
          {field.label}
        </h3>
        {section && <SourceBadge source={section.source} confidence={section.confidence} />}
      </div>

      {loading ? (
        <div className="space-y-2">
          <div className="h-3 w-3/4 animate-pulse rounded bg-slate-200" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-slate-200" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-slate-200" />
        </div>
      ) : section?.contentMd ? (
        <div className="prose prose-sm max-w-none prose-headings:text-sm">
          <ReactMarkdown>{section.contentMd}</ReactMarkdown>
        </div>
      ) : (
        <p className="text-sm text-slate-400">—</p>
      )}
    </section>
  );
}

function SourceBadge({
  source,
  confidence,
}: {
  source: FieldSource;
  confidence: number | null;
}) {
  const b = SOURCE_BADGE[source];
  return (
    <span className={`rounded px-2 py-0.5 text-xs ${b.cls}`}>
      {b.label}
      {confidence != null ? ` · ${Math.round(confidence * 100)}%` : ""}
    </span>
  );
}
