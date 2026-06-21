// Logika biznesowa: obliczenia wynagrodzeń, dochodów i zysków

import {
  DaneMiesiaca,
  DzienKierowcy,
  DniowkaInfo,
  WynikMiesiaca,
  FakturaWeek,
  UstawieniaPodatkowe,
  WpisInnegoKosztu,
  WpisTankowania,
} from "./types";
import {
  getDniMiesiaca,
  getDayOfWeek,
  isNiedziela,
  isSobota,
  poprzedniDzien,
  getWeeksOfMonth,
} from "./dates";
import { czyWolny, maKolka, maZlecenia } from "./day-type";

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

/** Stawka za dzień urlopu (płatny, nie przerywa ciągłości). */
export const STAWKA_URLOPU = 250;

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
  // Urlop = dzień płatny 250 zł (nie przerywa ciągłości pracy)
  if (dzien.dayType === "urlop") {
    return { kwotaKolek: 0, kwotaZlecen: 0, szkolenie: 0, dodatekNiedzielny: 0, urlop: STAWKA_URLOPU, dniowka: STAWKA_URLOPU };
  }

  // Wolne bezpłatne / L4 → zero dniówki
  if (czyWolny(dzien.dayType)) {
    return { kwotaKolek: 0, kwotaZlecen: 0, szkolenie: 0, dodatekNiedzielny: 0, urlop: 0, dniowka: 0 };
  }

  // Kółka (trasy) tylko dla P / P+Z
  const kolka = maKolka(dzien.dayType) ? parseNum(dzien.kolka) : 0;
  const kwotaKolek = kolka * 100;

  // Zlecenia (liczba × stawka 50/100/własna) tylko dla P+Z / Z
  const liczbaZlecen = maZlecenia(dzien.dayType) ? parseNum(dzien.zlecenia) : 0;
  const stawkaZlecenia = parseNum(dzien.stawkaZlecenia) || 100;
  const kwotaZlecen = liczbaZlecen * stawkaZlecenia;

  // Szkolenie: tylko czerwiec, dni z trasami, ręcznie wpisane (0 domyślnie)
  const szkolenie = miesiac === 6 && maKolka(dzien.dayType) ? parseNum(dzien.szkolenie) : 0;

  // Dodatek niedzielny: +250 zł gdy niedziela kółka ≥ 1 ORAZ poprzednia sobota kółka ≥ 1.
  // Od lipca blokuje go 2+ dni wolnego bezpłatnego Pon–Pt w miesiącu.
  let dodatekNiedzielny = 0;
  if (!czyDodatkiZablokowaneOdLipca(miesiac, dniMap) && isNiedziela(iso) && kolka >= 1) {
    const sobIso = poprzedniDzien(iso);
    const sobDzien = dniMap[sobIso];
    if (sobDzien && maKolka(sobDzien.dayType) && parseNum(sobDzien.kolka) >= 1) {
      dodatekNiedzielny = 250;
    }
  }

  const dniowka = kwotaKolek + kwotaZlecen + szkolenie + dodatekNiedzielny;
  return { kwotaKolek, kwotaZlecen, szkolenie, dodatekNiedzielny, urlop: 0, dniowka };
}

// ─── WYNAGRODZENIE KIEROWCY ───────────────────────────────────────────────────

/**
 * Oblicza pełne wynagrodzenie kierowcy za miesiąc.
 * Premia 200 zł: gdy w miesiącu ≥ 4 przepracowane soboty (kółka > 0).
 * Od lipca 2026 premię i dodatki niedzielne blokują 2+ dni wolnego
 * bezpłatnego od poniedziałku do piątku. Urlop i L4 nie przerywają ciągłości.
 */
export function obliczWynagrodzenie(
  miesiac: number,
  dni: Record<string, DzienKierowcy>
): {
  sumaDniowek: number;
  premia: number;
  wynagrodzenie: number;
  liczbaSobot: number;
  wolneBezplatneRobocze: number;
  dodatkiZablokowaneOdLipca: boolean;
  dniowki: Record<string, DniowkaInfo>;
} {
  const allDays = getDniMiesiaca(miesiac);
  const wolneBezplatneRobocze = liczWolneBezplatneRobocze(miesiac, dni);
  const dodatkiZablokowaneOdLipca = czyDodatkiZablokowaneOdLipca(miesiac, dni);
  let sumaDniowek = 0;
  let liczbaSobot = 0;
  const dniowki: Record<string, DniowkaInfo> = {};

  for (const iso of allDays) {
    const dzien = dni[iso] ?? { data: iso, kolka: 0, szkolenie: 0 };
    const info = obliczDniowke(iso, dzien, dni, miesiac);
    dniowki[iso] = info;
    sumaDniowek += info.dniowka;

    // Premia sobotnia liczy się od przepracowanych tras (kółek) w sobotę
    if (maKolka(dzien.dayType) && isSobota(iso) && parseNum(dzien.kolka) > 0) {
      liczbaSobot++;
    }
  }

  const premia = liczbaSobot >= 4 && !dodatkiZablokowaneOdLipca ? 200 : 0;
  const wynagrodzenie = sumaDniowek + premia;

  return {
    sumaDniowek,
    premia,
    wynagrodzenie,
    liczbaSobot,
    wolneBezplatneRobocze,
    dodatkiZablokowaneOdLipca,
    dniowki,
  };
}

/** Liczy dni wolne bezpłatne od poniedziałku do piątku. Soboty nie wchodzą do limitu. */
export function liczWolneBezplatneRobocze(
  miesiac: number,
  dni: Record<string, DzienKierowcy>
): number {
  return getDniMiesiaca(miesiac).filter((iso) => {
    const dow = getDayOfWeek(iso);
    return dow >= 1 && dow <= 5 && dni[iso]?.dayType === "wolne";
  }).length;
}

/** Od lipca: 2+ dni wolnego bezpłatnego Pon–Pt blokują premię 200 i niedzielne +250. */
export function czyDodatkiZablokowaneOdLipca(
  miesiac: number,
  dni: Record<string, DzienKierowcy>
): boolean {
  return miesiac >= 7 && liczWolneBezplatneRobocze(miesiac, dni) >= 2;
}

// ─── PRZYCHÓD ─────────────────────────────────────────────────────────────────

/** Suma faktur = przychód miesiąca */
export function obliczPrzychod(faktury: FakturaWeek[]): number {
  return faktury.reduce((sum, f) => sum + parseNum(f.kwota), 0);
}

// ─── KOSZTY ───────────────────────────────────────────────────────────────────

export function obliczKosztPaliwa(tankowanie: DaneMiesiaca["tankowanie"]): number {
  return tankowanie.reduce((sum, t) => sum + (czyTankowanieWliczane(t) ? parseNum(t.koszt) : 0), 0);
}

export function czyTankowanieWliczane(tankowanie: Pick<WpisTankowania, "status" | "includeInReports">): boolean {
  return (tankowanie.status ?? "approved") === "approved" && (tankowanie.includeInReports ?? true);
}

export function czyKosztLeasingu(koszt: Pick<WpisInnegoKosztu, "kategoria">): boolean {
  return koszt.kategoria === "leasing";
}

export function obliczInneKoszty(inne: DaneMiesiaca["inneKoszty"]): number {
  return inne.reduce((sum, t) => sum + (czyKosztLeasingu(t) ? 0 : parseNum(t.koszt)), 0);
}

export function obliczKosztLeasingu(daneM: Pick<DaneMiesiaca, "inneKoszty" | "leasing">): number {
  const wpisyLeasingu = (daneM.inneKoszty ?? []).filter(czyKosztLeasingu);
  if (wpisyLeasingu.length === 0) return parseNum(daneM.leasing);
  return wpisyLeasingu.reduce((sum, t) => sum + parseNum(t.koszt), 0);
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
    // Pracujące = przepracowane trasy lub zlecenia
    else if (parseNum(d.kolka) > 0 || (maZlecenia(typ) && parseNum(d.zlecenia) > 0)) pracujace++;
  }
  return { pracujace, wolne, urlop, chorobowe };
}

// ─── WYNIK MIESIĄCA ───────────────────────────────────────────────────────────

export function obliczWynikMiesiaca(
  miesiac: number,
  daneM: DaneMiesiaca,
  ustawienia?: UstawieniaPodatkowe
): WynikMiesiaca {
  const przychod = obliczPrzychod(daneM.faktury);
  const {
    wynagrodzenie,
    premia,
    sumaDniowek,
    liczbaSobot,
    wolneBezplatneRobocze,
    dodatkiZablokowaneOdLipca,
  } = obliczWynagrodzenie(
    miesiac,
    daneM.dni
  );
  const paliwo = obliczKosztPaliwa(daneM.tankowanie);
  const inne = obliczInneKoszty(daneM.inneKoszty);
  const leasing = obliczKosztLeasingu(daneM);

  // ZUS pracodawcy — realny koszt na wierzchu pensji (gdy włączone oficjalne
  // wynagrodzenie i kierowca w tym miesiącu pracował).
  const zusPracodawcy =
    ustawienia?.pracownikOficjalnyEnabled && wynagrodzenie > 0
      ? parseNum(ustawienia.pracownikZusPracodawcyMies)
      : 0;

  const zysk = przychod - wynagrodzenie - zusPracodawcy - paliwo - inne - leasing;

  return {
    przychod,
    wynagrodzeniePracownika: wynagrodzenie,
    zusPracodawcy,
    paliwo,
    inne,
    leasing,
    zysk,
    liczbaSobotPrzepracowanych: liczbaSobot,
    premiaUwzglednioneod4Soboty: liczbaSobot >= 4 && !dodatkiZablokowaneOdLipca,
    wolneBezplatneRobocze,
    dodatkiZablokowaneOdLipca,
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
