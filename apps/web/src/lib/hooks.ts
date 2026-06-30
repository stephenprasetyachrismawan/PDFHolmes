"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  DocumentDto,
  Folder,
  AnalysisSection,
  StatusEvent,
  DocStatus,
} from "@pdfholmes/shared-types";
import { useApi } from "./api";

export function useMe() {
  const { request } = useApi();
  return useQuery({ queryKey: ["me"], queryFn: () => request("/api/me") });
}

export function useFolders(parentId: string | null) {
  const { request } = useApi();
  return useQuery({
    queryKey: ["folders", parentId],
    queryFn: () =>
      request<Folder[]>(`/api/folders${parentId ? `?parentId=${parentId}` : ""}`),
  });
}

export function useCreateFolder() {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; parentId: string | null }) =>
      request("/api/folders", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["folders"] }),
  });
}

export function useDocuments(folderId: string | null) {
  const { request } = useApi();
  return useQuery({
    queryKey: ["documents", folderId],
    queryFn: () =>
      request<DocumentDto[]>(`/api/documents${folderId ? `?folderId=${folderId}` : ""}`),
  });
}

export function useDocument(id: string) {
  const { request } = useApi();
  return useQuery({
    queryKey: ["document", id],
    queryFn: () => request<DocumentDto>(`/api/documents/${id}`),
  });
}

export function useViewUrl(id: string) {
  const { request } = useApi();
  return useQuery({
    queryKey: ["view-url", id],
    queryFn: () => request<{ url: string }>(`/api/documents/${id}/view-url`),
    staleTime: 5 * 60_000,
  });
}

// PUT ke MinIO via XHR supaya bisa lapor progres unggah (fetch tak punya
// upload.onprogress). Resolve saat status 2xx.
function putWithProgress(
  url: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", "application/pdf");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`upload ke storage gagal (${xhr.status})`));
    xhr.onerror = () => reject(new Error("upload ke storage gagal"));
    xhr.send(file);
  });
}

// Upload: minta presigned PUT, PUT langsung ke MinIO (dgn progres), konfirmasi.
export function useUpload(folderId: string | null) {
  const { request } = useApi();
  const qc = useQueryClient();
  const [progress, setProgress] = useState<number | null>(null);

  const mutation = useMutation({
    mutationFn: async (file: File) => {
      setProgress(0);
      const { document, uploadUrl } = await request<{
        document: DocumentDto;
        uploadUrl: string;
      }>("/api/documents/upload", {
        method: "POST",
        body: JSON.stringify({
          filename: file.name,
          folderId,
          sizeBytes: file.size,
        }),
      });
      await putWithProgress(uploadUrl, file, setProgress);
      await request(`/api/documents/${document.id}/confirm`, { method: "POST" });
      return document;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents", folderId] }),
    onSettled: () => setProgress(null),
  });

  return { ...mutation, progress };
}

// Hapus dokumen + semua datanya. FK ON DELETE CASCADE di DB ikut menghapus
// extractions, analyses, dan 48 field analysis_sections; api juga hapus objek MinIO.
export function useDeleteDocument() {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => request(`/api/documents/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] }),
  });
}

export function useAnalysis(documentId: string) {
  const { request } = useApi();
  return useQuery({
    queryKey: ["analysis", documentId],
    queryFn: () =>
      request<{ analysis: { status: DocStatus } | null; sections: AnalysisSection[] }>(
        `/api/documents/${documentId}/analysis`,
      ),
  });
}

export function useTriggerAnalyze(documentId: string) {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (language?: string) =>
      request(`/api/documents/${documentId}/analysis`, {
        method: "POST",
        body: JSON.stringify({ language }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["analysis", documentId] }),
  });
}

export interface ProcessLogLine {
  ts: string; // jam:menit:detik lokal
  text: string;
  kind: "status" | "field" | "message" | "error";
}

const STATUS_LABEL: Record<string, string> = {
  uploaded: "Terunggah",
  extracting: "Mengekstrak…",
  extracted: "Terekstrak",
  analyzing: "Menganalisis…",
  analyzed: "Selesai",
  failed: "Gagal",
};

// SSE status: dengarkan progres pipeline; refresh analysis saat ada field baru.
// Mengembalikan `logs` (akumulasi sejak halaman dibuka) utk panel pemrosesan —
// termasuk respons mentah API AI yang dipublish worker.
export function useDocumentStatus(documentId: string) {
  const { apiUrl, sseToken } = useApi();
  const qc = useQueryClient();
  const [logs, setLogs] = useState<ProcessLogLine[]>([]);

  useEffect(() => {
    if (!documentId) return;
    setLogs([]); // reset saat ganti dokumen
    const append = (text: string, kind: ProcessLogLine["kind"]) =>
      setLogs((prev) =>
        // batasi 500 baris terakhir agar tak tumbuh tak terbatas
        [...prev, { ts: new Date().toLocaleTimeString(), text, kind }].slice(-500),
      );

    // EventSource tak bisa kirim header → auth lewat query param.
    const url = `${apiUrl}/api/events/documents/${documentId}${sseToken}`;
    const es = new EventSource(url, { withCredentials: true });
    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data) as StatusEvent;
        qc.setQueryData<DocumentDto>(["document", documentId], (old) =>
          old ? { ...old, status: evt.status, error: evt.error ?? old.error } : old,
        );
        // Field baru terisi -> ambil ulang section (streaming panel).
        if (evt.fieldKey || evt.status === "analyzed" || evt.status === "extracted") {
          qc.invalidateQueries({ queryKey: ["analysis", documentId] });
        }

        // Susun baris log: pesan worker > error > field > perubahan status.
        if (evt.message) append(evt.message, "message");
        else if (evt.error) append(`Gagal: ${evt.error}`, "error");
        else if (evt.fieldKey) append(`Field terisi: ${evt.fieldKey}`, "field");
        else
          append(
            `Status: ${STATUS_LABEL[evt.status] ?? evt.status}`,
            evt.status === "failed" ? "error" : "status",
          );
      } catch {
        /* abaikan */
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [documentId, apiUrl, qc]);

  return { logs };
}
