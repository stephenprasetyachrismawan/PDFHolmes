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

// SSE status: dengarkan progres pipeline; refresh analysis saat ada field baru.
export function useDocumentStatus(documentId: string) {
  const { apiUrl, sseToken } = useApi();
  const qc = useQueryClient();
  useEffect(() => {
    if (!documentId) return;
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
      } catch {
        /* abaikan */
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [documentId, apiUrl, qc]);
}

// ---- AI chat (NON-BYOK) ----
// Frontend HANYA mengirim prompt; API key OpenCode Go tetap di server.
export interface AiChatResult {
  ok: true;
  model: string;
  content: string;
}

export function useAiChat() {
  const { request } = useApi();
  return useMutation({
    mutationFn: (prompt: string) =>
      request<AiChatResult>("/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({ prompt }),
      }),
  });
}
