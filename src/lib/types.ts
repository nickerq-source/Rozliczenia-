// Typy danych dla aplikacji rozliczeń floty dostawczej

export type MiesiącId = 6 | 7 | 8 | 9 | 10 | 11 | 12; // Czerwiec–Grudzień 2026

/** Dane zapisane po zaimportowaniu PDF faktury */
export type PDFCarUsageType =
  | "driver_car"
  | "company_car"
  | "replacement_car"
  | "unknown";

export interface PDFImportFilter {
  driverName: string;
  vehicleType: string;
  dateFrom: string | null;
  dateTo: string | null;
  settlementVehiclePlate?: string | null;
  settlementVehicleMode?: "none" | "plate";
}

export interface PDFVehicleAssignmentRule {
  id: string;
  driverName: string;
  dateFrom: string;
  dateTo: string;
  vehiclePlate: string;
  vehicleOwnerType: PDFCarUsageType;
  includeInSettlement: boolean;
  reason?: string;
  active: boolean;
}

export interface PDFRecordOverride {
  transportOrderId: string;
  vehiclePlate?: string;
  includeInSettlement: boolean;
  exclusionReason?: string;
  manuallyOverridden: boolean;
}

export type PDFManualAdditionType =
  | "niedziela"
  | "swieto"
  | "dodatkowy_kurs"
  | "doplata"
  | "korekta"
  | "inny";

export interface PDFManualAddition {
  id: string;
  type: PDFManualAdditionType;
  date: string;
  driverName: string;
  netto: number;
  vatRate: number;
  vatAmount: number;
  brutto: number;
  description?: string;
  addToInvoice: boolean;
  addToDriverSettlement: boolean;
}

export interface PDFImportDiagnosticRow {
  orderNumber: string;
  date: string | null;
  driverName: string;
  vehicleType: string;
  route: string;
  km: number;
  cost: number;
  notes: string;
  status: string;
  invitationId: string | null;
  vehicleOwner: PDFCarUsageType;
  vehiclePlate?: string | null;
  vehicleRuleReason?: string;
  manuallyOverridden?: boolean;
  isAdditional?: boolean;
  reason: string;
  rawText?: string;
}

export interface PDFImportData {
  nazwaPliku: string;
  numerFaktury: string | null;
  filters?: PDFImportFilter;
  invoiceImportDateFrom?: string | null;
  invoiceImportDateTo?: string | null;
  manualDateRangeSelected?: boolean;
  settlementVehiclePlate?: string | null;
  settlementVehicleMode?: "none" | "plate";
  vehicleAssignmentRules?: PDFVehicleAssignmentRule[];
  recordOverrides?: PDFRecordOverride[];
  komentarz?: string;
  dodatkiReczne?: PDFManualAddition[];
  courseNetto?: number;
  courseBrutto?: number;
  manualAdditionsNetto?: number;
  manualAdditionsBrutto?: number;
  totalNetto?: number;
  totalBrutto?: number;
  ileKolek: number;
  ileZlecen?: number; // wiersze ze zleceniem (komentarz w Uwagach)
  kolkaNetto?: number; // suma kosztu potwierdzonego samych kółek
  kolkaBrutto?: number;
  zleceniaNetto?: number; // suma kosztu potwierdzonego samych zleceń
  zleceniaBrutto?: number;
  sumaKm: number;
  netto: number;
  brutto: number;
  sredniaKm: number;
  sredniaNetto: number;
  sredniaBrutto: number;
  zakresOd: string | null; // ISO "YYYY-MM-DD"
  zakresDo: string | null;
  pozycjeUwzglednione?: PDFImportDiagnosticRow[];
  pozycjeOdrzucone?: PDFImportDiagnosticRow[];
  sourceRows?: PDFImportDiagnosticRow[];
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
export interface Saldo5050Snapshot {
  arturPaid: number;
  damianPaid: number;
  firmaPaid: number;
  kosztyRazem: number;
  kto: "damian_arturowi" | "artur_damianowi" | "rozliczone";
  ile: number;
  settledAt: string;
  settledBy?: string;
}

export interface MonthLock {
  locked: boolean;
  lockedBy?: string;
  lockedAt?: string;
  // Snapshot rozliczenia 50/50 z chwili zamknięcia (miesiąc = rozliczony na zero).
  saldo5050?: Saldo5050Snapshot;
}

/** Typ dnia pracy kierowcy */
export type DayType =
  | "pracujacy" // P — same trasy (kółka)
  | "praca_zlecenia" // P+Z — trasy + zlecenia
  | "zlecenia" // Z — same zlecenia
  | "wolne"
  | "urlop"
  | "chorobowe";

export interface DzienKierowcy {
  data: string; // "2026-06-01" ISO format
  kolka: number; // liczba kółek (tras)
  szkolenie: number; // tylko czerwiec, w zł (0 lub 150)
  dayType?: DayType; // domyślnie "pracujacy"
  zlecenia?: number; // liczba zleceń w tym dniu (oprócz tras)
  stawkaZlecenia?: number; // zł za jedno zlecenie (50/100/własna); domyślnie 100
}

// ─── KATEGORIE I VAT KOSZTÓW ─────────────────────────────────────────────────

/** Kategorie kosztów (wartość w bazie — etykiety UI w tax.ts) */
export type KategoriaKosztu =
  | "leasing"
  | "serwis"
  | "czesci"
  | "naprawy"
  | "przeglad"
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

export type KosztPayer = "Artur" | "Damian" | "Firma";

export interface KosztZalacznik {
  id: string;
  typ: "dokument" | "licznik";
  attachmentKind?: "receipt" | "odometer" | "tachograph" | "other";
  nazwa: string;
  mime: string;
  storagePath?: string; // ścieżka w buckecie `paragony` (nowe wpisy)
  dataUrl?: string; // legacy: base64 zapisane w JSONB (stare wpisy przed migracją na Storage)
  createdAt: string;
  aiDocumentType?: "receipt" | "odometer" | "tachograph" | "unknown";
  aiConfidence?: number;
  aiNeedsReview?: boolean;
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
  paidBy?: KosztPayer; // kto zapłacił koszt
  kategoria?: KategoriaKosztu; // domyślnie "inne"
  kategoriaZrodlo?: ZrodloKategorii; // domyślnie "manual"
  kategoriaConfidence?: number; // 0–1 (tylko AI)
  kategoriaPotwierdzona?: boolean; // admin zatwierdził wynik AI
  vatZrodlo?: ZrodloKategorii; // domyślnie "rule"
  includeInSplit?: boolean; // czy koszt wchodzi do rozliczenia 50/50; domyślnie true
  splitNote?: string; // notatka do 50/50, np. "prywatne", "tylko Artur"
  settleWithCompany?: boolean; // gdy paidBy=Firma: rozliczać po 50% wobec Firmy
  leasingMonth?: string; // YYYY-MM dla rat leasingu
  opis?: string;
}

export interface WpisTankowania extends KosztVatInfo {
  id: string;
  data: string;
  expenseDate?: string; // rzeczywista data z paragonu/faktury
  accountingMonth?: number; // miesiąc rozliczeniowy, gdy data jest historyczna
  accountingYear?: number;
  isHistorical?: boolean;
  includeInReports?: boolean;
  status?: "pending" | "approved" | "rejected";
  koszt: number;
  litry?: number; // liczba zatankowanych litrów (opcjonalnie, np. wpis od kierowcy)
  stationName?: string;
  dodaneBy?: string; // kto dodał wpis (imię kierowcy, gdy z panelu kierowcy)
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  fuelType?: string;
  pricePerLiter?: number;
  netAmount?: number;
  vatAmount?: number;
  odometerKm?: number;
  mileageSource?: "manual" | "ocr" | "ai" | "confirmed_ai" | "tachograph";
  mileageConfidence?: number;
  tachoStatus?: string;
  speed?: number;
  previousOdometerKm?: number;
  kmSinceLastFuel?: number;
  fuelBeforeRefuelLiters?: number;
  costPerKmGross?: number;
  costPerKmNet?: number;
  fuelConsumptionLPer100Km?: number;
  needsReview?: boolean;
  fuelStatus?:
    | "ok"
    | "needs_review"
    | "no_previous_refuel"
    | "missing_odometer_photo"
    | "missing_receipt_photo"
    | "uncertain_ai"
    | "invalid_odometer"
    | "suspicious_liters"
    | "vat_review";
  reviewReasons?: string[];
  vehicleId?: string;
  isFullTank?: boolean; // domyślnie true; false nie zamyka cyklu tankowania
  note?: string;
  rejectionReason?: string;
}

/** Pojazd używany do budowania niezależnego łańcucha tankowań. */
export interface FuelVehicleConfig {
  id: string;
  name: string;
  registration?: string;
  tankCapacityLiters: number;
  active?: boolean;
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
  leasing: number; // legacy: stara miesięczna rata; nowe raty zapisujemy w inneKoszty jako kategoria "leasing"
  wyplata?: WyplataInfo;
  zamkniety?: MonthLock;
  zgloszenia?: ZgloszenieDnia[]; // weryfikacje dni przez kierowcę
  obciazenia?: Obciazenie[]; // potrącenia z wypłaty kierowcy
}

/** Kanał notatki: wewnętrzny (tylko admini) lub wspólny wątek z kierowcą */
export type NotatkaKanal = "admin" | "kierowca";

/** Notatka przypięta do workspace + miesiąca */
export interface Notatka {
  id: string;
  tresc: string;
  dataUtworzenia: string; // ISO datetime
  dataWydarzenia?: string; // ISO "YYYY-MM-DD" — termin/przypomnienie
  readByDriverAt?: string; // ISO datetime — kierowca potwierdził przeczytanie
  readByDriverId?: string; // auth/profile id kierowcy
  reminderSentAt?: string; // ISO datetime — przypomnienie w dniu wydarzenia wysłane
  autor: string;
  miesiac: number;
  kanal?: NotatkaKanal; // domyślnie "admin" (notatki sprzed podziału = wewnętrzne)
  odKierowcy?: boolean; // true gdy notatkę w kanale "kierowca" napisał kierowca
}

/** Ustawienia podatkowe workspace (przechowywane w workspaces.data) */
export interface UstawieniaPodatkowe {
  // Koszty (domyślne wartości nowych kosztów)
  defaultPayer?: KosztPayer; // domyślny płatnik nowych kosztów/tankowań (domyślnie "Firma")
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
  // Wynagrodzenie pracownika (oficjalne, na umowie)
  pracownikOficjalnyEnabled: boolean; // do podatków liczy oficjalny brutto + ZUS zamiast realnej wypłaty
  pracownikBruttoMies: number; // oficjalny brutto/mies. wg umowy (np. 1255)
  pracownikZusPracodawcyMies: number; // składki ZUS po stronie pracodawcy/mies. (kwota od księgowej)
}

export interface WorkspaceData {
  miesiace: Partial<Record<MiesiącId, DaneMiesiaca>>;
  notatki?: Notatka[];
  ustawienia?: Partial<UstawieniaPodatkowe>;
  vehicles?: FuelVehicleConfig[];
}

export interface WorkspaceState {
  token: string;
  data: WorkspaceData;
  saveStatus: "idle" | "saving" | "saved" | "error";
}

// Wynik obliczeń dla miesiąca
export interface WynikMiesiaca {
  przychod: number;
  wynagrodzeniePracownika: number; // realna wypłata kierowcy (dniówki + premia)
  zusPracodawcy: number; // składki ZUS pracodawcy (gdy włączone oficjalne wynagrodzenie)
  paliwo: number;
  inne: number;
  leasing: number;
  zysk: number;
  liczbaSobotPrzepracowanych: number;
  premiaUwzglednioneod4Soboty: boolean;
  wolneBezplatneRobocze: number;
  dodatkiZablokowaneOdLipca: boolean;
  // szczegóły
  sumaDniowek: number;
  premia: number;
}

export interface DniowkaInfo {
  kwotaKolek: number;   // kółka × 100
  kwotaZlecen: number;  // zlecenia × stawka
  szkolenie: number;
  dodatekNiedzielny: number;
  urlop: number;        // dzień urlopu płatny (250 zł)
  dniowka: number;
}
