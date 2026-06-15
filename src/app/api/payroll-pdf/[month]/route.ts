import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { PDFDocument, rgb, PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { getSessionProfile } from "@/lib/supabase-server";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { obliczWynagrodzenie, sumaObciazen, liczDniWgTypu, parseNum, formatZl } from "@/lib/business-logic";
import { getDniMiesiaca, nazwaDnia, nrDnia, POLSKIE_MIESIACE, MIESIACE_ZAKRESU } from "@/lib/dates";
import { TYP_DNIA_LABEL, czyWolny, maKolka } from "@/lib/day-type";
import { DaneMiesiaca, MiesiącId, WorkspaceData } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

type Params = { params: Promise<{ month: string }> };

function font(name: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(process.cwd(), "public", "fonts", name)));
}

function dataPL(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { month } = await params;
  const miesiac = Number(month) as MiesiącId;
  if (!MIESIACE_ZAKRESU.includes(miesiac as (typeof MIESIACE_ZAKRESU)[number])) {
    return NextResponse.json({ error: "Nieprawidłowy miesiąc" }, { status: 400 });
  }

  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: "Brak sesji" }, { status: 401 });
  // Admin → PDF kierowcy; driver → tylko własny (oba czytają ten sam workspace)
  if (profile.role !== "admin" && profile.role !== "driver") {
    return NextResponse.json({ error: "Brak dostępu" }, { status: 403 });
  }

  const admin = getAdminSupabase();
  const { data: ws, error } = await admin
    .from("workspaces")
    .select("data")
    .eq("id", profile.workspace_id)
    .single();
  if (error || !ws) return NextResponse.json({ error: "Workspace nie znaleziony" }, { status: 404 });

  // Imię kierowcy
  const { data: drv } = await admin
    .from("drivers")
    .select("name")
    .eq("workspace_id", profile.workspace_id)
    .limit(1)
    .maybeSingle();
  const imieKierowcy = drv?.name ?? (profile.role === "driver" ? profile.name : "Kierowca");

  const wsData = (ws.data ?? {}) as WorkspaceData;
  const dane = (wsData.miesiace?.[miesiac] ?? { dni: {}, obciazenia: [], wyplata: undefined }) as DaneMiesiaca;
  const dni = dane.dni ?? {};
  const { dniowki, premia, wynagrodzenie, liczbaSobot } = obliczWynagrodzenie(miesiac, dni);

  // Rozbicie kwot
  let zarobekKolka = 0, zarobekZlecen = 0, szkolenie = 0, dodatkiNd = 0, zarobekUrlop = 0, kolkaTotal = 0;
  for (const iso of getDniMiesiaca(miesiac)) {
    const i = dniowki[iso];
    if (!i) continue;
    zarobekKolka += i.kwotaKolek;
    zarobekZlecen += i.kwotaZlecen;
    szkolenie += i.szkolenie;
    dodatkiNd += i.dodatekNiedzielny;
    zarobekUrlop += i.urlop;
    kolkaTotal += parseNum(dni[iso]?.kolka);
  }
  const obciazeniaSuma = sumaObciazen(dane.obciazenia);
  const doWyplaty = wynagrodzenie - obciazeniaSuma;
  const liczby = liczDniWgTypu(dni);
  const wyplacone = dane.wyplata?.status === "wypłacone";

  // ── Generuj PDF ────────────────────────────────────────────────────────────
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const reg = await pdf.embedFont(font("Roboto-Regular.ttf"), { subset: true });
  const bold = await pdf.embedFont(font("Roboto-Bold.ttf"), { subset: true });

  let page = pdf.addPage([595, 842]); // A4
  const M = 48;
  const W = 595 - 2 * M;
  let y = 842 - M;
  const amber = rgb(0.96, 0.65, 0.14);
  const dark = rgb(0.13, 0.13, 0.15);
  const gray = rgb(0.45, 0.45, 0.5);
  const red = rgb(0.78, 0.2, 0.2);

  const text = (s: string, x: number, yy: number, size: number, f: PDFFont = reg, color = dark) =>
    page.drawText(s, { x, y: yy, size, font: f, color });
  const right = (s: string, xRight: number, yy: number, size: number, f: PDFFont = reg, color = dark) =>
    page.drawText(s, { x: xRight - f.widthOfTextAtSize(s, size), y: yy, size, font: f, color });

  function nowaStrona() {
    page = pdf.addPage([595, 842]);
    y = 842 - M;
  }
  function ensure(h: number) {
    if (y - h < M + 40) nowaStrona();
  }

  // Nagłówek
  text("PapiTrans", M, y, 22, bold, amber);
  right("Rozliczenie wynagrodzenia", M + W, y, 14, bold);
  y -= 16;
  text("El Jefe de la Ruta", M, y, 9, reg, gray);
  y -= 28;
  page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 1, color: amber });
  y -= 24;

  // Dane
  text(`Miesiąc: ${POLSKIE_MIESIACE[miesiac]} 2026`, M, y, 11, bold);
  right(`Kierowca: ${imieKierowcy}`, M + W, y, 11, bold);
  y -= 16;
  text(`Wygenerowano: ${dataPL(new Date().toISOString())}`, M, y, 9, reg, gray);
  right(
    wyplacone ? `Status: WYPŁACONE${dane.wyplata?.paidAt ? ` (${dataPL(dane.wyplata.paidAt)})` : ""}` : "Status: NIEWYPŁACONE",
    M + W, y, 9, bold, wyplacone ? rgb(0.1, 0.55, 0.2) : red
  );
  y -= 26;

  // Tabela dni
  text("Dni", M, y, 12, bold, amber);
  y -= 16;
  const cols = { dzien: M, typ: M + 130, kolka: M + 300, dniowka: M + W };
  text("Data", cols.dzien, y, 9, bold, gray);
  text("Typ", cols.typ, y, 9, bold, gray);
  right("Kółka", cols.kolka, y, 9, bold, gray);
  right("Dniówka", cols.dniowka, y, 9, bold, gray);
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.5, color: gray });
  y -= 14;

  const dniDoPokazania = getDniMiesiaca(miesiac).filter((iso) => {
    const typ = dni[iso]?.dayType ?? "pracujacy";
    return (dniowki[iso]?.dniowka ?? 0) > 0 || typ !== "pracujacy";
  });
  for (const iso of dniDoPokazania) {
    ensure(14);
    const typ = dni[iso]?.dayType ?? "pracujacy";
    const wolny = czyWolny(typ);
    text(`${nrDnia(iso)} ${nazwaDnia(iso)}`, cols.dzien, y, 9);
    text(typ === "pracujacy" ? "pracujący" : TYP_DNIA_LABEL[typ], cols.typ, y, 9, reg, typ === "pracujacy" ? dark : amber);
    // Kółka: liczba dla P/P+Z, „—" dla wolnych i samego Z
    right(wolny || !maKolka(typ) ? "—" : String(parseNum(dni[iso]?.kolka)), cols.kolka, y, 9);
    // Dniówka: pokaż gdy > 0 (także urlop płatny 250)
    right((dniowki[iso]?.dniowka ?? 0) > 0 ? formatZl(dniowki[iso].dniowka) : "—", cols.dniowka, y, 9);
    y -= 14;
  }
  y -= 4;
  page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.5, color: gray });
  y -= 18;

  // Podsumowanie dni
  ensure(20);
  text(
    `Dni pracujące: ${liczby.pracujace}   Wolne: ${liczby.wolne}   Urlop: ${liczby.urlop}   L4: ${liczby.chorobowe}`,
    M, y, 9, reg, gray
  );
  y -= 14;
  text(`Łącznie kółek: ${kolkaTotal}    Przepracowane soboty: ${liczbaSobot}/4`, M, y, 9, reg, gray);
  y -= 26;

  // Rozbicie wypłaty
  ensure(140);
  text("Rozbicie wypłaty", M, y, 12, bold, amber);
  y -= 18;
  const wiersz = (label: string, kwota: number, opts?: { bold?: boolean; minus?: boolean; color?: ReturnType<typeof rgb> }) => {
    const f = opts?.bold ? bold : reg;
    text(label, M + 8, y, opts?.bold ? 11 : 10, f, opts?.color ?? dark);
    right(`${opts?.minus ? "− " : ""}${formatZl(kwota)}`, M + W - 8, y, opts?.bold ? 11 : 10, f, opts?.color ?? dark);
    y -= opts?.bold ? 18 : 15;
  };
  wiersz("Zarobek z kółek", zarobekKolka);
  if (zarobekZlecen > 0) wiersz("Zarobek ze zleceń", zarobekZlecen);
  if (zarobekUrlop > 0) wiersz("Urlop (płatny)", zarobekUrlop);
  if (szkolenie > 0) wiersz("Szkolenie", szkolenie);
  if (dodatkiNd > 0) wiersz("Dodatki niedzielne", dodatkiNd);
  if (premia > 0) wiersz("Premia sobotnia", premia, { color: amber });
  if (obciazeniaSuma > 0) {
    page.drawLine({ start: { x: M + 8, y: y + 8 }, end: { x: M + W - 8, y: y + 8 }, thickness: 0.4, color: gray });
    wiersz("Obciążenia", obciazeniaSuma, { minus: true, color: red });
    for (const o of dane.obciazenia ?? []) {
      ensure(12);
      text(`   • ${o.nazwa}${o.data ? ` (${o.data})` : ""}`, M + 8, y, 8, reg, gray);
      right(`− ${formatZl(o.kwota)}`, M + W - 8, y, 8, reg, gray);
      y -= 12;
    }
  }
  page.drawLine({ start: { x: M, y: y + 6 }, end: { x: M + W, y: y + 6 }, thickness: 1, color: amber });
  y -= 4;
  wiersz("DO WYPŁATY", doWyplaty, { bold: true });

  // Stopka
  const stopkaY = M;
  page.drawLine({ start: { x: M, y: stopkaY + 16 }, end: { x: M + W, y: stopkaY + 16 }, thickness: 0.4, color: gray });
  text(
    `Dokument wygenerowany z systemu PapiTrans — ${dataPL(new Date().toISOString())} ${new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}`,
    M, stopkaY, 8, reg, gray
  );

  const bytes = await pdf.save();
  const slug = imieKierowcy.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "") || "kierowca";
  const filename = `wyplata-${slug}-2026-${String(miesiac).padStart(2, "0")}.pdf`;

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
