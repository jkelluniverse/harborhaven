/**
 * Receipt photo storage — Cloudflare R2 via its S3-compatible API (aws4fetch,
 * no AWS SDK). This is the storage seam: callers pass a base64 data URL and a
 * filename and get back { key, url } or null.
 *
 * When R2 env vars are unset the upload is skipped and the expense saves
 * without a photo URL (mirrors the source app's behavior when its photo
 * backend failed). See KNOWN-LIMITS.md.
 */
import { AwsClient } from "aws4fetch";

export interface StoredPhoto {
  key: string;
  url: string;
}

function r2Config() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) return null;
  return {
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}`,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    publicUrl: R2_PUBLIC_URL ?? "",
  };
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-. ]/g, "").replace(/\s+/g, "_").slice(0, 60);
}

/** Upload a base64 data URL (image/* or application/pdf). Returns null when
 *  storage is unconfigured or the upload fails — callers must tolerate that. */
export async function uploadBase64(base64DataUrl: string, filename: string): Promise<StoredPhoto | null> {
  const cfg = r2Config();
  if (!cfg) {
    console.warn("[storage] R2 not configured — skipping photo upload");
    return null;
  }
  const match = base64DataUrl.match(/^data:([\w/+.-]+);base64,(.+)$/s);
  if (!match) return null;
  const contentType = match[1];
  const body = Buffer.from(match[2], "base64");
  const key = `receipts/${Date.now()}_${sanitizeFilename(filename)}`;

  const client = new AwsClient({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    service: "s3",
    region: "auto",
  });
  try {
    const res = await client.fetch(`${cfg.endpoint}/${key}`, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body,
    });
    if (!res.ok) {
      console.error(`[storage] R2 upload failed: ${res.status}`);
      return null;
    }
    const url = cfg.publicUrl ? `${cfg.publicUrl.replace(/\/$/, "")}/${key}` : key;
    return { key, url };
  } catch (err) {
    console.error("[storage] R2 upload threw", err);
    return null;
  }
}
