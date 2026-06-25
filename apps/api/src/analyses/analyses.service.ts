import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { DB, type Database } from "../db/db.module";
import {
  analyses,
  analysisSections,
  documents,
  type DbUser,
} from "../db/schema";
import { QueueService } from "../redis/queue.service";

@Injectable()
export class AnalysesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly queue: QueueService,
  ) {}

  // Trigger analisis (Fase 4). Buat baris analyses (status=analyzing) lalu enqueue.
  async trigger(user: DbUser, docId: string, language?: string) {
    const doc = await this.db.query.documents.findFirst({
      where: and(eq(documents.id, docId), eq(documents.userId, user.id)),
    });
    if (!doc) throw new NotFoundException("dokumen tidak ditemukan");

    const lang = language ?? user.preferredLanguage;
    const [analysis] = await this.db
      .insert(analyses)
      .values({ documentId: doc.id, language: lang, status: "analyzing" })
      .returning();

    await this.db
      .update(documents)
      .set({ status: "analyzing" })
      .where(eq(documents.id, doc.id));

    await this.queue.enqueueAnalyze(doc.id, user.id, lang);
    await this.queue.publishStatus({ documentId: doc.id, status: "analyzing" });
    return analysis;
  }

  // Ambil analisis terbaru + section utk panel kanan.
  async getLatest(user: DbUser, docId: string) {
    const doc = await this.db.query.documents.findFirst({
      where: and(eq(documents.id, docId), eq(documents.userId, user.id)),
    });
    if (!doc) throw new NotFoundException("dokumen tidak ditemukan");

    const analysis = await this.db.query.analyses.findFirst({
      where: eq(analyses.documentId, docId),
      orderBy: desc(analyses.createdAt),
    });
    if (!analysis) return { analysis: null, sections: [] };

    const sections = await this.db
      .select()
      .from(analysisSections)
      .where(eq(analysisSections.analysisId, analysis.id))
      .orderBy(analysisSections.orderIndex);

    return {
      analysis: {
        id: analysis.id,
        documentId: analysis.documentId,
        language: analysis.language,
        provider: analysis.provider,
        model: analysis.model,
        status: analysis.status,
        startedAt: analysis.startedAt?.toISOString() ?? null,
        finishedAt: analysis.finishedAt?.toISOString() ?? null,
      },
      sections: sections.map((s) => ({
        id: s.id,
        fieldKey: s.fieldKey,
        label: s.label,
        contentMd: s.contentMd,
        source: s.source,
        confidence: s.confidence ? Number(s.confidence) : null,
        orderIndex: s.orderIndex,
      })),
    };
  }
}
