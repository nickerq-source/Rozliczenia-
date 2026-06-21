import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSessionProfile } from "@/lib/supabase-server";
import { getAnthropicApiKey } from "@/lib/anthropic-key";
import { normalizeMileageAi, parseMileageFromText } from "@/lib/mileage-ocr";

export const runtime = "nodejs";
export const maxDuration = 60;

type ClaudeImageType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

const MAX_IMAGE_BYTES = 7 * 1024 * 1024;
const FAIL_MESSAGE = "Nie udało się automatycznie rozpoznać przebiegu. Wpisz przebieg ręcznie.";

const PROMPT = `To jest zdjęcie licznika lub tachografu pojazdu dostawczego. Odczytaj wyłącznie przebieg całkowity pojazdu w kilometrach. Nie myl przebiegu z godziną, prędkością km/h, trybem tacho, numerem dokumentu, kwotą ani litrami. Jeśli widzisz status tacho typu OUT, zapisz go osobno. Zwróć wyłącznie JSON:
{
  "mileage": number | null,
  "mileage_text": string | null,
  "tacho_status": string | null,
  "speed": number | null,
  "confidence": number
}
Jeżeli nie masz pewności, ustaw mileage na null.
Przykład: tekst "05:34 0 km/h OUT 252020.8km" oznacza mileage=252020.8, speed=0, tacho_status="OUT".
Liczba przed km/h jest prędkością, nie przebiegiem. Godzina 05:34 nigdy nie jest przebiegiem.`;

function failure(message = FAIL_MESSAGE) {
  return NextResponse.json({
    success: false,
    mileage: null,
    mileage_text: null,
    tacho_status: null,
    speed: null,
    confidence: 0,
    source: null,
    message,
  });
}

function wykryjFormat(base64: string): ClaudeImageType | null {
  let head: Buffer;
  try {
    head = Buffer.from(base64.slice(0, 32), "base64");
  } catch {
    return null;
  }
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return "image/png";
  if (head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46) return "image/gif";
  if (
    head[0] === 0x52 &&
    head[1] === 0x49 &&
    head[2] === 0x46 &&
    head[3] === 0x46 &&
    head[8] === 0x57 &&
    head[9] === 0x45 &&
    head[10] === 0x42 &&
    head[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

function parseDataUrl(dataUrl: string): string | null {
  const m = dataUrl.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
  return m ? m[1].replace(/\s/g, "") : null;
}

async function readImage(req: NextRequest): Promise<string> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size <= 0) throw new Error("Brak zdjęcia.");
    if (file.size > MAX_IMAGE_BYTES) throw new Error("Zdjęcie jest za duże po kompresji.");
    return Buffer.from(await file.arrayBuffer()).toString("base64");
  }

  const body = (await req.json().catch(() => null)) as { image?: string; text?: string } | null;
  if (body?.text) {
    const parsed = parseMileageFromText(body.text);
    if (parsed.mileage == null) throw new Error(FAIL_MESSAGE);
    throw Object.assign(new Error("TEXT_RESULT"), { parsed });
  }
  const data = body?.image ? parseDataUrl(body.image) : null;
  if (!data) throw new Error("Brak zdjęcia.");
  const bytes = Math.ceil((data.length * 3) / 4);
  if (bytes > MAX_IMAGE_BYTES) throw new Error("Zdjęcie jest za duże po kompresji.");
  return data;
}

export async function POST(req: NextRequest) {
  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: "Brak sesji" }, { status: 401 });
  if (profile.role !== "admin" && profile.role !== "driver") {
    return NextResponse.json({ error: "Brak dostępu" }, { status: 403 });
  }

  let base64: string;
  try {
    base64 = await readImage(req);
  } catch (e) {
    const parsed = (e as { parsed?: ReturnType<typeof parseMileageFromText> })?.parsed;
    if (parsed?.mileage != null) {
      return NextResponse.json({
        success: true,
        mileage: parsed.mileage,
        mileage_text: parsed.mileageText,
        tacho_status: parsed.tachoStatus,
        speed: parsed.speed,
        confidence: parsed.confidence,
        source: parsed.source,
      });
    }
    return failure(e instanceof Error && e.message !== "TEXT_RESULT" ? e.message : FAIL_MESSAGE);
  }

  const mediaType = wykryjFormat(base64);
  if (!mediaType) return failure();

  const apiKey = getAnthropicApiKey();
  if (!apiKey.key) return failure();

  try {
    const client = new Anthropic({ apiKey: apiKey.key });
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const match = text.match(/\{[\s\S]*\}/);
    const ai = match ? normalizeMileageAi(JSON.parse(match[0]) as Record<string, unknown>) : null;
    const parsedText = parseMileageFromText(text);
    const mileage = ai?.mileage ?? parsedText.mileage;
    const confidence = Math.max(ai?.confidence ?? 0, parsedText.confidence);
    if (mileage == null) return failure();

    return NextResponse.json({
      success: true,
      mileage,
      mileage_text: ai?.mileageText ?? parsedText.mileageText ?? `${mileage} km`,
      tacho_status: ai?.tachoStatus ?? parsedText.tachoStatus,
      speed: ai?.speed ?? parsedText.speed,
      confidence,
      source: ai?.source ?? parsedText.source,
    });
  } catch (e) {
    console.error("[extract-mileage] OCR error:", e instanceof Error ? e.message : e);
    return failure();
  }
}
