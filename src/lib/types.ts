// Typy danych dla aplikacji rozliczeń floty dostawczej

export type MiesiącId = 6 | 7 | 8 | 9 | 10 | 11 | 12; // Czerwiec–Grudzień 2026

/** Dane zapisane po zaimportowaniu PDF faktury */
export interface PDFImportData {
  nazwaPliku: string;
  numerFaktury: string | null;
  ileKolek: number;
  sumaKm: number;
  netto: number;
  brutto: number;
  sredniaKm: number;
  sredniaNetto: number;
  sredniaBrutto: number;
  zakresOd: string | null; // ISO "YYYY-MM-DD"
  zakresDo: string | null;
}

export type InvoiceStatus =
  | "do_wystawienia"
  | "wystawiona"
  | "wyslana"
  | "oplacona"
  | "opozniona";

export interface FakturaWeek {
  id: string;
  label: string; // "Faktura DD.MM–DD.MM.2026"
  kwota: number;
  pdfImport?: PDFImportData; // zaimportowane dane z PDF
  // Zakres dat z PDF nadpisujący standardowy zakres tygodnia (pon–niedz).
  // null/undefined = użyj standardowego zakresu kalendarzowego.
  customRange?: { od: string; do: string } | null; // ISO "YYYY-MM-DD"
  status?: InvoiceStatus; // domyślnie do_wystawienia
  issueDate?: string; // ISO "YYYY-MM-DD"; termin płatności = +21 dni
  // VAT sprzedaży: tryb kwoty i stawka — domyślne z ustawień (netto, 23%)
  amountMode?: "netto" | "brutto";
  vatRate?: number; // np. 0.23
}

/** Status wypłaty kierowcy za miesiąc */
export interface WyplataInfo {
  status: "niewypłacone" | "wypłacone";
  paidAt?: string; // ISO datetime
  paidBy?: string; // imię
}

/** Zamknięcie miesiąca (readonly) */
export interface MonthLock {
  locked: boolean;
  lockedBy?: string;
  lockedAt?: string;
}

/** Typ dnia pracy kierowcy */
export type DayType = "pracujacy" | "wolne" | "urlop" | "chorobowe";

export interface DzienKierowcy {
  data: string; // "2026-06-01" ISO format
  kolka: number; // liczba kółek (tras)
  szkolenie: number; // tylko czerwiec, w zł (0 lub 150)
  dayType?: DayType; // domyślnie "pracujacy"
}

// ─── KATEGORIE I VAT KOSZTÓW ─────────────────────────────────────────────────

/** Kategorie kosztów (wartość w bazie — etykiety UI w tax.ts) */
export type KategoriaKosztu =
  | "serwis"
  | "czesci"
  | "paliwo_adblue"
  | "parking"
  | "myjnia"
  | "oplaty"
  | "ksiegowosc"
  | "ubezpieczenie"
  | "telefon_aplikacje"
  | "internet"
  | "wyposazenie"
  | "art_spozywcze"
  | "inne";

/** Stawka VAT: liczba jako string lub zwolniony/nie podlega */
export type VatRate = "0" | "0.05" | "0.08" | "0.23" | "zw" | "np";

/** Skąd pochodzi kategoria/VAT: ręcznie, z reguły keyword, z AI */
export type ZrodloKategorii = "manual" | "rule" | "ai";

export type DocumentStatus = "brak" | "paragon" | "faktura";

export interface KosztZalacznik {
  id: string;
  typ: "dokument" | "licznik";
  nazwa: string;
  mime: string;
  storagePath?: string; // ścieżka w buckecie `paragony` (nowe wpisy)
  dataUrl?: string; // legacy: base64 zapisane w JSONB (stare wpisy przed migracją na Storage)
  createdAt: string;
}

/** Pola podatkowe kosztu (domyślnie: rozliczany podatkowo, brutto, VAT 23%) */
export interface KosztVatInfo {
  hasInvoice?: boolean; // czy koszt wchodzi do VAT i kosztów podatkowych; domyślnie true
  documentStatus?: DocumentStatus; // brak dokumentu / paragon / faktura
  zalaczniki?: KosztZalacznik[];
  invoiceNumber?: string;
  supplierName?: string;
  supplierNip?: string;
  amountMode?: "netto" | "brutto"; // domyślnie brutto
  vatRate?: VatRate; // domyślnie "0.23"
  vatDeductible?: boolean; // domyślnie true
  vatDeductionPercent?: number; // 0 | 50 | 100, domyślnie 100
  taxNote?: string;
  kategoria?: KategoriaKosztu; // domyślnie "inne"
  kategoriaZrodlo?: ZrodloKategorii; // domyślnie "manual"
  kategoriaConfidence?: number; // 0–1 (tylko AI)
  kategoriaPotwierdzona?: boolean; // admin zatwierdził wynik AI
  vatZrodlo?: ZrodloKategorii; // domyślnie "rule"
}

export interface WpisTankowania extends KosztVatInfo {
  id: string;
  data: string;
  koszt: number;
  litry?: number; // liczba zatankowanych litrów (opcjonalnie, np. wpis od kierowcy)
  dodaneBy?: string; // kto dodał wpis (imię kierowcy, gdy z panelu kierowcy)
}

export interface WpisInnegoKosztu extends KosztVatInfo {
  id: string;
  data: string;
  nazwa: string;
  koszt: number;
}

/** Stan weryfikacji jednego dnia przez kierowcę */
export type WeryfikacjaStatus =
  | "zaakceptowany" // kierowca potwierdził, że dzień się zgadza
  | "zgloszony" // kierowca zgłosił błąd — czeka na decyzję admina
  | "przyjety" // admin przyjął propozycję kierowcy (zastosował)
  | "odrzucony"; // admin odrzucił propozycję

/** Zgłoszenie/weryfikacja dnia przez kierowcę (klucz: dzień ISO) */
export interface ZgloszenieDnia {
  id: string;
  dzien: string; // ISO "YYYY-MM-DD"
  status: WeryfikacjaStatus;
  kolkaSystem: number; // ile kółek było w systemie w chwili weryfikacji
  kolkaProponowane?: number; // propozycja kierowcy (przy zgłoszeniu błędu)
  uwaga?: string; // opcjonalny komentarz kierowcy
  utworzono: string; // ISO datetime
  rozwiazano?: string; // ISO datetime — gdy admin rozstrzygnął
}

/** Obciążenie kierowcy — potrącenie z wypłaty (mandat z winy, szkoda, zaliczka) */
export interface Obciazenie {
  id: string;
  data?: string; // ISO "YYYY-MM-DD"
  nazwa: string;
  kwota: number;
  notatka?: string;
  autor: string;
  utworzono: string; // ISO datetime
}

export interface DaneMiesiaca {
  faktury: FakturaWeek[];
  dni: Record<string, DzienKierowcy>; // klucz: "2026-06-01"
  tankowanie: WpisTankowania[];
  inneKoszty: WpisInnegoKosztu[];
  leasing: number; // domyślnie 2300
  wyplata?: WyplataInfo;
  zamkniety?: MonthLock;
  zgloszenia?: ZgloszenieDnia[]; // weryfikacje dni przez kierowcę
  obciazenia?: Obciazenie[]; // potrącenia z wypłaty kierowcy
}

/** Notatka przypięta do workspace + miesiąca */
export interface Notatka {
  id: string;
  tresc: string;
  dataUtworzenia: string; // ISO datetime
  dataWydarzenia?: string; // ISO "YYYY-MM-DD" — termin/przypomnienie
  autor: string;
  miesiac: number;
}

/** Ustawienia podatkowe workspace (przechowywane w workspaces.data) */
export interface UstawieniaPodatkowe {
  // Koszty (domyślne wartości nowych kosztów)
  defaultCostAmountMode: "netto" | "brutto"; // brutto
  defaultCostVatRate: VatRate; // "0.23"
  defaultCostHasInvoice: boolean; // true
  defaultCostVatDeductible: boolean; // true
  defaultCostVatDeductionPercent: number; // 100
  // Paliwo
  fuelVatDeductionPercent: number; // 100 lub 50
  // Sprzedaż
  invoiceAmountMode: "netto" | "brutto"; // netto
  defaultSalesVatRate: number; // 0.23
  // Podatek dochodowy
  taxForm: "skala" | "liniowy";
  taxFreeAmount: number; // 30000
  firstTaxThreshold: number; // 120000
  firstTaxRate: number; // 0.12
  secondTaxRate: number; // 0.32
  taxReducingAmount: number; // 3600
  linearTaxRate: number; // 0.19
  // Zdrowotna
  healthRateSkala: number; // 0.09
  healthRateLiniowy: number; // 0.049
  healthMinMonthly: number; // 0
  healthMinEnabled: boolean; // true
}

export interface WorkspaceData {
  miesiace: Partial<Record<MiesiącId, DaneMiesiaca>>;
  notatki?: Notatka[];
  ustawienia?: Partial<UstawieniaPodatkowe>;
}

export interface WorkspaceState {
  token: string;
  data: WorkspaceData;
  saveStatus: "idle" | "saving" | "saved" | "error";
}

// Wynik obliczeń dla miesiąca
export interface WynikMiesiaca {
  przychod: number;
  wynagrodzeniePracownika: number;
  paliwo: number;
  inne: number;
  leasing: number;
  zysk: number;
  liczbaSobotPrzepracowanych: number;
  premiaUwzglednioneod4Soboty: boolean;
  // szczegóły
  sumaDniowek: number;
  premia: number;
}

export interface DniowkaInfo {
  kwotaKolek: number;   // kółka × 100
  szkolenie: number;
  dodatekNiedzielny: number;
  dniowka: number;
}
