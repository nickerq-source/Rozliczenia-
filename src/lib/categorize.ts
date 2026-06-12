// Lokalne reguły kategoryzacji kosztów (keyword, case-insensitive).
// Kolejność sekcji = priorytet dopasowania (pierwsza wygrana reguła).
// Brak dopasowania → null (wtedy AI fallback przez /api/categorize-cost).

import { KategoriaKosztu } from "./types";

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
