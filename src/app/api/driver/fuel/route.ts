import { NextRequest, NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/supabase-server";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { getWebPush } from "@/lib/webpush";
import { getUstawienia } from "@/lib/tax";
import { formatZlCaly } from "@/lib/business-logic";
import { MIESIACE_ZAKRESU, ROK } from "@/lib/dates";
import {
  DaneMiesiaca,
  KosztZalacznik,
  MiesiącId,
  WorkspaceData,
  WpisTankowania,
} from "@/lib/types";

export const runtime = "nodejs";

interface SubRow {
  id: string;
  user_name: string;
  subscription: object;
}

/** Pusty (bezpieczny) szkielet miesiąca, gdy jeszcze nie istnieje */
function pustyMiesiac(): DaneMiesiaca {
  return { faktury: [], dni: {}, tankowanie: [], inneKoszty: [], leasing: 2300 };
}

/**
 * Dodanie tankowania przez kierowcę. Kierowca nie ma RLS-owego dostępu do
 * workspaces — zapis idzie przez service role (read-modify-write tablicy
 * `tankowanie` w danych miesiąca). Wpis ląduje w kosztach admina (kategoria
 * paliwo/AdBlue, VAT 23%). Generuje powiadomienie (+ push) do adminów.
 *
 * body: { data?, koszt, litry?, sprzedawca?, nip?, zalacznik? (dataUrl) }
 */
export async function POST(req: NextRequest) {
  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: "Brak sesji" }, { status: 401 });
  if (profile.role !== "driver") {
    return NextResponse.json({ error: "Tylko dla kierowcy" }, { status: 403 });
  }

  let body: {
    data?: string;
    koszt?: number;
    litry?: number;
    sprzedawca?: string;
    nip?: string;
    zalacznik?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowy JSON" }, { status: 400 });
  }

  // Kwota brutto — obowiązkowa
  const koszt =
    typeof body.koszt === "number" && isFinite(body.koszt) && body.koszt > 0
      ? Math.round(body.koszt * 100) / 100
      : null;
  if (koszt === null) {
    return NextResponse.json({ error: "Podaj kwotę tankowania." }, { status: 400 });
  }

  // Data → wyznacz miesiąc; brak/niepoprawna = dziś
  const iso =
    typeof body.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.data)
      ? body.data
      : new Date().toISOString().slice(0, 10);
  const [rok, mc] = iso.split("-").map(Number);
  const miesiac = mc as MiesiącId;
  if (rok !== ROK || !MIESIACE_ZAKRESU.includes(miesiac as (typeof MIESIACE_ZAKRESU)[number])) {
    return NextResponse.json({ error: "Data spoza dozwolonego zakresu." }, { status: 400 });
  }

  const litry =
    typeof body.litry === "number" && isFinite(body.litry) && body.litry > 0
      ? Math.round(body.litry * 100) / 100
      : undefined;

  const admin = getAdminSupabase();
  const { data: ws, error } = await admin
    .from("workspaces")
    .select("data")
    .eq("id", profile.workspace_id)
    .single();
  if (error || !ws) {
    return NextResponse.json({ error: "Workspace nie znaleziony" }, { status: 404 });
  }

  const wsData = (ws.data ?? {}) as WorkspaceData;
  const dane = (wsData.miesiace?.[miesiac] ?? pustyMiesiac()) as DaneMiesiaca;

  if (dane.zamkniety?.locked) {
    return NextResponse.json({ error: "Miesiąc jest zamknięty." }, { status: 409 });
  }

  const ustawienia = getUstawienia(wsData);

  // Załącznik (zdjęcie paragonu) — opcjonalny
  let zalaczniki: KosztZalacznik[] | undefined;
  if (typeof body.zalacznik === "string" && body.zalacznik.startsWith("data:image/")) {
    zalaczniki = [
      {
        id: crypto.randomUUID(),
        typ: "dokument",
        nazwa: "paragon.jpg",
        mime: "image/jpeg",
        dataUrl: body.zalacznik,
        createdAt: new Date().toISOString(),
      },
    ];
  }

  const wpis: WpisTankowania = {
    id: crypto.randomUUID(),
    data: iso,
    koszt,
    litry,
    dodaneBy: profile.name,
    documentStatus: zalaczniki ? "paragon" : "brak",
    hasInvoice: true,
    supplierName: body.sprzedawca?.trim() || undefined,
    supplierNip: body.nip?.replace(/[^0-9]/g, "").slice(0, 15) || undefined,
    amountMode: "brutto",
    vatRate: "0.23", // paliwo zawsze 23%
    vatDeductible: true,
    vatDeductionPercent: ustawienia.fuelVatDeductionPercent,
    kategoria: "paliwo_adblue",
    kategoriaZrodlo: "rule",
    vatZrodlo: "rule",
    zalaczniki,
  };

  const nowaData: WorkspaceData = {
    ...wsData,
    miesiace: {
      ...wsData.miesiace,
      [miesiac]: { ...dane, tankowanie: [...(dane.tankowanie ?? []), wpis] },
    },
  };

  const { error: saveErr } = await admin
    .from("workspaces")
    .update({ data: nowaData, updated_at: new Date().toISOString() })
    .eq("id", profile.workspace_id);
  if (saveErr) {
    return NextResponse.json({ error: saveErr.message }, { status: 503 });
  }

  // Powiadomienie + push do adminów
  const litryTxt = litry ? ` (${litry} l)` : "";
  const opis = `${profile.name} dodał tankowanie: ${formatZlCaly(koszt)}${litryTxt} z dnia ${iso.slice(8)}.${String(miesiac).padStart(2, "0")}`;
  const url = `/admin?miesiac=${miesiac}&zakladka=koszty`;

  try {
    await admin.from("audit_log").insert({
      workspace_id: profile.workspace_id,
      user_id: profile.id,
      user_name: profile.name,
      action: "tankowanie_kierowca",
      entity: "cost",
      entity_id: wpis.id,
      new_value: { koszt, litry: litry ?? null },
      description: opis,
    });
    await admin.from("notifications_log").insert({
      workspace_id: profile.workspace_id,
      user_name: profile.name,
      action: "tankowanie_kierowca",
      description: opis,
      url,
      read: false,
    });

    const wp = getWebPush();
    if (wp) {
      const { data: subs } = await admin
        .from("push_subscriptions")
        .select("id, user_name, subscription")
        .eq("workspace_id", profile.workspace_id);
      if (subs?.length) {
        const payload = JSON.stringify({ title: "PapiTrans — tankowanie", body: opis, url });
        await Promise.all(
          (subs as SubRow[]).map(async (s) => {
            if (s.user_name === profile.name) return;
            try {
              await wp.sendNotification(
                s.subscription as Parameters<typeof wp.sendNotification>[0],
                payload
              );
            } catch (e: unknown) {
              const status = (e as { statusCode?: number })?.statusCode;
              if (status === 404 || status === 410) {
                await admin.from("push_subscriptions").delete().eq("id", s.id);
              }
            }
          })
        );
      }
    }
  } catch (e) {
    console.error("[driver/fuel] notification error", e);
    // Powiadomienie nieobowiązkowe — wpis i tak zapisany
  }

  return NextResponse.json({ ok: true, wpis });
}
