// Słownik podatkowy — proste wyjaśnienia trudnych pojęć (Faza 2 uproszczenia UI).
// Silnik liczb się nie zmienia; to tylko warstwa tłumacząca dla użytkownika.

export interface TaxTerm {
  nazwa: string; // prosta nazwa
  opis: string; // ludzkim językiem
  wzor?: string; // wzór
  przyklad?: string; // przykład
}

export type TaxTermId =
  | "vat_nalezny"
  | "vat_naliczony"
  | "vat_do_zaplaty"
  | "nadwyzka_vat"
  | "koszty_pit"
  | "dochod_pit"
  | "koszty_ponad_przychod"
  | "wynik_ytd"
  | "pit_ytd"
  | "pit_miesiac"
  | "zdrowotna"
  | "lacznie"
  | "wynik_po_podatkach"
  | "wynik_na_czysto";

export const TAX_GLOSSARY: Record<TaxTermId, TaxTerm> = {
  vat_nalezny: {
    nazwa: "VAT należny",
    opis: "VAT, który doliczyłeś klientowi na fakturach sprzedażowych.",
    wzor: "suma VAT z faktur sprzedaży",
    przyklad: "Faktura 10 000 zł netto + 23% → VAT należny 2 300 zł.",
  },
  vat_naliczony: {
    nazwa: "VAT naliczony",
    opis: "VAT z faktur kosztowych, który możesz odliczyć.",
    wzor: "suma VAT do odliczenia z kosztów",
    przyklad: "Koszty 6 000 zł netto + 23% → VAT naliczony 1 380 zł.",
  },
  vat_do_zaplaty: {
    nazwa: "VAT do zapłaty",
    opis: "VAT ze sprzedaży pomniejszony o VAT z kosztów (i nadwyżkę z poprzednich miesięcy). Nigdy ujemny.",
    wzor: "max(0, VAT należny − VAT naliczony)",
    przyklad: "Należny 2 300 − naliczony 1 380 = 920 zł do zapłaty.",
  },
  nadwyzka_vat: {
    nazwa: "Nadwyżka VAT",
    opis: "VAT z kosztów, którego nie wykorzystałeś w tym miesiącu. Może pomniejszyć VAT w kolejnym okresie. To NIE jest gotówka na koncie.",
    wzor: "max(0, VAT naliczony − VAT należny)",
    przyklad: "Naliczony 300 − należny 100 = 200 zł nadwyżki na kolejny miesiąc.",
  },
  koszty_pit: {
    nazwa: "Koszty uznane do PIT",
    opis: "Wydatki, które zgodnie z ustawieniami zmniejszają dochód do opodatkowania (netto z faktur + oficjalne wynagrodzenie).",
    wzor: "netto kosztów + nieodliczony VAT + oficjalne wynagrodzenie",
    przyklad: "Paliwo 926,49 + inne 159,25 + leasing 2195,12 + pensja 1255 = 4535,86 zł.",
  },
  dochod_pit: {
    nazwa: "Dochód do PIT",
    opis: "Przychód netto minus koszty uznane do PIT. Od tego liczy się podatek dochodowy.",
    wzor: "przychód netto − koszty uznane do PIT",
    przyklad: "10 000 − 6 000 = 4 000 zł dochodu.",
  },
  koszty_ponad_przychod: {
    nazwa: "Koszty przewyższające przychód",
    opis: "W tym miesiącu koszty podatkowe były większe od przychodu. To NIE jest dodatkowa kwota do zapłaty — po prostu PIT za ten miesiąc wynosi 0 zł.",
    wzor: "koszty uznane do PIT − przychód netto",
    przyklad: "Przychód 0, koszty 4535,86 → koszty przewyższają o 4535,86 zł, PIT = 0.",
  },
  wynik_ytd: {
    nazwa: "Łączny wynik podatkowy od początku roku",
    opis: "Suma dochodów i strat od początku roku (albo od wartości startowej z ustawień). Dodatni = był dochód, ujemny = przewaga kosztów.",
    wzor: "suma miesięcznych (przychód − koszty)",
    przyklad: "Cze −4 000, Lip +6 000 → łącznie +2 000 zł.",
  },
  pit_ytd: {
    nazwa: "PIT wyliczony od początku roku",
    opis: "Podatek dochodowy policzony narastająco od łącznego wyniku. Od tego odejmujemy PIT już naliczony za wcześniejsze miesiące.",
    wzor: "skala: do 30 000 zł = 0; potem 12% − 3 600; powyżej 120 000 zł = 32%",
    przyklad: "Wynik roczny 50 000 → PIT 50 000 × 12% − 3 600 = 2 400 zł.",
  },
  pit_miesiac: {
    nazwa: "PIT do zapłaty za ten miesiąc",
    opis: "Różnica między PIT-em wyliczonym narastająco teraz a PIT-em naliczonym za wcześniejsze miesiące.",
    wzor: "max(0, PIT narastająco teraz − PIT za poprzednie miesiące)",
    przyklad: "Narastająco 2 400, wcześniej 2 050 → 350 zł za ten miesiąc.",
  },
  zdrowotna: {
    nazwa: "Składka zdrowotna właściciela",
    opis: "Składka zdrowotna właściciela firmy: 9% podstawy (skala), nie mniej niż minimum ustawione w aplikacji. Nie jest to składka zdrowotna pracownika.",
    wzor: "max(9% × dochód, minimum)",
    przyklad: "Dochód niski/ujemny → minimum 432,54 zł.",
  },
  lacznie: {
    nazwa: "Łącznie powinno wyjść",
    opis: "Suma VAT do zapłaty, podatku dochodowego firmy, składki zdrowotnej właściciela oraz trzech zobowiązań za pracownika. To kwota obciążeń do zapłaty, a nie kwota, która zostaje firmie.",
    wzor: "VAT + podatek firmy + zdrowotna właściciela + podatek pracownika + zdrowotna pracownika + pozostały ZUS pracownika",
    przyklad: "Obciążenia pracownika: 107 + 120,30 + 165 = 392,30 zł. Ta suma jest doliczana do pozostałych zobowiązań miesiąca.",
  },
  wynik_po_podatkach: {
    nazwa: "Po podatku dochodowym i zdrowotnej — przed VAT",
    opis: "Wynik operacyjny pomniejszony o podatek dochodowy i składkę zdrowotną. To jeszcze nie jest końcowa kwota na czysto, jeżeli pozostaje VAT do zapłaty.",
    wzor: "zysk operacyjny − podatek dochodowy − zdrowotna",
    przyklad: "Zysk 1 680,85 − podatek dochodowy 0 − zdrowotna 432,54 = 1 248,31 zł przed zapłatą VAT.",
  },
  wynik_na_czysto: {
    nazwa: "Na czysto po wszystkich podatkach",
    opis: "Końcowa gotówka, która zostaje po odjęciu podatku dochodowego, składki zdrowotnej oraz VAT do zapłaty. To jest właściwy wynik na czysto.",
    wzor: "zysk operacyjny − podatek dochodowy − zdrowotna − VAT do zapłaty",
    przyklad: "1 680,85 − 0 − 432,54 − 847,23 = 401,08 zł na czysto.",
  },
};
