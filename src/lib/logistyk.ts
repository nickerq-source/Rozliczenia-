// Rozliczenie logistyka za miesiąc:
//  • 12% z NETTO zleceń (ręczne wpisy + zlecenia Żeni z faktur, liczone automatycznie),
//  • 5% z końcowej gotówki po wszystkich kosztach i podatkach, po odjęciu
//    zleceń Żeni objętych już prowizją 12% (tylko gdy podstawa jest dodatnia),
//  • 600 zł za auta (3 × 200 zł, na sztywno co miesiąc, z rozpisaniem tablic).

import { WorkspaceData, MiesiącId, LOGISTYK_AUTA, ZlecenieLog } from "./types";
import { podatkiMiesiaca } from "./tax";
import { parseNum } from "./business-logic";
import { calculateLogisticsProfitShare } from "./logistyk-calculation";

// Logistyk rozliczany dopiero od sierpnia 2026 (wcześniej go nie było).
export const LOGISTYK_START_MONTH = 8;
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
  prowizja12: number; // 12% z netto tego auta
  bonus: number; // 200 zł
  prowizja5: number; // 5% z na-czysto — tylko auto kierowcy (Żenia), 0 dla adminów
  lacznie: number; // łącznie za to auto
  automatyczne: boolean; // true dla Żeni (z faktur) = kierowca
}

export interface RozliczenieLogistyka {
  miesiac: MiesiącId;
  perAuto: LogistykAutoRozliczenie[];
  zleceniaReczne: ZlecenieLog[];
  zleceniaNettoRazem: number;
  zleceniaZeniNetto: number;
  prowizja12: number;
  naCzysto: number; // końcowa gotówka po wszystkich kosztach i podatkach
  podstawa5: number; // na czysto MINUS netto zleceń Żeni objętych już prowizją 12%
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

  const zleceniaNettoRazem = r2(reczne.reduce((s, z) => s + parseNum(z.wartoscNetto), 0) + zeniNetto);

  // Kwota „na czysto" musi odpowiadać końcowemu wynikowi widocznemu w panelu,
  // czyli uwzględniać również VAT. Odejmujemy tylko zlecenia Żeni, bo to one są
  // częścią faktur budujących ten wynik i jednocześnie dostały już prowizję 12%.
  const naCzysto = podatkiMiesiaca(data, miesiac).cashflowPoPodatkach;
  const { base: podstawa5, commission: prowizja5 } = calculateLogisticsProfitShare(
    naCzysto,
    zeniNetto,
    LOGISTYK_PROWIZJA_ZYSK
  );

  const perAuto: LogistykAutoRozliczenie[] = LOGISTYK_AUTA.map((auto) => {
    const zAuta = reczne.filter((z) => z.plate === auto.plate);
    let netto = r2(zAuta.reduce((s, z) => s + parseNum(z.wartoscNetto), 0));
    let liczba = zAuta.length;
    const automatyczne = auto.plate === AUTO_ZENI;
    if (automatyczne) {
      netto = r2(netto + zeniNetto);
      liczba += zeniLiczba;
    }
    const prowizja12Auto = r2(netto * LOGISTYK_PROWIZJA_ZLECENIA);
    const prowizja5Auto = automatyczne ? prowizja5 : 0;
    return {
      plate: auto.plate,
      kierowca: auto.kierowca,
      liczbaZlecen: liczba,
      zleceniaNetto: netto,
      prowizja12: prowizja12Auto,
      bonus: LOGISTYK_BONUS_ZA_AUTO,
      prowizja5: prowizja5Auto,
      lacznie: r2(prowizja12Auto + LOGISTYK_BONUS_ZA_AUTO + prowizja5Auto),
      automatyczne,
    };
  });

  const prowizja12 = r2(zleceniaNettoRazem * LOGISTYK_PROWIZJA_ZLECENIA);
  const autaBonus = r2(perAuto.reduce((s, a) => s + a.bonus, 0)); // 600

  return {
    miesiac,
    perAuto,
    zleceniaReczne: reczne,
    zleceniaNettoRazem,
    zleceniaZeniNetto: zeniNetto,
    prowizja12,
    naCzysto,
    podstawa5,
    prowizja5,
    autaBonus,
    razem: r2(prowizja12 + prowizja5 + autaBonus),
  };
}
