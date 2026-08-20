// Rozliczenie logistyka za miesiąc:
//  • 12% z NETTO zleceń (ręczne wpisy + zlecenia Żeni z faktur, liczone automatycznie),
//  • 5% z „na czysto po PIT i zdrowotnej" danego miesiąca (tylko gdy dodatnie),
//  • 600 zł za auta (3 × 200 zł, na sztywno co miesiąc, z rozpisaniem tablic).

import { WorkspaceData, MiesiącId, LOGISTYK_AUTA, ZlecenieLog } from "./types";
import { podatkiMiesiaca } from "./tax";
import { parseNum } from "./business-logic";

export const LOGISTYK_PROWIZJA_ZLECENIA = 0.12;
export const LOGISTYK_PROWIZJA_ZYSK = 0.05;
export const LOGISTYK_BONUS_ZA_AUTO = 200;
// Tablica auta „Żeni" — jej zlecenia dokleja się automatycznie z faktur.
const AUTO_ZENI = "KK9848Y";

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface LogistykAutoRozliczenie {
  plate: string;
  kierowca: string;
  liczbaZlecen: number;
  zleceniaNetto: number;
  bonus: number; // 200 zł
  automatyczne: boolean; // true dla Żeni (z faktur)
}

export interface RozliczenieLogistyka {
  miesiac: MiesiącId;
  perAuto: LogistykAutoRozliczenie[];
  zleceniaReczne: ZlecenieLog[];
  zleceniaNettoRazem: number;
  prowizja12: number;
  naCzysto: number; // na czysto po PIT i zdrowotnej (podstawa 5%)
  prowizja5: number;
  autaBonus: number; // 600
  razem: number;
}

export function obliczLogistyka(data: WorkspaceData, miesiac: MiesiącId): RozliczenieLogistyka {
  const dane = data.miesiace?.[miesiac];
  const reczne = (dane?.zleceniaLog ?? []).filter((z) => parseNum(z.wartoscNetto) > 0);

  // Zlecenia Żeni z faktur (automatycznie) — suma netto + liczba z importu PDF.
  let zeniNetto = 0;
  let zeniLiczba = 0;
  for (const f of dane?.faktury ?? []) {
    const pi = f.pdfImport;
    if (!pi) continue;
    zeniNetto += parseNum(pi.zleceniaNetto);
    zeniLiczba += parseNum(pi.ileZlecen);
  }
  zeniNetto = r2(zeniNetto);

  const perAuto: LogistykAutoRozliczenie[] = LOGISTYK_AUTA.map((auto) => {
    const zAuta = reczne.filter((z) => z.plate === auto.plate);
    let netto = r2(zAuta.reduce((s, z) => s + parseNum(z.wartoscNetto), 0));
    let liczba = zAuta.length;
    const automatyczne = auto.plate === AUTO_ZENI;
    if (automatyczne) {
      netto = r2(netto + zeniNetto);
      liczba += zeniLiczba;
    }
    return {
      plate: auto.plate,
      kierowca: auto.kierowca,
      liczbaZlecen: liczba,
      zleceniaNetto: netto,
      bonus: LOGISTYK_BONUS_ZA_AUTO,
      automatyczne,
    };
  });

  const zleceniaNettoRazem = r2(perAuto.reduce((s, a) => s + a.zleceniaNetto, 0));
  const prowizja12 = r2(zleceniaNettoRazem * LOGISTYK_PROWIZJA_ZLECENIA);

  const naCzysto = podatkiMiesiaca(data, miesiac).zyskPoPodatkach;
  const prowizja5 = r2(Math.max(0, naCzysto) * LOGISTYK_PROWIZJA_ZYSK);

  const autaBonus = r2(perAuto.reduce((s, a) => s + a.bonus, 0)); // 600

  return {
    miesiac,
    perAuto,
    zleceniaReczne: reczne,
    zleceniaNettoRazem,
    prowizja12,
    naCzysto,
    prowizja5,
    autaBonus,
    razem: r2(prowizja12 + prowizja5 + autaBonus),
  };
}
