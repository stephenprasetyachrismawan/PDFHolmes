import { Inject, Injectable, Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DB, type Database } from "../db/db.module";
import { users, type DbUser } from "../db/schema";
import { MinioService } from "../storage/minio.service";
import { config } from "../config";

export interface CognitoClaims {
  sub: string;
  email?: string;
  "cognito:username"?: string;
  name?: string;
  // Untuk verifikasi audience: access token Cognito punya client_id, id token punya aud.
  aud?: string;
  client_id?: string;
  token_use?: string;
}

@Injectable()
export class UsersService {
  private readonly log = new Logger(UsersService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly minio: MinioService,
  ) {}

  // Dipanggil tiap request terautentikasi pertama (§11): upsert users + provision bucket.
  async syncFromClaims(claims: CognitoClaims): Promise<DbUser> {
    const existing = await this.db.query.users.findFirst({
      where: eq(users.cognitoSub, claims.sub),
    });
    if (existing) return existing;

    const email = claims.email ?? claims["cognito:username"] ?? `${claims.sub}@unknown`;
    const bucket = MinioService.bucketForSub(claims.sub);

    const [row] = await this.db
      .insert(users)
      .values({
        cognitoSub: claims.sub,
        email,
        displayName: claims.name ?? null,
        preferredLanguage: config.defaultLanguage,
        minioBucket: bucket,
      })
      .onConflictDoNothing({ target: users.cognitoSub })
      .returning();

    const user =
      row ??
      (await this.db.query.users.findFirst({ where: eq(users.cognitoSub, claims.sub) }))!;

    // Provision bucket (idempoten).
    await this.minio.ensureBucket(user.minioBucket).catch((e) => {
      this.log.error(`gagal provision bucket ${user.minioBucket}: ${e.message}`);
    });
    return user;
  }

  async updatePreferences(
    userId: string,
    patch: { preferredLanguage?: string; researchInterest?: string | null },
  ): Promise<DbUser> {
    const [row] = await this.db
      .update(users)
      .set(patch)
      .where(eq(users.id, userId))
      .returning();
    return row;
  }
}
