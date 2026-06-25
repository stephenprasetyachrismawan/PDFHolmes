"use client";

import { use } from "react";
import { useDocument, useDocumentStatus } from "@/lib/hooks";
import { PdfViewer } from "@/components/PdfViewer";
import { AnalysisPanel } from "@/components/AnalysisPanel";
import { StatusBadge } from "@/components/StatusBadge";

export default function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const doc = useDocument(id);
  useDocumentStatus(id); // langganan SSE -> update status & section realtime

  if (doc.isLoading) return <p className="text-slate-500">Memuat dokumen…</p>;
  if (doc.error || !doc.data) return <p className="text-red-600">Dokumen tidak ditemukan.</p>;

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <h1 className="truncate text-xl font-semibold">{doc.data.originalFilename}</h1>
        <StatusBadge status={doc.data.status} />
      </div>
      {/* Kiri: PDF viewer · Kanan: panel analisis (§1) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-[80vh] overflow-auto rounded-lg border bg-white">
          <PdfViewer documentId={id} />
        </div>
        <div className="h-[80vh] overflow-auto rounded-lg border bg-white">
          <AnalysisPanel documentId={id} docStatus={doc.data.status} />
        </div>
      </div>
    </div>
  );
}
