"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  DocumentDto,
  Folder,
  AnalysisSection,
  AiCredentialDto,
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

// Upload: minta presigned PUT, PUT langsung ke MinIO, konfirmasi -> pipeline jalan.
export function useUpload(folderId: string | null) {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
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
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: file,
      });
      if (!put.ok) throw new Error("upload ke storage gagal");
      await request(`/api/documents/${document.id}/confirm`, { method: "POST" });
      return document;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents", folderId] }),
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

export function useCredentials() {
  const { request } = useApi();
  return useQuery({
    queryKey: ["credentials"],
    queryFn: () => request<AiCredentialDto[]>("/api/credentials"),
  });
}

export function useCreateCredential() {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      request("/api/credentials", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["credentials"] }),
  });
}

export function useDeleteCredential() {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => request(`/api/credentials/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["credentials"] }),
  });
}

// ---- Codex device-flow (§8.2) ----
export interface CodexDeviceStatus {
  status: "starting" | "pending" | "complete" | "error";
  verificationUri?: string | null;
  userCode?: string | null;
  error?: string | null;
}

export function useCodexDeviceStart() {
  const { request } = useApi();
  return useMutation({
    mutationFn: (body: { makeDefault?: boolean; model?: string }) =>
      request<{ sessionId: string; status: string; mock: boolean }>(
        "/api/credentials/codex/device/start",
        { method: "POST", body: JSON.stringify(body) },
      ),
  });
}

// Poll status tiap 2 dtk selama sessionId aktif; berhenti saat complete/error.
export function useCodexDeviceStatus(sessionId: string | null) {
  const { request } = useApi();
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["codex-device", sessionId],
    enabled: !!sessionId,
    refetchInterval: (q) => {
      const s = q.state.data as CodexDeviceStatus | undefined;
      if (s && (s.status === "complete" || s.status === "error")) {
        if (s.status === "complete") qc.invalidateQueries({ queryKey: ["credentials"] });
        return false;
      }
      return 2000;
    },
    queryFn: () =>
      request<CodexDeviceStatus>(`/api/credentials/codex/device/status/${sessionId}`),
  });
}
