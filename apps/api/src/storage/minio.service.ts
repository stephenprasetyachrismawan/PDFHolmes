import { Injectable, Logger } from "@nestjs/common";
import { Client as MinioClient } from "minio";
import { config } from "../config";

// MinIO: bucket per-pengguna (§10). api memegang kredensial service & menerbitkan
// presigned URL berbatas waktu hanya utk bucket milik pengguna ybs.
@Injectable()
export class MinioService {
  private readonly log = new Logger(MinioService.name);
  private readonly internal: MinioClient; // dlm jaringan docker (minio:9000)
  private readonly publicClient: MinioClient; // utk presigned yg dibuka browser

  constructor() {
    const internal = new URL(config.minio.endpoint);
    const pub = new URL(config.minio.publicEndpoint);
    const common = {
      accessKey: config.minio.accessKey,
      secretKey: config.minio.secretKey,
      region: config.minio.region,
    };
    this.internal = new MinioClient({
      endPoint: internal.hostname,
      port: Number(internal.port) || (internal.protocol === "https:" ? 443 : 80),
      useSSL: internal.protocol === "https:",
      ...common,
    });
    this.publicClient = new MinioClient({
      endPoint: pub.hostname,
      port: Number(pub.port) || (pub.protocol === "https:" ? 443 : 80),
      useSSL: pub.protocol === "https:",
      ...common,
    });
  }

  // Nama bucket valid: huruf kecil, angka, '-'; 3..63 char.
  static bucketForSub(cognitoSub: string): string {
    const sanitized = cognitoSub.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    return `usr-${sanitized}`.slice(0, 63).replace(/-+$/, "");
  }

  async ensureBucket(bucket: string): Promise<void> {
    const exists = await this.internal.bucketExists(bucket).catch(() => false);
    if (!exists) {
      await this.internal.makeBucket(bucket, config.minio.region);
      this.log.log(`bucket dibuat: ${bucket}`);
    }
  }

  // URL upload PUT langsung dari browser (TTL pendek).
  async presignedPut(bucket: string, objectKey: string, expirySec = 600): Promise<string> {
    return this.publicClient.presignedPutObject(bucket, objectKey, expirySec);
  }

  // URL download GET langsung dari browser (utk PDF viewer).
  async presignedGet(bucket: string, objectKey: string, expirySec = 600): Promise<string> {
    return this.publicClient.presignedGetObject(bucket, objectKey, expirySec);
  }

  async statObject(bucket: string, objectKey: string) {
    return this.internal.statObject(bucket, objectKey);
  }

  async removeObject(bucket: string, objectKey: string): Promise<void> {
    await this.internal.removeObject(bucket, objectKey);
  }
}
