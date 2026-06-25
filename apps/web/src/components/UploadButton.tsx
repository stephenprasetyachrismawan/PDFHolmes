"use client";

import { useRef } from "react";
import { useUpload } from "@/lib/hooks";

export function UploadButton({ folderId }: { folderId: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUpload(folderId);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload.mutate(file);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={upload.isPending}
        className="rounded bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {upload.isPending ? "Mengunggah…" : "+ Unggah PDF"}
      </button>
    </>
  );
}
