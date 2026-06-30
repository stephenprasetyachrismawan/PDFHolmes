"use client";

import type { DocStatus } from "@pdfholmes/shared-types";

const MAP: Record<DocStatus, { label: string; cls: string }> = {
  uploaded: { label: "Terunggah", cls: "bg-slate-100 text-slate-700" },
  extracting: { label: "Mengekstrak…", cls: "bg-blue-100 text-blue-700" },
  extracted: { label: "Terekstrak", cls: "bg-indigo-100 text-indigo-700" },
  analyzing: { label: "Menganalisis…", cls: "bg-amber-100 text-amber-700" },
  analyzed: { label: "Selesai", cls: "bg-emerald-100 text-emerald-700" },
  failed: { label: "Gagal", cls: "bg-red-100 text-red-700" },
};

export function StatusBadge({ status, error }: { status: DocStatus; error?: string | null }) {
  const s = MAP[status];
  // Saat gagal, error jadi tooltip (hover) — detail penuh ditampilkan di
  // halaman dokumen / kartu library.
  const title = status === "failed" && error ? error : undefined;
  return (
    <span title={title} className={`rounded px-2 py-0.5 text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}
