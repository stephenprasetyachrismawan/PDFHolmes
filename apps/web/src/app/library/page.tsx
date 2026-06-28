"use client";

import { useState } from "react";
import Link from "next/link";
import {
  useDocuments,
  useFolders,
  useCreateFolder,
  useDeleteDocument,
} from "@/lib/hooks";
import { UploadButton } from "@/components/UploadButton";
import { StatusBadge } from "@/components/StatusBadge";

type Crumb = { id: string; name: string };

export default function LibraryPage() {
  // Jejak folder (breadcrumb). Kosong = root. Folder terakhir = lokasi aktif.
  const [path, setPath] = useState<Crumb[]>([]);
  const folderId = path.length ? path[path.length - 1].id : null;

  const folders = useFolders(folderId);
  const docs = useDocuments(folderId);
  const createFolder = useCreateFolder();
  const deleteDoc = useDeleteDocument();

  const openFolder = (c: Crumb) => setPath((p) => [...p, c]);
  const goTo = (index: number) => setPath((p) => p.slice(0, index)); // index=0 -> root

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        {/* Breadcrumb */}
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          <button
            onClick={() => goTo(0)}
            className={folderId ? "text-brand hover:underline" : "font-semibold"}
          >
            Pustaka
          </button>
          {path.map((c, i) => (
            <span key={c.id} className="flex items-center gap-1">
              <span className="text-slate-400">/</span>
              <button
                onClick={() => goTo(i + 1)}
                className={
                  i === path.length - 1 ? "font-semibold" : "text-brand hover:underline"
                }
              >
                {c.name}
              </button>
            </span>
          ))}
        </nav>

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

      {/* Folder (klik untuk masuk) */}
      {folders.data && folders.data.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {folders.data.map((f) => (
            <button
              key={f.id}
              onClick={() => openFolder({ id: f.id, name: f.name })}
              className="rounded-lg border bg-white p-3 text-left text-sm transition hover:shadow hover:border-brand"
            >
              📁 {f.name}
            </button>
          ))}
        </div>
      )}

      {/* Dokumen */}
      {docs.isLoading ? (
        <p className="text-slate-500">Memuat…</p>
      ) : docs.data && docs.data.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {docs.data.map((d) => (
            <div key={d.id} className="group relative">
              <Link
                href={`/documents/${d.id}`}
                className="block rounded-lg border bg-white p-4 transition hover:shadow"
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
              <button
                title="Hapus dokumen"
                onClick={(e) => {
                  e.preventDefault();
                  if (
                    confirm(
                      `Hapus "${d.originalFilename}" beserta seluruh hasil analisisnya? Tindakan ini tidak bisa dibatalkan.`,
                    )
                  ) {
                    deleteDoc.mutate(d.id);
                  }
                }}
                disabled={deleteDoc.isPending}
                className="absolute right-2 top-2 rounded p-1 text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 disabled:opacity-50"
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed bg-white p-12 text-center text-slate-500">
          {folderId
            ? "Folder ini kosong. Unggah PDF atau buat subfolder."
            : "Belum ada dokumen. Unggah PDF artikel riset untuk memulai."}
        </div>
      )}
    </div>
  );
}
