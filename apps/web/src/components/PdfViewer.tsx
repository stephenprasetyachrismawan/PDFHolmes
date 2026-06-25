"use client";

import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { useViewUrl } from "@/lib/hooks";

// Worker pdf.js dari CDN (cocok dgn versi react-pdf).
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export function PdfViewer({ documentId }: { documentId: string }) {
  const { data, isLoading } = useViewUrl(documentId);
  const [numPages, setNumPages] = useState(0);

  if (isLoading) return <p className="p-4 text-slate-500">Memuat PDF…</p>;
  if (!data?.url) return <p className="p-4 text-red-600">URL PDF tidak tersedia.</p>;

  return (
    <div className="p-2">
      <Document
        file={data.url}
        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
        loading={<p className="p-4 text-slate-500">Memuat…</p>}
        error={<p className="p-4 text-red-600">Gagal merender PDF.</p>}
      >
        {Array.from({ length: numPages }, (_, i) => (
          <Page key={i} pageNumber={i + 1} width={560} className="mb-2 shadow" />
        ))}
      </Document>
    </div>
  );
}
