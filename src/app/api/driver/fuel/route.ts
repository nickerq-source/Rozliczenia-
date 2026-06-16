import { NextRequest, NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/supabase-server";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { getWebPush } from "@/lib/webpush";
import { getUstawienia } from "@/lib/tax";
import { uploadParagon, removeParagon } from "@/lib/storage";
import { formatZlCaly, parseNum } from "@/lib/business-logic";
import { MIESIACE_ZAKRESU, POLSKIE_MIESIACE, ROK } from "@/lib/dates";
import {
  DaneMiesiaca,
  KosztZalacznik,
  MiesiącId,
  VatRate,
  WorkspaceData,
  WpisTankowania,
} from "@/lib/types";

export const runtime = "nodejs";

const DOZWOLONE_VAT: VatRate[] = ["0", "0.05", "0.08", "0.23", "zw", "np"];

type Profile = NonNullable<Awaited<ReturnType<typeof getSessionProfile>>>;

interface SubRow {
  id: string;
  user_name: string;
  subscription: object;
}

/** Pusty (bezpieczny) szkielet miesiąca, gdy jeszcze nie istnieje */
function pustyMiesiac(): DaneMiesiaca {
  return { faktury: [], dni: {}, tankowanie: [], inneKoszty: [], leasing: 2300 };
}

/** Powiadomienie (+ push) do adminów o akcji kierowcy na tankowaniu. */
async function powiadomAdminow(
  admin: ReturnType<typeof getAdminSupabase>,
  profile: Profile,
  opts: { action: string; entityId: string; oldValue?: object; newValue?: object; opis: string; url: string }
) {
  try {
    await admin.from("audit_log").insert({
      workspace_id: profile.workspace_id,
      user_id: profile.id,
      user_name: profile.name,
      action: opts.action,
      entity: "cost",
      entity_id: opts.entityId,
      old_value: opts.oldValue ?? null,
      new_value: opts.newValue ?? null,
      description: opts.opis,
    });
    await admin.from("notifications_log").insert({
      workspace_id: profile.workspace_id,
      user_name: profile.name,
      action: opts.action,
      description: opts.opis,
      url: opts.url,
      read: false,
    });

    const wp = getWebPush();
    if (wp) {
      const { data: subs } = await admin
        .from("push_subscriptions")
        .select("id, user_name, subscription")
        .eq("workspace_id", profile.workspace_id);
      if (subs?.length) {
        const payload = JSON.stringify({ title: "PapiTrans — tankowanie", body: opts.opis, url: opts.url });
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
  }
}

/**
 * Dodanie tankowania przez kierowcę. Kierowca nie ma RLS-owego dostępu do
 * workspaces — zapis idzie przez service role (read-modify-write tablicy
 * `tankowanie` w danych miesiąca). Wpis ląduje w kosztach admina (kategoria
 * paliwo/AdBlue, VAT z OCR albo domyślnie 23%). Generuje powiadomienie (+ push) do adminów.
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
    vatRate?: VatRate;
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

  // Załącznik (zdjęcie paragonu) — opcjonalny; ląduje w Storage, w JSONB tylko ścieżka
  let zalaczniki: KosztZalacznik[] | undefined;
  if (typeof body.zalacznik === "string" && body.zalacznik.startsWith("data:image/")) {
    const up = await uploadParagon(profile.workspace_id, body.zalacznik);
    if (up) {
      zalaczniki = [
        {
          id: crypto.randomUUID(),
          typ: "dokument",
          nazwa: "paragon.jpg",
          mime: up.mime,
          storagePath: up.path,
          createdAt: new Date().toISOString(),
        },
      ];
    }
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
    vatRate: body.vatRate && DOZWOLONE_VAT.includes(body.vatRate) ? body.vatRate : "0.23",
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
  await powiadomAdminow(admin, profile, {
    action: "tankowanie_kierowca",
    entityId: wpis.id,
    newValue: { koszt, litry: litry ?? null },
    opis,
    url,
  });

  return NextResponse.json({ ok: true, wpis });
}

/**
 * Lista tankowań dodanych przez tego kierowcę (do podglądu i usuwania w panelu).
 * Zwraca tylko wpisy z dodaneBy === imię kierowcy.
 */
export async function GET() {
  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: "Brak sesji" }, { status: 401 });
  if (profile.role !== "driver") {
    return NextResponse.json({ error: "Tylko dla kierowcy" }, { status: 403 });
  }

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
  const tankowania: {
    id: string;
    data: string;
    koszt: number;
    litry?: number;
    zalaczniki?: KosztZalacznik[];
    miesiac: number;
    nazwaMiesiaca: string;
    zamkniety: boolean;
  }[] = [];

  for (const m of MIESIACE_ZAKRESU) {
    const dane = wsData.miesiace?.[m as MiesiącId];
    if (!dane?.tankowanie) continue;
    const zamkniety = !!dane.zamkniety?.locked;
    for (const t of dane.tankowanie) {
      if (t.dodaneBy !== profile.name) continue;
      tankowania.push({
        id: t.id,
        data: t.data,
        koszt: parseNum(t.koszt),
        litry: t.litry,
        zalaczniki: t.zalaczniki ?? [],
        miesiac: m,
        nazwaMiesiaca: POLSKIE_MIESIACE[m],
        zamkniety,
      });
    }
  }
  // Najnowsze na górze
  tankowania.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));

  return NextResponse.json({ tankowania });
}

/**
 * Usunięcie tankowania przez kierowcę — TYLKO własny wpis (dodaneBy === imię)
 * i tylko w niezamkniętym miesiącu. Kasuje też załącznik w Storage.
 * body: { id, miesiac }
 */
export async function DELETE(req: NextRequest) {
  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: "Brak sesji" }, { status: 401 });
  if (profile.role !== "driver") {
    return NextResponse.json({ error: "Tylko dla kierowcy" }, { status: 403 });
  }

  let body: { id?: string; miesiac?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowy JSON" }, { status: 400 });
  }

  const miesiac = Number(body.miesiac) as MiesiącId;
  const id = body.id;
  if (!id || !MIESIACE_ZAKRESU.includes(miesiac as (typeof MIESIACE_ZAKRESU)[number])) {
    return NextResponse.json({ error: "Brak wymaganych pól" }, { status: 400 });
  }

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
  const dane = wsData.miesiace?.[miesiac] as DaneMiesiaca | undefined;
  const wpis = dane?.tankowanie?.find((t) => t.id === id);
  if (!dane || !wpis) {
    return NextResponse.json({ error: "Nie znaleziono tankowania" }, { status: 404 });
  }
  if (dane.zamkniety?.locked) {
    return NextResponse.json({ error: "Miesiąc jest zamknięty." }, { status: 409 });
  }
  if (wpis.dodaneBy !== profile.name) {
    return NextResponse.json({ error: "Możesz usuwać tylko własne tankowania." }, { status: 403 });
  }

  const nowaData: WorkspaceData = {
    ...wsData,
    miesiace: {
      ...wsData.miesiace,
      [miesiac]: { ...dane, tankowanie: dane.tankowanie.filter((t) => t.id !== id) },
    },
  };

  const { error: saveErr } = await admin
    .from("workspaces")
    .update({ data: nowaData, updated_at: new Date().toISOString() })
    .eq("id", profile.workspace_id);
  if (saveErr) {
    return NextResponse.json({ error: saveErr.message }, { status: 503 });
  }

  // Sprzątanie załączników w Storage
  for (const z of wpis.zalaczniki ?? []) {
    if (z.storagePath) await removeParagon(z.storagePath);
  }

  const koszt = parseNum(wpis.koszt);
  const opis = `${profile.name} usunął tankowanie: ${formatZlCaly(koszt)} z dnia ${wpis.data.slice(8)}.${String(miesiac).padStart(2, "0")}`;
  await powiadomAdminow(admin, profile, {
    action: "tankowanie_kierowca_usuniete",
    entityId: id,
    oldValue: { koszt, litry: wpis.litry ?? null },
    opis,
    url: `/admin?miesiac=${miesiac}&zakladka=koszty`,
  });

  return NextResponse.json({ ok: true });
}
