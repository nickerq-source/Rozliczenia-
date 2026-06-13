// Lokalne reguły kategoryzacji kosztów (keyword, case-insensitive).
// Kolejność sekcji = priorytet dopasowania (pierwsza wygrana reguła).
// Brak dopasowania → null (wtedy AI fallback przez /api/categorize-cost).

import { KategoriaKosztu, VatRate } from "./types";

// Specyficzne frazy przed ogólnymi: "płyn hamulcowy" (czesci) musi wygrać,
// zanim ogólniejsze słowa trafią w inną kategorię.
const REGULY: { kategoria: KategoriaKosztu; slowa: string[] }[] = [
  {
    kategoria: "paliwo_adblue",
    slowa: ["adblue", "paliwo", "diesel", "benzyna", "orlen", "shell", "circle k", "moya"],
  },
  {
    kategoria: "czesci",
    slowa: [
      "filtr", "olej", "żarówka", "zarowka", "resor", "śruba", "sruba", "guma",
      "klocki", "tarcze", "wycieraczki", "akumulator", "pasek",
      "płyn chłodniczy", "plyn chlodniczy", "płyn hamulcowy", "plyn hamulcowy",
      "bezpiecznik", "opona", "felga", "zawór", "zawor", "uszczelka",
    ],
  },
  {
    kategoria: "serwis",
    slowa: [
      "mechanik", "naprawa", "wymiana", "robocizna", "warsztat", "diagnostyka",
      "geometria", "wulkanizacja", "przegląd serwisowy", "przeglad serwisowy",
    ],
  },
  { kategoria: "parking", slowa: ["parking", "postój", "postoj"] },
  { kategoria: "myjnia", slowa: ["myjnia", "mycie", "pranie tapicerki"] },
  {
    kategoria: "ksiegowosc",
    slowa: ["księgowa", "ksiegowa", "księgowość", "ksiegowosc", "biuro rachunkowe", "rachunkowe"],
  },
  { kategoria: "ubezpieczenie", slowa: ["ubezpieczenie", "polisa", "nnw"] },
  {
    kategoria: "telefon_aplikacje",
    slowa: [
      "telefon", "abonament", "aplikacja", "subskrypcja", "google", "apple",
      "microsoft", "app store", "play store",
    ],
  },
  {
    kategoria: "internet",
    slowa: [
      "internet", "światłowód", "swiatlowod", "router", "karta sim", "lte", "5g",
      "t-mobile", "orange", "netia", "upc", "vectra",
    ],
  },
  {
    kategoria: "wyposazenie",
    slowa: [
      "kask", "rękawice", "rekawice", "kamizelka", "buty", "odzież", "odziez",
      "narzędzia", "narzedzia", "jumpstarter", "ładowarka", "ladowarka", "kabel",
      "dywaniki", "sanepid", "apteczka", "gaśnica", "gasnica", "pasy transportowe",
      "mata", "skrzynka",
    ],
  },
  {
    kategoria: "art_spozywcze",
    slowa: [
      "art. spożywcze", "artykuły spożywcze", "artykuly spozywcze", "spożywcze",
      "spozywcze", "jedzenie", "woda", "kawa", "herbata", "napoje", "cukier",
      "mleko", "pieczywo", "bułki", "bulki", "kanapki", "catering", "prowiant",
    ],
  },
  {
    kategoria: "oplaty",
    slowa: [
      "opłata", "oplata", "urząd", "urzad", "skarbówka", "skarbowka", "podatek",
      "przegląd", "przeglad", "badanie techniczne", "viatoll", "e-toll", "etoll",
      "autostrada", "bramka",
    ],
  },
];

// Słowa-skróty wymagające dopasowania całych wyrazów (uniknięcie np. "ona" w "opona",
// "bp" w "bpx" itd.); dopasowanie po granicach słów.
const REGULY_CALE_SLOWA: { kategoria: KategoriaKosztu; slowa: string[] }[] = [
  { kategoria: "paliwo_adblue", slowa: ["on", "bp"] },
  { kategoria: "ubezpieczenie", slowa: ["oc", "ac"] },
  { kategoria: "internet", slowa: ["sim", "play", "plus"] },
];

/**
 * Kategoryzuje koszt po nazwie (case-insensitive).
 * Zwraca kategorię z reguł lub null (→ AI fallback / 'inne').
 */
export function kategoryzujLokalnie(nazwa: string): KategoriaKosztu | null {
  const n = (nazwa ?? "").toLowerCase().trim();
  if (!n) return null;

  for (const r of REGULY) {
    if (r.slowa.some((s) => n.includes(s))) return r.kategoria;
  }
  for (const r of REGULY_CALE_SLOWA) {
    for (const s of r.slowa) {
      // Granice słów: unikamy trafień "on" wewnątrz "opona" itp.
      const re = new RegExp(`(^|[^a-ząćęłńóśźż0-9])${s}($|[^a-ząćęłńóśźż0-9])`, "i");
      if (re.test(n)) return r.kategoria;
    }
  }
  return null;
}

export interface LokalnyVat {
  vatRate: VatRate;
  vatDeductible: boolean;
  vatDeductionPercent: number;
}

const VAT_RULES: { vatRate: VatRate; slowa: string[]; vatDeductible?: boolean }[] = [
  {
    vatRate: "0.05",
    slowa: [
      "chleb", "pieczywo", "bułka", "bulka", "bułki", "bulki", "mleko",
      "nabiał", "nabial", "jogurt", "ser", "masło", "maslo", "mięso",
      "mieso", "wędlina", "wedlina", "owoce", "warzywa", "woda", "sok",
      "soki", "książka", "ksiazka", "ebook", "e-book",
    ],
  },
  {
    vatRate: "0.08",
    slowa: [
      "catering", "gastronomia", "bar", "restauracja", "obiad", "danie gotowe",
      "kanapka", "kanapki", "nocleg", "hotel", "pensjonat",
    ],
  },
  {
    vatRate: "zw",
    vatDeductible: false,
    slowa: ["ubezpieczenie", "polisa", "oc", "ac", "nnw"],
  },
  {
    vatRate: "np",
    vatDeductible: false,
    slowa: [
      "urząd", "urzad", "skarbówka", "skarbowka", "podatek", "viatoll",
      "e-toll", "etoll", "opłata drogowa", "oplata drogowa", "opłata urzędowa",
      "oplata urzedowa",
    ],
  },
];

/**
 * Awaryjny dobór VAT po nazwie produktu/usługi. AI jest dokładniejsze, ale ta
 * funkcja pilnuje oczywistych stawek, gdy API nie odpowie albo nie ma klucza.
 */
export function dobierzVatLokalnie(nazwa: string, kategoria?: KategoriaKosztu | null): LokalnyVat {
  const n = (nazwa ?? "").toLowerCase().trim();

  for (const r of VAT_RULES) {
    if (r.slowa.some((s) => n.includes(s))) {
      const odliczany = r.vatDeductible ?? true;
      return {
        vatRate: r.vatRate,
        vatDeductible: odliczany,
        vatDeductionPercent: odliczany ? 100 : 0,
      };
    }
  }

  if (kategoria === "ubezpieczenie") {
    return { vatRate: "zw", vatDeductible: false, vatDeductionPercent: 0 };
  }
  if (kategoria === "oplaty") {
    return { vatRate: "np", vatDeductible: false, vatDeductionPercent: 0 };
  }
  if (kategoria === "art_spozywcze") {
    return { vatRate: "0.05", vatDeductible: true, vatDeductionPercent: 100 };
  }

  return { vatRate: "0.23", vatDeductible: true, vatDeductionPercent: 100 };
}
