import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicApiKey, inspectAnthropicApiKey } from "@/lib/anthropic-key";
import { getSessionProfile } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 30;

function apiErrorMessage(e: unknown): { status?: number; message: string } {
  const status = (e as { status?: number })?.status;
  const apiMsg = (e as { error?: { error?: { message?: string } } })?.error?.error?.message;
  const message = apiMsg ?? (e instanceof Error ? e.message : "Nieznany błąd Anthropic API.");
  return { status, message };
}

export async function GET(req: NextRequest) {
  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: "Brak sesji" }, { status: 401 });
  if (profile.role !== "admin") return NextResponse.json({ error: "Brak dostępu" }, { status: 403 });

  const url = new URL(req.url);
  const shouldTest = url.searchParams.get("test") === "1";
  const inspection = inspectAnthropicApiKey();
  const env = {
    nodeEnv: process.env.NODE_ENV ?? null,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    vercelCommit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
  };

  if (!shouldTest) {
    return NextResponse.json({ env, key: inspection, test: null });
  }

  const apiKey = getAnthropicApiKey();
  if (!apiKey.key) {
    return NextResponse.json({
      env,
      key: inspection,
      test: { ok: false, message: apiKey.error },
    });
  }

  try {
    const client = new Anthropic({ apiKey: apiKey.key });
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 4,
      messages: [{ role: "user", content: "ping" }],
    });

    return NextResponse.json({
      env,
      key: inspection,
      test: {
        ok: true,
        id: response.id,
        model: response.model,
      },
    });
  } catch (e) {
    const error = apiErrorMessage(e);
    return NextResponse.json({
      env,
      key: inspection,
      test: {
        ok: false,
        status: error.status ?? null,
        message: error.message,
      },
    });
  }
}
