import { Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Enkripsi kredensial AI at rest (§16). DEV: AES-256-GCM dgn CREDENTIAL_ENC_KEY.
// PROD: ganti dgn envelope encryption KMS (data key per-secret) — antarmuka sama.
// Skema DB menyimpan ciphertext + nonce; tag GCM (16B) di-append ke ciphertext.
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor() {
    const raw = process.env.CREDENTIAL_ENC_KEY ?? "";
    // Terima base64 (32 byte) atau utf8; normalisasi ke 32 byte.
    let buf = Buffer.from(raw, "base64");
    if (buf.length !== 32) buf = Buffer.from(raw.padEnd(32, "_").slice(0, 32), "utf8");
    this.key = buf;
  }

  encrypt(plaintext: string): { ciphertext: Buffer; nonce: Buffer } {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, nonce);
    const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { ciphertext: Buffer.concat([enc, tag]), nonce };
  }

  decrypt(ciphertext: Buffer, nonce: Buffer): string {
    const tag = ciphertext.subarray(ciphertext.length - 16);
    const enc = ciphertext.subarray(0, ciphertext.length - 16);
    const decipher = createDecipheriv("aes-256-gcm", this.key, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  }
}
