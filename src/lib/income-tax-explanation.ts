export type PowodPodatkuMiesiaca =
  | "do_zaplaty"
  | "strata"
  | "kwota_wolna"
  | "wczesniejsze_zaliczki"
  | "brak_dochodu";

export interface DanePodatkuDoWyjasnienia {
  dochod: number;
  dochodYtdPrzed: number;
  dochodYtd: number;
  pitYtd: number;
  pitZaplaconyPrzed: number;
  pitMiesiac: number;
}

export interface UstawieniaPodatkuDoWyjasnienia {
  taxForm: "skala" | "liniowy";
  taxFreeAmount: number;
}

export interface WyjasnieniePodatkuMiesiaca {
  powod: PowodPodatkuMiesiaca;
  strataPrzedMiesiacem: number;
  dochodMiesiaca: number;
  strataMiesiaca: number;
  wykorzystanaStrata: number;
  pozostalaStrata: number;
  dochodNarastajaco: number;
  kwotaWolna: number;
  pozostalaKwotaWolna: number;
  podatekNarastajaco: number;
  zaliczkiPoprzednie: number;
  podatekMiesiaca: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function dodatnia(value: number): number {
  return round2(Math.max(0, value));
}

/**
 * Wyjaśnia wynik miesięcznej zaliczki bez ponownego liczenia podatku.
 * Korzysta z wartości wyliczonych przez tax.ts i rozdziela stratę,
 * kwotę wolną oraz wcześniej naliczone zaliczki.
 */
export function wyjasnijPodatekMiesiaca(
  dane: DanePodatkuDoWyjasnienia,
  ustawienia: UstawieniaPodatkuDoWyjasnienia
): WyjasnieniePodatkuMiesiaca {
  const strataPrzedMiesiacem = dodatnia(-dane.dochodYtdPrzed);
  const dochodMiesiaca = dodatnia(dane.dochod);
  const strataMiesiaca = dodatnia(-dane.dochod);
  const wykorzystanaStrata = round2(Math.min(strataPrzedMiesiacem, dochodMiesiaca));
  const pozostalaStrata = dodatnia(-dane.dochodYtd);
  const dochodNarastajaco = dodatnia(dane.dochodYtd);
  const kwotaWolna = ustawienia.taxForm === "skala"
    ? dodatnia(ustawienia.taxFreeAmount)
    : 0;
  const pozostalaKwotaWolna = ustawienia.taxForm === "skala"
    ? dodatnia(kwotaWolna - dochodNarastajaco)
    : 0;
  const podatekNarastajaco = dodatnia(dane.pitYtd);
  const zaliczkiPoprzednie = dodatnia(dane.pitZaplaconyPrzed);
  const podatekMiesiaca = dodatnia(dane.pitMiesiac);

  let powod: PowodPodatkuMiesiaca = "brak_dochodu";
  if (podatekMiesiaca > 0) {
    powod = "do_zaplaty";
  } else if (
    pozostalaStrata > 0
    || (dochodNarastajaco === 0 && (strataPrzedMiesiacem > 0 || strataMiesiaca > 0))
  ) {
    powod = "strata";
  } else if (ustawienia.taxForm === "skala" && dochodNarastajaco <= kwotaWolna) {
    powod = "kwota_wolna";
  } else if (podatekNarastajaco <= zaliczkiPoprzednie) {
    powod = "wczesniejsze_zaliczki";
  }

  return {
    powod,
    strataPrzedMiesiacem,
    dochodMiesiaca,
    strataMiesiaca,
    wykorzystanaStrata,
    pozostalaStrata,
    dochodNarastajaco,
    kwotaWolna,
    pozostalaKwotaWolna,
    podatekNarastajaco,
    zaliczkiPoprzednie,
    podatekMiesiaca,
  };
}
