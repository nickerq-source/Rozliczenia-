// Logika biznesowa: obliczenia wynagrodzeń, dochodów i zysków

import {
  DaneMiesiaca,
  DzienKierowcy,
  DniowkaInfo,
  WynikMiesiaca,
  FakturaWeek,
} from "./types";
import {
  getDniMiesiaca,
  isNiedziela,
  isSobota,
  poprzedniDzien,
  getWeeksOfMonth,
} from "./dates";

/** Bezpieczne parsowanie liczby — puste lub NaN zwraca 0 */
export function parseNum(val: string | number | undefined | null): number {
  if (val === "" || val === null || val === undefined) return 0;
  const n = typeof val === "number" ? val : parseFloat(String(val).replace(",", "."));
  return isNaN(n) ? 0 : n;
}

/** Formatuje kwotę po polsku: 1 234,00 zł */
export function formatZl(kwota: number): string {
  return kwota.toLocaleString("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " zł";
}

/** Formatuje kwotę bez groszy jeśli całkowita */
export function formatZlCaly(kwota: number): string {
  if (kwota % 1 === 0) {
    return kwota.toLocaleString("pl-PL") + " zł";
  }
  return formatZl(kwota);
}

// ─── DNIÓWKA ──────────────────────────────────────────────────────────────────

/**
 * Oblicza dniówkę dla jednego dnia.
 * @param iso      - data "YYYY-MM-DD"
 * @param dzien    - dane dnia kierowcy
 * @param dniMap   - mapa wszystkich dni miesiąca (potrzebna do sprawdzenia poprzedniej soboty)
 * @param miesiac  - numer miesiąca (szkolenie tylko w czerwcu = 6)
 */
export function obliczDniowke(
  iso: string,
  dzien: DzienKierowcy,
  dniMap: Record<string, DzienKierowcy>,
  miesiac: number
): DniowkaInfo {
  // Dzień nie-pracujący (wolne/urlop/L4) → zero dniówki, zero kółek
  if (dzien.dayType && dzien.dayType !== "pracujacy") {
    return { kwotaKolek: 0, szkolenie: 0, dodatekNiedzielny: 0, dniowka: 0 };
  }

  const kolka = parseNum(dzien.kolka);
  const kwotaKolek = kolka * 100;

  // Szkolenie: tylko czerwiec, ręcznie wpisane (0 domyślnie)
  const szkolenie = miesiac === 6 ? parseNum(dzien.szkolenie) : 0;

  // Dodatek niedzielny: +250 zł gdy niedziela kółka ≥ 1 ORAZ poprzednia sobota kółka ≥ 1
  let dodatekNiedzielny = 0;
  if (isNiedziela(iso) && kolka >= 1) {
    const sobIso = poprzedniDzien(iso);
    const sobDzien = dniMap[sobIso];
    if (sobDzien && parseNum(sobDzien.kolka) >= 1) {
      dodatekNiedzielny = 250;
    }
  }

  const dniowka = kwotaKolek + szkolenie + dodatekNiedzielny;
  return { kwotaKolek, szkolenie, dodatekNiedzielny, dniowka };
}

// ─── WYNAGRODZENIE KIEROWCY ───────────────────────────────────────────────────

/**
 * Oblicza pełne wynagrodzenie kierowcy za miesiąc.
 * Premia 200 zł: gdy w miesiącu ≥ 4 przepracowane soboty (kółka > 0).
 */
export function obliczWynagrodzenie(
  miesiac: number,
  dni: Record<string, DzienKierowcy>
): {
  sumaDniowek: number;
  premia: number;
  wynagrodzenie: number;
  liczbaSobot: number;
  dniowki: Record<string, DniowkaInfo>;
} {
  const allDays = getDniMiesiaca(miesiac);
  let sumaDniowek = 0;
  let liczbaSobot = 0;
  const dniowki: Record<string, DniowkaInfo> = {};

  for (const iso of allDays) {
    const dzien = dni[iso] ?? { data: iso, kolka: 0, szkolenie: 0 };
    const info = obliczDniowke(iso, dzien, dni, miesiac);
    dniowki[iso] = info;
    sumaDniowek += info.dniowka;

    const pracujacy = !dzien.dayType || dzien.dayType === "pracujacy";
    if (pracujacy && isSobota(iso) && parseNum(dzien.kolka) > 0) {
      liczbaSobot++;
    }
  }

  const premia = liczbaSobot >= 4 ? 200 : 0;
  const wynagrodzenie = sumaDniowek + premia;

  return { sumaDniowek, premia, wynagrodzenie, liczbaSobot, dniowki };
}

// ─── PRZYCHÓD ─────────────────────────────────────────────────────────────────

/** Suma faktur = przychód miesiąca */
export function obliczPrzychod(faktury: FakturaWeek[]): number {
  return faktury.reduce((sum, f) => sum + parseNum(f.kwota), 0);
}

// ─── KOSZTY ───────────────────────────────────────────────────────────────────

export function obliczKosztPaliwa(tankowanie: DaneMiesiaca["tankowanie"]): number {
  return tankowanie.reduce((sum, t) => sum + parseNum(t.koszt), 0);
}

export function obliczInneKoszty(inne: DaneMiesiaca["inneKoszty"]): number {
  return inne.reduce((sum, t) => sum + parseNum(t.koszt), 0);
}

// ─── OBCIĄŻENIA KIEROWCY ───────────────────────────────────────────────────────

/** Suma obciążeń (potrąceń) kierowcy w miesiącu */
export function sumaObciazen(obciazenia?: DaneMiesiaca["obciazenia"]): number {
  return (obciazenia ?? []).reduce((sum, o) => sum + parseNum(o.kwota), 0);
}

// ─── TYPY DNI ──────────────────────────────────────────────────────────────────

/** Liczniki dni: pracujące (przepracowane, kółka>0), wolne, urlop, chorobowe */
export function liczDniWgTypu(dni: Record<string, DzienKierowcy>): {
  pracujace: number; wolne: number; urlop: number; chorobowe: number;
} {
  let pracujace = 0, wolne = 0, urlop = 0, chorobowe = 0;
  for (const d of Object.values(dni)) {
    const typ = d.dayType ?? "pracujacy";
    if (typ === "wolne") wolne++;
    else if (typ === "urlop") urlop++;
    else if (typ === "chorobowe") chorobowe++;
    else if (parseNum(d.kolka) > 0) pracujace++;
  }
  return { pracujace, wolne, urlop, chorobowe };
}

// ─── WYNIK MIESIĄCA ───────────────────────────────────────────────────────────

export function obliczWynikMiesiaca(
  miesiac: number,
  daneM: DaneMiesiaca
): WynikMiesiaca {
  const przychod = obliczPrzychod(daneM.faktury);
  const { wynagrodzenie, premia, sumaDniowek, liczbaSobot } = obliczWynagrodzenie(
    miesiac,
    daneM.dni
  );
  const paliwo = obliczKosztPaliwa(daneM.tankowanie);
  const inne = obliczInneKoszty(daneM.inneKoszty);
  const leasing = parseNum(daneM.leasing);

  const zysk = przychod - wynagrodzenie - paliwo - inne - leasing;

  return {
    przychod,
    wynagrodzeniePracownika: wynagrodzenie,
    paliwo,
    inne,
    leasing,
    zysk,
    liczbaSobotPrzepracowanych: liczbaSobot,
    premiaUwzglednioneod4Soboty: liczbaSobot >= 4,
    sumaDniowek,
    premia,
  };
}

// ─── DOMYŚLNE DANE ────────────────────────────────────────────────────────────

/** Generuje puste dane miesiąca z etykietami faktur i leasingiem 2300 */
export function domyslneDaneMiesiaca(miesiac: number): DaneMiesiaca {
  const weeks = getWeeksOfMonth(miesiac);
  const faktury: FakturaWeek[] = weeks.map((w, i) => ({
    id: `w${miesiac}-${i}`,
    label: w.label,
    kwota: 0,
  }));

  return {
    faktury,
    dni: {},
    tankowanie: [],
    inneKoszty: [],
    leasing: 2300,
  };
}
