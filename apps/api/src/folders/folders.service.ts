import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { DB, type Database } from "../db/db.module";
import { folders } from "../db/schema";

@Injectable()
export class FoldersService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(userId: string, parentId: string | null) {
    return this.db
      .select()
      .from(folders)
      .where(
        and(
          eq(folders.userId, userId),
          parentId === null ? isNull(folders.parentId) : eq(folders.parentId, parentId),
        ),
      );
  }

  async create(userId: string, name: string, parentId: string | null) {
    const [row] = await this.db
      .insert(folders)
      .values({ userId, name, parentId })
      .returning();
    return row;
  }

  async rename(userId: string, id: string, name: string) {
    const [row] = await this.db
      .update(folders)
      .set({ name })
      .where(and(eq(folders.id, id), eq(folders.userId, userId)))
      .returning();
    if (!row) throw new NotFoundException("folder tidak ditemukan");
    return row;
  }

  async remove(userId: string, id: string) {
    const [row] = await this.db
      .delete(folders)
      .where(and(eq(folders.id, id), eq(folders.userId, userId)))
      .returning();
    if (!row) throw new NotFoundException("folder tidak ditemukan");
    return { ok: true };
  }
}
