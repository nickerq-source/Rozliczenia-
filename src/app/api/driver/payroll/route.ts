import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/supabase-server";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { obliczWynagrodzenie, parseNum } from "@/lib/business-logic";
import { MIESIACE_ZAKRESU, POLSKIE_MIESIACE, getDniMiesiaca, nazwaSkrotDnia, isSobota, isNiedziela, nrDnia } from "@/lib/dates";
import { DaneMiesiaca, MiesiącId, WorkspaceData } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Widok wypłaty kierowcy. Kierowca nie ma RLS-owego dostępu do workspaces —
 * ta trasa liczy wypłatę server-side (service role) i zwraca TYLKO dane
 * wynagrodzenia (rozbicie dzień po dniu + stan weryfikacji), bez faktur,
 * kosztów i zysków firmy.
 */
export async function GET() {
  const profile = await getSessionProfile();
  if (!profile) {
    return NextResponse.json({ error: "Brak sesji" }, { status: 401 });
  }
  if (profile.role !== "driver") {
    return NextResponse.json({ error: "Tylko dla kierowcy" }, { status: 403 });
  }

  const { data: ws, error } = await getAdminSupabase()
    .from("workspaces")
    .select("data")
    .eq("id", profile.workspace_id)
    .single();

  if (error || !ws) {
    return NextResponse.json({ error: "Workspace nie znaleziony" }, { status: 404 });
  }

  const wsData = ws.data as WorkspaceData;
  const miesiace = MIESIACE_ZAKRESU.map((m) => {
    const dane = (wsData.miesiace?.[m as MiesiącId] ?? {
      dni: {},
    }) as DaneMiesiaca;
    const dni = dane.dni ?? {};
    const { wynagrodzenie, liczbaSobot, premia, dniowki } = obliczWynagrodzenie(m, dni);

    const dniPracy = Object.values(dni).filter((d) => parseNum(d.kolka) > 0).length;
    const kolka = Object.values(dni).reduce((s, d) => s + parseNum(d.kolka), 0);

    // Rozbicie dni płatnych (dniówka > 0: kółka lub szkolenie) — podlegają weryfikacji
    const rozbicie = getDniMiesiaca(m)
      .filter((iso) => (dniowki[iso]?.dniowka ?? 0) > 0)
      .map((iso) => ({
        data: iso,
        nrDnia: nrDnia(iso),
        skrotDnia: nazwaSkrotDnia(iso),
        sobota: isSobota(iso),
        niedziela: isNiedziela(iso),
        kolka: parseNum(dni[iso]?.kolka),
        szkolenie: parseNum(dni[iso]?.szkolenie),
        dniowka: dniowki[iso]?.dniowka ?? 0,
        dodatekNiedzielny: dniowki[iso]?.dodatekNiedzielny ?? 0,
      }));

    return {
      miesiac: m,
      nazwa: POLSKIE_MIESIACE[m],
      wynagrodzenie,
      dniPracy,
      kolka,
      liczbaSobot,
      premia,
      wyplata: dane.wyplata ?? { status: "niewypłacone" },
      zamkniety: !!dane.zamkniety?.locked,
      dni: rozbicie,
      zgloszenia: dane.zgloszenia ?? [],
    };
  });

  return NextResponse.json({ name: profile.name, miesiace });
}
