"use client";

import { useState } from "react";
import Link from "next/link";
import { useDocuments, useFolders, useCreateFolder } from "@/lib/hooks";
import { UploadButton } from "@/components/UploadButton";
import { StatusBadge } from "@/components/StatusBadge";

export default function LibraryPage() {
  // Folder root saja utk MVP (nested folder didukung api via parentId).
  const [folderId] = useState<string | null>(null);
  const folders = useFolders(folderId);
  const docs = useDocuments(folderId);
  const createFolder = useCreateFolder();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Pustaka</h1>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const name = prompt("Nama folder?");
              if (name) createFolder.mutate({ name, parentId: folderId });
            }}
            className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            + Folder
          </button>
          <UploadButton folderId={folderId} />
        </div>
      </div>

      {/* Folder */}
      {folders.data && folders.data.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {folders.data.map((f) => (
            <div key={f.id} className="rounded-lg border bg-white p-3 text-sm">
              📁 {f.name}
            </div>
          ))}
        </div>
      )}

      {/* Dokumen */}
      {docs.isLoading ? (
        <p className="text-slate-500">Memuat…</p>
      ) : docs.data && docs.data.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {docs.data.map((d) => (
            <Link
              key={d.id}
              href={`/documents/${d.id}`}
              className="rounded-lg border bg-white p-4 transition hover:shadow"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-2xl">📄</span>
                <StatusBadge status={d.status} />
              </div>
              <p className="mt-2 line-clamp-2 font-medium">{d.originalFilename}</p>
              <p className="mt-1 text-xs text-slate-500">
                {d.pageCount ? `${d.pageCount} hlm · ` : ""}
                {new Date(d.createdAt).toLocaleDateString("id-ID")}
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed bg-white p-12 text-center text-slate-500">
          Belum ada dokumen. Unggah PDF artikel riset untuk memulai.
        </div>
      )}
    </div>
  );
}
