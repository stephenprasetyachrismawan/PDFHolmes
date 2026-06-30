"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useDocument, useDocumentStatus, useDeleteDocument } from "@/lib/hooks";
import { PdfViewer } from "@/components/PdfViewer";
import { AnalysisPanel } from "@/components/AnalysisPanel";
import { StatusBadge } from "@/components/StatusBadge";

export default function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const doc = useDocument(id);
  const deleteDoc = useDeleteDocument();
  useDocumentStatus(id); // langganan SSE -> update status & section realtime

  if (doc.isLoading) return <p className="text-slate-500">Memuat dokumen…</p>;
  if (doc.error || !doc.data) return <p className="text-red-600">Dokumen tidak ditemukan.</p>;

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <h1 className="truncate text-xl font-semibold">{doc.data.originalFilename}</h1>
        <StatusBadge status={doc.data.status} error={doc.data.error} />
        <button
          onClick={() => {
            if (
              confirm(
                "Hapus dokumen ini beserta seluruh hasil analisisnya? Tindakan ini tidak bisa dibatalkan.",
              )
            ) {
              deleteDoc.mutate(id, { onSuccess: () => router.push("/library") });
            }
          }}
          disabled={deleteDoc.isPending}
          className="ml-auto shrink-0 rounded border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          {deleteDoc.isPending ? "Menghapus…" : "🗑 Hapus"}
        </button>
      </div>
      {doc.data.status === "failed" && doc.data.error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <span className="font-semibold">Alasan gagal:</span> {doc.data.error}
        </div>
      )}
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
