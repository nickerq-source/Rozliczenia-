import { NextRequest, NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/supabase-server";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { getWebPush } from "@/lib/webpush";
import { getUstawienia } from "@/lib/tax";
import { uploadParagon, removeParagon } from "@/lib/storage";
import { formatZlCaly, parseNum } from "@/lib/business-logic";
import { MIESIACE_ZAKRESU, POLSKIE_MIESIACE, ROK } from "@/lib/dates";
import {
  getFuelVehicles,
  recalculateWorkspaceFuelChains,
} from "@/lib/recalculate-fuel-chain";
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

interface AdminProfileRow {
  name: string;
}

/** Pusty (bezpieczny) szkielet miesiąca, gdy jeszcze nie istnieje */
function pustyMiesiac(): DaneMiesiaca {
  return { faktury: [], dni: {}, tankowanie: [], inneKoszty: [], leasing: 2300 };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function validPositiveNumber(v: unknown): number | undefined {
  return typeof v === "number" && isFinite(v) && v > 0 ? round2(v) : undefined;
}

function validMileage(v: unknown): number | undefined {
  return typeof v === "number" && isFinite(v) && v > 0 ? Math.round(v * 10) / 10 : undefined;
}

function inMainAccountingRange(iso: string): boolean {
  return iso >= `${ROK}-06-01` && iso <= `${ROK}-12-31`;
}

/** Akceptujemy rok ROK (2026) i późniejsze; rok wcześniejszy → ROK. */
function korygujRok(iso: string): string {
  return parseInt(iso.slice(0, 4), 10) < ROK ? `${ROK}${iso.slice(4)}` : iso;
}

function monthFromIso(iso: string): MiesiącId {
  const raw = Number(iso.slice(5, 7)) as MiesiącId;
  return MIESIACE_ZAKRESU.includes(raw as (typeof MIESIACE_ZAKRESU)[number]) ? raw : 6;
}

function normalizeAccountingMonth(raw: unknown, iso: string): MiesiącId {
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (Number.isInteger(value) && MIESIACE_ZAKRESU.includes(value as (typeof MIESIACE_ZAKRESU)[number])) {
    return value as MiesiącId;
  }
  return monthFromIso(iso);
}

function findFuelEntry(
  wsData: WorkspaceData,
  id: string
): { miesiac: MiesiącId; dane: DaneMiesiaca; wpis: WpisTankowania } | null {
  for (const m of MIESIACE_ZAKRESU) {
    const miesiac = m as MiesiącId;
    const dane = (wsData.miesiace?.[miesiac] ?? pustyMiesiac()) as DaneMiesiaca;
    const wpis = dane.tankowanie?.find((t) => t.id === id);
    if (wpis) return { miesiac, dane, wpis };
  }
  return null;
}

function similarFuelExists(
  dane: DaneMiesiaca,
  body: {
    data?: string;
    koszt?: number;
    litry?: number;
    sprzedawca?: string;
    documentNumber?: string;
    odometerKm?: number;
  }
): boolean {
  return (dane.tankowanie ?? []).some((entry) => {
    const sameDocument =
      body.documentNumber &&
      entry.invoiceNumber &&
      entry.invoiceNumber.trim().toLowerCase() === body.documentNumber.trim().toLowerCase();
    const sameOdometer =
      body.odometerKm && entry.odometerKm && Math.abs(parseNum(entry.odometerKm) - body.odometerKm) < 1;
    const sameAmount = Math.abs(parseNum(entry.koszt) - parseNum(body.koszt)) <= 0.02;
    const sameLiters =
      !body.litry ||
      !entry.litry ||
      Math.abs(parseNum(entry.litry) - body.litry) <= 0.02;
    const sameDate = !body.data || entry.data === body.data;
    const sameStation =
      !body.sprzedawca ||
      !entry.supplierName ||
      entry.supplierName.trim().toLowerCase() === body.sprzedawca.trim().toLowerCase();
    return !!sameDocument || !!sameOdometer || (sameDate && sameAmount && sameLiters && sameStation);
  });
}

async function uploadFuelAttachment(
  workspaceId: string,
  dataUrl: string | undefined,
  typ: KosztZalacznik["typ"],
  nazwa: string,
  ai?: Pick<KosztZalacznik, "aiDocumentType" | "aiConfidence" | "aiNeedsReview" | "attachmentKind">
): Promise<KosztZalacznik | null> {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) return null;
  const up = await uploadParagon(workspaceId, dataUrl);
  if (!up) return null;
  return {
    id: crypto.randomUUID(),
    typ,
    nazwa,
    mime: up.mime,
    storagePath: up.path,
    createdAt: new Date().toISOString(),
    attachmentKind: ai?.attachmentKind ?? (typ === "dokument" ? "receipt" : "odometer"),
    ...ai,
  };
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
      const { data: admins } = await admin
        .from("profiles")
        .select("name")
        .eq("workspace_id", profile.workspace_id)
        .eq("role", "admin");
      const adminNames = new Set((admins as AdminProfileRow[] | null | undefined)?.map((a) => a.name) ?? []);
      if (subs?.length) {
        const payload = JSON.stringify({ title: "PapiTrans — tankowanie", body: opts.opis, url: opts.url });
        await Promise.all(
          (subs as SubRow[]).map(async (s) => {
            if (s.user_name === profile.name) return;
            if (adminNames.size && !adminNames.has(s.user_name)) return;
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
 * body: { data?, koszt, litry?, sprzedawca?, nip?, receiptImage?, odometerImage? }
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
    cenaZaLitr?: number;
    netAmount?: number;
    vatAmount?: number;
    sprzedawca?: string;
    nip?: string;
    vatRate?: VatRate;
    vatNeedsReview?: boolean;
    aiNeedsReview?: boolean;
    documentNumber?: string;
    fuelType?: string;
    odometerKm?: number;
    mileageSource?: WpisTankowania["mileageSource"];
    mileageConfidence?: number;
    tachoStatus?: string;
    speed?: number;
    note?: string;
    accountingMonth?: number;
    includeInReports?: boolean;
    vehicleId?: string;
    isFullTank?: boolean;
    confirmDuplicate?: boolean;
    zalacznik?: string;
    receiptImage?: string;
    odometerImage?: string;
    tachographImage?: string;
    receiptConfidence?: number;
    odometerConfidence?: number;
    tachographConfidence?: number;
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

  // Data z paragonu/faktury. Stare daty nie blokują zapisu — trafiają jako
  // historyczne pending do decyzji admina. Rok zawsze korygujemy na ROK.
  const iso = korygujRok(
    typeof body.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.data)
      ? body.data
      : new Date().toISOString().slice(0, 10)
  );
  const isHistorical = !inMainAccountingRange(iso);
  const accountingMonth = isHistorical ? normalizeAccountingMonth(body.accountingMonth, iso) : monthFromIso(iso);
  const accountingYear = ROK;
  const includeInReports = isHistorical ? false : true;
  const miesiac = accountingMonth;

  const litry =
    typeof body.litry === "number" && isFinite(body.litry) && body.litry > 0
      ? Math.round(body.litry * 100) / 100
      : undefined;
  const cenaZaLitr = validPositiveNumber(body.cenaZaLitr);
  const netAmount = validPositiveNumber(body.netAmount);
  const vatAmount = validPositiveNumber(body.vatAmount);
  const odometerKm = validMileage(body.odometerKm);
  const requestedVehicleId = typeof body.vehicleId === "string" ? body.vehicleId.trim() : "";

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
  const vehicles = getFuelVehicles(wsData);
  const vehicleId = requestedVehicleId || (vehicles.length === 1 ? vehicles[0].id : "");
  if (!vehicleId || !vehicles.some((vehicle) => vehicle.id === vehicleId)) {
    return NextResponse.json({ error: "Wybierz pojazd dla tankowania." }, { status: 400 });
  }
  const dane = (wsData.miesiace?.[miesiac] ?? pustyMiesiac()) as DaneMiesiaca;

  // Tankowanie od kierowcy zapisuje się jako pending i nie wpływa na raporty,
  // więc zamknięcie miesiąca nie może blokować samego przyjęcia zgłoszenia.
  // Zatwierdzenie do kosztów nadal robi admin i to tam pilnujemy zamknięcia.

  if (!body.confirmDuplicate && similarFuelExists(dane, { ...body, data: iso, koszt, litry, odometerKm })) {
    return NextResponse.json(
      {
        duplicate: true,
        error: "Podobne tankowanie już istnieje. Czy na pewno dodać ponownie?",
      },
      { status: 409 }
    );
  }

  const ustawienia = getUstawienia(wsData);

  const receiptImage = body.receiptImage ?? body.zalacznik;
  const [receiptAttachment, odometerAttachment, tachographAttachment] = await Promise.all([
    uploadFuelAttachment(profile.workspace_id, receiptImage, "dokument", "paragon.jpg", {
      aiDocumentType: "receipt",
      attachmentKind: "receipt",
      aiConfidence: body.receiptConfidence,
      aiNeedsReview: body.aiNeedsReview,
    }),
    uploadFuelAttachment(profile.workspace_id, body.odometerImage, "licznik", "licznik.jpg", {
      aiDocumentType: "odometer",
      attachmentKind: "odometer",
      aiConfidence: body.odometerConfidence,
      aiNeedsReview: body.aiNeedsReview,
    }),
    uploadFuelAttachment(profile.workspace_id, body.tachographImage, "licznik", "tachograf.jpg", {
      aiDocumentType: "tachograph",
      attachmentKind: "tachograph",
      aiConfidence: body.tachographConfidence,
      aiNeedsReview: body.aiNeedsReview,
    }),
  ]);
  const zalaczniki = [receiptAttachment, odometerAttachment, tachographAttachment].filter(Boolean) as KosztZalacznik[];
  const hasReceiptPhoto = !!receiptAttachment;
  const vatRate = body.vatRate && DOZWOLONE_VAT.includes(body.vatRate) ? body.vatRate : undefined;
  const vatNeedsReview = body.vatNeedsReview || !vatRate;
  const wpis: WpisTankowania = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    data: iso,
    expenseDate: iso,
    accountingMonth,
    accountingYear,
    isHistorical,
    includeInReports,
    status: "pending",
    koszt,
    litry,
    dodaneBy: profile.name,
    createdBy: profile.id,
    paidBy: "Firma",
    documentStatus: hasReceiptPhoto ? "paragon" : "brak",
    hasInvoice: hasReceiptPhoto && !vatNeedsReview,
    supplierName: body.sprzedawca?.trim() || undefined,
    stationName: body.sprzedawca?.trim() || undefined,
    supplierNip: body.nip?.replace(/[^0-9]/g, "").slice(0, 15) || undefined,
    invoiceNumber: body.documentNumber?.trim() || undefined,
    amountMode: "brutto",
    vatRate,
    vatDeductible: !!vatRate && !vatNeedsReview,
    vatDeductionPercent: ustawienia.fuelVatDeductionPercent,
    kategoria: "paliwo_adblue",
    kategoriaZrodlo: "rule",
    vatZrodlo: vatRate ? "ai" : "manual",
    taxNote: vatNeedsReview ? "VAT do sprawdzenia" : undefined,
    zalaczniki: zalaczniki.length ? zalaczniki : undefined,
    fuelType: body.fuelType?.trim() || undefined,
    pricePerLiter: cenaZaLitr,
    netAmount,
    vatAmount,
    odometerKm,
    mileageSource: body.mileageSource ?? (tachographAttachment ? "tachograph" : odometerKm ? "manual" : undefined),
    mileageConfidence: validPositiveNumber(body.mileageConfidence ?? body.tachographConfidence ?? body.odometerConfidence),
    tachoStatus: body.tachoStatus?.trim() || undefined,
    speed: typeof body.speed === "number" && isFinite(body.speed) ? body.speed : undefined,
    note: body.note?.trim() || undefined,
    vehicleId,
    isFullTank: body.isFullTank ?? true,
  };

  const rawData: WorkspaceData = {
    ...wsData,
    miesiace: {
      ...wsData.miesiace,
      [miesiac]: { ...dane, tankowanie: [...(dane.tankowanie ?? []), wpis] },
    },
  };
  const nowaData = recalculateWorkspaceFuelChains(rawData).data;
  const zapisanyWpis = nowaData.miesiace?.[miesiac]?.tankowanie.find((entry) => entry.id === wpis.id) ?? wpis;

  const { error: saveErr } = await admin
    .from("workspaces")
    .update({ data: nowaData, updated_at: new Date().toISOString() })
    .eq("id", profile.workspace_id);
  if (saveErr) {
    return NextResponse.json({ error: saveErr.message }, { status: 503 });
  }

  // Powiadomienie + push do adminów
  const litryTxt = litry ? `, ${litry} l` : "";
  const odoTxt = odometerKm ? `, przebieg ${odometerKm} km` : ", przebieg nieuzupełniony";
  const opis = isHistorical
    ? `Kierowca ${profile.name} dodał historyczne tankowanie: ${formatZlCaly(koszt)} z dnia ${iso} — wybierz, czy zapisać w archiwum czy przypisać do miesiąca.`
    : `Kierowca ${profile.name} dodał tankowanie: ${formatZlCaly(koszt)}${litryTxt}${odoTxt} — do zatwierdzenia.`;
  const url = `/admin?miesiac=${miesiac}&zakladka=koszty`;
  await powiadomAdminow(admin, profile, {
    action: "tankowanie_kierowca",
    entityId: wpis.id,
    newValue: { koszt, litry: litry ?? null, odometerKm: odometerKm ?? null, status: wpis.status, isHistorical, includeInReports },
    opis,
    url,
  });

  return NextResponse.json({ ok: true, wpis: zapisanyWpis });
}

/**
 * Aktualizacja własnego tankowania kierowcy, dopóki wpis ma status pending.
 * Służy m.in. do dopięcia zdjęcia licznika/tacho po wysłaniu paragonu.
 */
export async function PATCH(req: NextRequest) {
  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: "Brak sesji" }, { status: 401 });
  if (profile.role !== "driver") {
    return NextResponse.json({ error: "Tylko dla kierowcy" }, { status: 403 });
  }

  let body: {
    id?: string;
    data?: string;
    koszt?: number;
    litry?: number;
    cenaZaLitr?: number;
    sprzedawca?: string;
    documentNumber?: string;
    odometerKm?: number;
    mileageSource?: WpisTankowania["mileageSource"];
    mileageConfidence?: number;
    tachoStatus?: string;
    speed?: number;
    note?: string;
    receiptImage?: string;
    odometerImage?: string;
    tachographImage?: string;
    receiptConfidence?: number;
    odometerConfidence?: number;
    tachographConfidence?: number;
    aiNeedsReview?: boolean;
    isFullTank?: boolean;
    vehicleId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowy JSON" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "Brak ID tankowania." }, { status: 400 });

  const admin = getAdminSupabase();
  const { data: ws, error } = await admin
    .from("workspaces")
    .select("data")
    .eq("id", profile.workspace_id)
    .single();
  if (error || !ws) return NextResponse.json({ error: "Workspace nie znaleziony" }, { status: 404 });

  const wsData = (ws.data ?? {}) as WorkspaceData;
  const vehicles = getFuelVehicles(wsData);
  const found = findFuelEntry(wsData, body.id);
  if (!found) return NextResponse.json({ error: "Nie znaleziono tankowania." }, { status: 404 });
  const { miesiac: sourceMonth, dane: sourceDane, wpis } = found;

  if (wpis.dodaneBy !== profile.name && wpis.createdBy !== profile.id) {
    return NextResponse.json({ error: "Możesz edytować tylko własne tankowania." }, { status: 403 });
  }
  if ((wpis.status ?? "approved") !== "pending") {
    return NextResponse.json({ error: "Możesz edytować tylko tankowania do sprawdzenia." }, { status: 403 });
  }

  const iso = korygujRok(
    typeof body.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.data)
      ? body.data
      : wpis.expenseDate ?? wpis.data
  );
  const isHistorical = !inMainAccountingRange(iso);
  const accountingMonth = isHistorical ? normalizeAccountingMonth(wpis.accountingMonth, iso) : monthFromIso(iso);
  const accountingYear = ROK;
  const includeInReports = isHistorical ? false : true;
  const koszt =
    typeof body.koszt === "number" && isFinite(body.koszt) && body.koszt > 0
      ? Math.round(body.koszt * 100) / 100
      : wpis.koszt;
  const litry =
    typeof body.litry === "number" && isFinite(body.litry) && body.litry > 0
      ? Math.round(body.litry * 100) / 100
      : body.litry === null
      ? undefined
      : wpis.litry;
  const pricePerLiter = validPositiveNumber(body.cenaZaLitr) ?? wpis.pricePerLiter;
  const odometerKm = validMileage(body.odometerKm) ?? wpis.odometerKm;
  const requestedVehicleId = typeof body.vehicleId === "string" ? body.vehicleId.trim() : "";
  const vehicleId = requestedVehicleId || wpis.vehicleId || (vehicles.length === 1 ? vehicles[0].id : "");
  if (!vehicleId || !vehicles.some((vehicle) => vehicle.id === vehicleId)) {
    return NextResponse.json({ error: "Wybierz pojazd dla tankowania." }, { status: 400 });
  }

  const [receiptAttachment, odometerAttachment, tachographAttachment] = await Promise.all([
    uploadFuelAttachment(profile.workspace_id, body.receiptImage, "dokument", "paragon.jpg", {
      aiDocumentType: "receipt",
      attachmentKind: "receipt",
      aiConfidence: body.receiptConfidence,
      aiNeedsReview: body.aiNeedsReview,
    }),
    uploadFuelAttachment(profile.workspace_id, body.odometerImage, "licznik", "licznik.jpg", {
      aiDocumentType: "odometer",
      attachmentKind: "odometer",
      aiConfidence: body.odometerConfidence,
      aiNeedsReview: body.aiNeedsReview,
    }),
    uploadFuelAttachment(profile.workspace_id, body.tachographImage, "licznik", "tachograf.jpg", {
      aiDocumentType: "tachograph",
      attachmentKind: "tachograph",
      aiConfidence: body.tachographConfidence,
      aiNeedsReview: body.aiNeedsReview,
    }),
  ]);
  const addedAttachments = [receiptAttachment, odometerAttachment, tachographAttachment].filter(Boolean) as KosztZalacznik[];
  const zalaczniki = [...(wpis.zalaczniki ?? []), ...addedAttachments];
  const hasReceiptPhoto = zalaczniki.some((z) => z.attachmentKind === "receipt" || z.typ === "dokument");

  const updated: WpisTankowania = {
    ...wpis,
    data: iso,
    expenseDate: iso,
    accountingMonth,
    accountingYear,
    isHistorical,
    includeInReports,
    status: "pending",
    koszt,
    litry,
    pricePerLiter,
    supplierName: typeof body.sprzedawca === "string" ? body.sprzedawca.trim() || undefined : wpis.supplierName,
    stationName: typeof body.sprzedawca === "string" ? body.sprzedawca.trim() || undefined : wpis.stationName,
    invoiceNumber: typeof body.documentNumber === "string" ? body.documentNumber.trim() || undefined : wpis.invoiceNumber,
    odometerKm,
    mileageSource:
      body.mileageSource ??
      (tachographAttachment ? "tachograph" : odometerAttachment ? "ai" : odometerKm ? wpis.mileageSource ?? "manual" : undefined),
    mileageConfidence: validPositiveNumber(body.mileageConfidence ?? body.tachographConfidence ?? body.odometerConfidence) ?? wpis.mileageConfidence,
    tachoStatus: typeof body.tachoStatus === "string" ? body.tachoStatus.trim() || undefined : wpis.tachoStatus,
    speed: typeof body.speed === "number" && isFinite(body.speed) ? body.speed : wpis.speed,
    note: typeof body.note === "string" ? body.note.trim() || undefined : wpis.note,
    documentStatus: hasReceiptPhoto ? "paragon" : wpis.documentStatus,
    hasInvoice: hasReceiptPhoto ? wpis.hasInvoice : false,
    zalaczniki: zalaczniki.length ? zalaczniki : undefined,
    updatedAt: new Date().toISOString(),
    vehicleId,
    isFullTank: body.isFullTank ?? wpis.isFullTank ?? true,
  };

  const targetMonth = accountingMonth as MiesiącId;
  const targetDane = (wsData.miesiace?.[targetMonth] ?? pustyMiesiac()) as DaneMiesiaca;
  const rawData: WorkspaceData = {
    ...wsData,
    miesiace: {
      ...wsData.miesiace,
      [sourceMonth]:
        sourceMonth === targetMonth
          ? { ...sourceDane, tankowanie: sourceDane.tankowanie.map((t) => (t.id === wpis.id ? updated : t)) }
          : { ...sourceDane, tankowanie: sourceDane.tankowanie.filter((t) => t.id !== wpis.id) },
      ...(sourceMonth === targetMonth
        ? {}
        : { [targetMonth]: { ...targetDane, tankowanie: [...(targetDane.tankowanie ?? []), updated] } }),
    },
  };
  const nowaData = recalculateWorkspaceFuelChains(rawData).data;
  const zapisanyWpis = nowaData.miesiace?.[targetMonth]?.tankowanie.find((entry) => entry.id === wpis.id) ?? updated;

  const { error: saveErr } = await admin
    .from("workspaces")
    .update({ data: nowaData, updated_at: new Date().toISOString() })
    .eq("id", profile.workspace_id);
  if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 503 });

  const addedTacho = !!tachographAttachment || !!odometerAttachment;
  const opis = addedTacho
    ? odometerKm
      ? `Kierowca ${profile.name} dodał zdjęcie tacho. Rozpoznany przebieg: ${odometerKm} km.`
      : `Kierowca ${profile.name} dodał zdjęcie licznika/tacho do tankowania ${formatZlCaly(koszt)} z dnia ${iso}.`
    : `Kierowca ${profile.name} zaktualizował tankowanie ${formatZlCaly(koszt)} z dnia ${iso}.`;
  await powiadomAdminow(admin, profile, {
    action: addedTacho ? "tankowanie_tacho_dodane" : "tankowanie_kierowca_zmienione",
    entityId: wpis.id,
    oldValue: { koszt: wpis.koszt, data: wpis.data, odometerKm: wpis.odometerKm },
    newValue: { koszt: updated.koszt, data: updated.data, odometerKm: updated.odometerKm, status: updated.status },
    opis,
    url: `/admin?miesiac=${targetMonth}&zakladka=koszty`,
  });

  return NextResponse.json({ ok: true, wpis: zapisanyWpis, miesiac: targetMonth });
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

  const wsData = recalculateWorkspaceFuelChains((ws.data ?? {}) as WorkspaceData, { includePending: true }).data;
  const tankowania: {
    id: string;
    data: string;
    koszt: number;
    litry?: number;
    odometerKm?: number;
    kmSinceLastFuel?: number;
    fuelBeforeRefuelLiters?: number;
    costPerKmGross?: number;
    costPerKmNet?: number;
    fuelConsumptionLPer100Km?: number;
    fuelStatus?: WpisTankowania["fuelStatus"];
    needsReview?: boolean;
    reviewReasons?: string[];
    supplierName?: string;
    stationName?: string;
    zalaczniki?: KosztZalacznik[];
    expenseDate?: string;
    accountingMonth?: number;
    accountingYear?: number;
    isHistorical?: boolean;
    includeInReports?: boolean;
    status?: WpisTankowania["status"];
    tachoStatus?: string;
    speed?: number;
    note?: string;
    rejectionReason?: string;
    vehicleId?: string;
    isFullTank?: boolean;
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
        odometerKm: t.odometerKm,
        kmSinceLastFuel: t.kmSinceLastFuel,
        fuelBeforeRefuelLiters: t.fuelBeforeRefuelLiters,
        costPerKmGross: t.costPerKmGross,
        costPerKmNet: t.costPerKmNet,
        fuelConsumptionLPer100Km: t.fuelConsumptionLPer100Km,
        fuelStatus: t.fuelStatus,
        needsReview: t.needsReview,
        reviewReasons: t.reviewReasons ?? [],
        supplierName: t.supplierName,
        stationName: t.stationName,
        zalaczniki: t.zalaczniki ?? [],
        expenseDate: t.expenseDate,
        accountingMonth: t.accountingMonth,
        accountingYear: t.accountingYear,
        isHistorical: t.isHistorical,
        includeInReports: t.includeInReports,
        status: t.status,
        tachoStatus: t.tachoStatus,
        speed: t.speed,
        note: t.note,
        rejectionReason: t.rejectionReason,
        vehicleId: t.vehicleId,
        isFullTank: t.isFullTank ?? true,
        miesiac: m,
        nazwaMiesiaca: POLSKIE_MIESIACE[m],
        zamkniety,
      });
    }
  }
  // Najnowsze na górze
  tankowania.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));

  return NextResponse.json({ tankowania, vehicles: getFuelVehicles(wsData) });
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
  if (wpis.dodaneBy !== profile.name) {
    return NextResponse.json({ error: "Możesz usuwać tylko własne tankowania." }, { status: 403 });
  }
  if ((wpis.status ?? "approved") !== "pending") {
    return NextResponse.json({ error: "Możesz usuwać tylko tankowania oczekujące." }, { status: 403 });
  }

  const rawData: WorkspaceData = {
    ...wsData,
    miesiace: {
      ...wsData.miesiace,
      [miesiac]: { ...dane, tankowanie: dane.tankowanie.filter((t) => t.id !== id) },
    },
  };
  const nowaData = recalculateWorkspaceFuelChains(rawData).data;

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
