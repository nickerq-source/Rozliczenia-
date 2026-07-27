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
    wzor: "max(0, VAT należny − VAT naliczony − nadwyżka z poprzednich miesięcy)",
    przyklad: "Należny 2 300 − naliczony 1 380 − wcześniejsza nadwyżka 200 = 720 zł do zapłaty.",
  },
  nadwyzka_vat: {
    nazwa: "Nadwyżka VAT",
    opis: "VAT z kosztów, którego nie wykorzystałeś w tym miesiącu. Może pomniejszyć VAT w kolejnym okresie. To NIE jest gotówka na koncie.",
    wzor: "max(0, VAT naliczony + wcześniejsza nadwyżka − VAT należny)",
    przyklad: "Naliczony 300 + wcześniejsza nadwyżka 100 − należny 150 = 250 zł na kolejny miesiąc.",
  },
  koszty_pit: {
    nazwa: "Koszty uznane do podatku dochodowego",
    opis: "Suma kosztów pracownika bez VAT oraz podatkowej części zakupów. Zakupy trafiają tu jako netto i ewentualny nieodliczony VAT, zgodnie z dokumentami i ustawieniami.",
    wzor: "koszty pracownika + netto zakupów + nieodliczony VAT",
    przyklad: "Koszty pracownika 1 500 zł + podatkowa część zakupów 3 000 zł = 4 500 zł kosztów uznanych do podatku dochodowego.",
  },
  dochod_pit: {
    nazwa: "Dochód podatkowy",
    opis: "Przychód netto minus koszty uznane do podatku dochodowego. Od tego liczy się podatek dochodowy.",
    wzor: "przychód netto − koszty uznane do podatku dochodowego",
    przyklad: "10 000 − 6 000 = 4 000 zł dochodu.",
  },
  koszty_ponad_przychod: {
    nazwa: "Koszty przewyższające przychód",
    opis: "W tym miesiącu koszty podatkowe były większe od przychodu. To NIE jest dodatkowa kwota do zapłaty — podatek dochodowy za ten miesiąc wynosi 0 zł.",
    wzor: "koszty uznane do podatku dochodowego − przychód netto",
    przyklad: "Przychód 0, koszty 4535,86 → strata 4535,86 zł, podatek dochodowy = 0.",
  },
  wynik_ytd: {
    nazwa: "Łączny wynik podatkowy od czerwca",
    opis: "Suma dochodów i strat z miesięcy dostępnych w aplikacji, czyli od czerwca. Wartość ujemna oznacza pozostałą stratę podatkową do rozliczenia. Nie jest to nadpłata ani gotówka do zwrotu.",
    wzor: "suma miesięcznych (przychód − koszty)",
    przyklad: "Cze −4 000, Lip +6 000 → łącznie +2 000 zł.",
  },
  pit_ytd: {
    nazwa: "Podatek dochodowy wyliczony od czerwca",
    opis: "Podatek dochodowy policzony narastająco od łącznego wyniku w okresie obsługiwanym przez aplikację. Od tego odejmujemy podatek dochodowy już naliczony za wcześniejsze miesiące tego okresu.",
    wzor: "PapiTrans jako część firmy: 12% do 120 000 zł, potem 32% od nadwyżki; bez ponownej kwoty wolnej",
    przyklad: "Wynik modułu 50 000 zł → 50 000 × 12% = 6 000 zł podatku narastająco.",
  },
  pit_miesiac: {
    nazwa: "Podatek dochodowy do zapłaty za ten miesiąc",
    opis: "Różnica między podatkiem dochodowym wyliczonym narastająco teraz a podatkiem naliczonym za wcześniejsze miesiące. Kwota 0 zł może wynikać z nierozliczonej straty albo wcześniejszych zaliczek. Kwota wolna działa tylko w trybie samodzielnego rozliczenia.",
    wzor: "max(0, podatek narastająco teraz − podatek za poprzednie miesiące)",
    przyklad: "Narastająco 2 400, wcześniej 2 050 → 350 zł za ten miesiąc.",
  },
  zdrowotna: {
    nazwa: "Składka zdrowotna właściciela",
    opis: "Na skali jest liczona jako 9% podstawy, nie mniej niż ustawione minimum. Nie odejmuje się jej przed obliczeniem podatku dochodowego. Nie jest to składka zdrowotna pracownika.",
    wzor: "max(9% × dochód, minimum)",
    przyklad: "Dochód niski/ujemny → minimum 432,54 zł.",
  },
  lacznie: {
    nazwa: "Podatki i składki razem",
    opis: "Suma VAT do zapłaty, podatku dochodowego firmy, składki zdrowotnej właściciela oraz trzech zobowiązań za pracownika. To kwota obciążeń do zapłaty, a nie kwota, która zostaje firmie.",
    wzor: "VAT + podatek firmy + zdrowotna właściciela + podatek pracownika + zdrowotna pracownika + pozostały ZUS pracownika",
    przyklad: "Obciążenia pracownika: 107 + 120,30 + 165 = 392,30 zł. Ta suma jest doliczana do pozostałych zobowiązań miesiąca.",
  },
  wynik_po_podatkach: {
    nazwa: "Po podatku dochodowym i zdrowotnej — przed VAT",
    opis: "Wynik gotówkowy przed podatkami pomniejszony o podatek dochodowy i składkę zdrowotną. To jeszcze nie jest końcowa kwota, jeżeli pozostaje VAT do zapłaty.",
    wzor: "wynik gotówkowy przed podatkami − podatek dochodowy − zdrowotna",
    przyklad: "Wynik 1 680,85 − podatek dochodowy 0 − zdrowotna 432,54 = 1 248,31 zł przed zapłatą VAT.",
  },
  wynik_na_czysto: {
    nazwa: "Realnie zostaje po wszystkich kosztach i podatkach",
    opis: "Końcowa gotówka po odjęciu całej wypłaty kierowcy, paliwa, innych kosztów, leasingu oraz wszystkich podatków i składek. Każda pozycja jest odejmowana tylko raz.",
    wzor: "przychód brutto − wypłata kierowcy − paliwo − inne koszty − leasing − podatki i składki razem",
    przyklad: "Przychód brutto minus wszystkie koszty operacyjne, podatki i składki = realna gotówka, która zostaje.",
  },
};
