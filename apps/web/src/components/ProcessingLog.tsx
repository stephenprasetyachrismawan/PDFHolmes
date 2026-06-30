"use client";

import { useEffect, useRef } from "react";
import type { ProcessLogLine } from "@/lib/hooks";

const KIND_CLS: Record<ProcessLogLine["kind"], string> = {
  status: "text-slate-300",
  field: "text-sky-300",
  message: "text-emerald-300",
  error: "text-red-400",
};

// Panel log pemrosesan: fixed height + overflow scroll. Menampilkan progres
// pipeline (ekstraksi → analisis) dan respons mentah API AI yg dipublish worker.
export function ProcessingLog({ logs }: { logs: ProcessLogLine[] }) {
  const boxRef = useRef<HTMLDivElement>(null);

  // Auto-scroll ke bawah saat ada baris baru (kecuali user gulir ke atas).
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [logs]);

  return (
    <div className="mt-6">
      <div className="mb-1 flex items-center gap-2 text-sm font-medium text-slate-600">
        <span>Log pemrosesan</span>
        <span className="text-xs font-normal text-slate-400">
          ({logs.length} baris · termasuk respons AI)
        </span>
      </div>
      <div
        ref={boxRef}
        className="h-64 w-full overflow-y-auto overflow-x-hidden rounded-lg border border-slate-700 bg-slate-900 p-3 font-mono text-xs leading-relaxed"
      >
        {logs.length === 0 ? (
          <p className="text-slate-500">
            Menunggu aktivitas… log akan muncul saat dokumen diproses.
          </p>
        ) : (
          logs.map((l, i) => (
            <div key={i} className="whitespace-pre-wrap break-words">
              <span className="text-slate-500">{l.ts}</span>{" "}
              <span className={KIND_CLS[l.kind]}>{l.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
