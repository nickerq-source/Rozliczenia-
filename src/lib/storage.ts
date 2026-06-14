// Załączniki kosztów (zdjęcia paragonów/dokumentów/liczników) trzymamy w
// Supabase Storage, a w JSONB tylko ścieżkę (storagePath). Upload i odczyt idą
// przez service role (API), więc nie potrzeba polityk RLS na storage.objects.

import { getAdminSupabase } from "./supabase-admin";

export const PARAGONY_BUCKET = "paragony";

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

// Górny limit pojedynczego pliku po dekodowaniu (zdjęcia są kompresowane do
// ~0,5 MB, ale dajemy zapas; Vercel i tak tnie request na ~4,5 MB).
export const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024;

let bucketReady = false;

/** Tworzy bucket przy pierwszym użyciu (idempotentnie) — bez ręcznego SQL. */
async function ensureBucket(): Promise<void> {
  if (bucketReady) return;
  const admin = getAdminSupabase();
  const { data } = await admin.storage.getBucket(PARAGONY_BUCKET);
  if (!data) {
    await admin.storage.createBucket(PARAGONY_BUCKET, {
      public: false,
      fileSizeLimit: MAX_ATTACHMENT_BYTES,
      allowedMimeTypes: Object.keys(EXT_BY_MIME),
    });
  }
  bucketReady = true;
}

export function decodeImageDataUrl(
  dataUrl: string
): { mime: string; buffer: Buffer; ext: string } | null {
  const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!m) return null;
  const mime = m[1];
  const buffer = Buffer.from(m[2], "base64");
  const ext = EXT_BY_MIME[mime] ?? "jpg";
  return { mime, buffer, ext };
}

/** Upload zdjęcia (base64 dataUrl) do bucketa. Ścieżka: <workspaceId>/<uuid>.<ext> */
export async function uploadParagon(
  workspaceId: string,
  dataUrl: string
): Promise<{ path: string; mime: string } | null> {
  const dec = decodeImageDataUrl(dataUrl);
  if (!dec) return null;
  if (dec.buffer.byteLength > MAX_ATTACHMENT_BYTES) return null;

  await ensureBucket();
  const admin = getAdminSupabase();
  const path = `${workspaceId}/${crypto.randomUUID()}.${dec.ext}`;
  const { error } = await admin.storage
    .from(PARAGONY_BUCKET)
    .upload(path, dec.buffer, { contentType: dec.mime, upsert: false });
  if (error) {
    console.error("[storage] upload error:", error.message);
    return null;
  }
  return { path, mime: dec.mime };
}

/** Krótkotrwały podpisany URL do podglądu załącznika. */
export async function signedParagonUrl(
  path: string,
  expiresIn = 300
): Promise<string | null> {
  const admin = getAdminSupabase();
  const { data, error } = await admin.storage
    .from(PARAGONY_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error || !data) return null;
  return data.signedUrl;
}

/** Usunięcie obiektu z bucketa (best-effort — nie rzuca). */
export async function removeParagon(path: string): Promise<void> {
  try {
    const admin = getAdminSupabase();
    await admin.storage.from(PARAGONY_BUCKET).remove([path]);
  } catch (e) {
    console.error("[storage] remove error:", e instanceof Error ? e.message : e);
  }
}
