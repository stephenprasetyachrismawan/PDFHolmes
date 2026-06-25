import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { DB, type Database } from "../db/db.module";
import { documents, type DbUser, type DbDocument } from "../db/schema";
import { MinioService } from "../storage/minio.service";
import { QueueService } from "../redis/queue.service";

@Injectable()
export class DocumentsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly minio: MinioService,
    private readonly queue: QueueService,
  ) {}

  // Langkah 1 (§6): catat document status=uploaded, kembalikan presigned PUT URL.
  async createUpload(
    user: DbUser,
    input: { filename: string; folderId: string | null; sizeBytes?: number },
  ) {
    const docId = randomUUID();
    const folderSeg = input.folderId ?? "root";
    const objectKey = `${folderSeg}/${docId}.pdf`;

    const [doc] = await this.db
      .insert(documents)
      .values({
        id: docId,
        userId: user.id,
        folderId: input.folderId,
        originalFilename: input.filename,
        objectKey,
        sizeBytes: input.sizeBytes ?? null,
        status: "uploaded",
      })
      .returning();

    const uploadUrl = await this.minio.presignedPut(user.minioBucket, objectKey);
    return { document: this.toDto(doc), uploadUrl };
  }

  // Langkah konfirmasi (§6): user selesai PUT -> enqueue EXTRACT.
  async confirmUpload(user: DbUser, docId: string) {
    const doc = await this.getOwned(user, docId);
    // Validasi objek benar-benar ada di MinIO.
    const stat = await this.minio.statObject(user.minioBucket, doc.objectKey).catch(() => null);
    if (!stat) throw new NotFoundException("objek belum terunggah ke storage");

    const [updated] = await this.db
      .update(documents)
      .set({ status: "extracting", sizeBytes: stat.size })
      .where(eq(documents.id, doc.id))
      .returning();

    await this.queue.enqueueExtract(doc.id, user.id);
    await this.queue.publishStatus({ documentId: doc.id, status: "extracting" });
    return this.toDto(updated);
  }

  async list(user: DbUser, folderId: string | null) {
    const rows = await this.db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.userId, user.id),
          folderId === null ? isNull(documents.folderId) : eq(documents.folderId, folderId),
        ),
      )
      .orderBy(desc(documents.createdAt));
    return rows.map((d) => this.toDto(d));
  }

  async get(user: DbUser, docId: string) {
    return this.toDto(await this.getOwned(user, docId));
  }

  // Presigned GET utk react-pdf viewer (§10).
  async viewUrl(user: DbUser, docId: string) {
    const doc = await this.getOwned(user, docId);
    const url = await this.minio.presignedGet(user.minioBucket, doc.objectKey);
    return { url };
  }

  async remove(user: DbUser, docId: string) {
    const doc = await this.getOwned(user, docId);
    await this.minio.removeObject(user.minioBucket, doc.objectKey).catch(() => null);
    await this.db.delete(documents).where(eq(documents.id, doc.id));
    return { ok: true };
  }

  // Helper akses-terkontrol: difilter user_id (§16 isolasi antar-pengguna).
  private async getOwned(user: DbUser, docId: string): Promise<DbDocument> {
    const doc = await this.db.query.documents.findFirst({
      where: and(eq(documents.id, docId), eq(documents.userId, user.id)),
    });
    if (!doc) throw new NotFoundException("dokumen tidak ditemukan");
    return doc;
  }

  private toDto(d: DbDocument) {
    return {
      id: d.id,
      folderId: d.folderId,
      originalFilename: d.originalFilename,
      objectKey: d.objectKey,
      sizeBytes: d.sizeBytes,
      pageCount: d.pageCount,
      status: d.status,
      error: d.error,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    };
  }
}
