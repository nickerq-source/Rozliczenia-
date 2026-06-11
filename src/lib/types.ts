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

export interface DzienKierowcy {
  data: string; // "2026-06-01" ISO format
  kolka: number; // liczba kółek (tras)
  szkolenie: number; // tylko czerwiec, w zł (0 lub 150)
}

export interface WpisTankowania {
  id: string;
  data: string;
  koszt: number;
}

export interface WpisInnegoKosztu {
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

export interface DaneMiesiaca {
  faktury: FakturaWeek[];
  dni: Record<string, DzienKierowcy>; // klucz: "2026-06-01"
  tankowanie: WpisTankowania[];
  inneKoszty: WpisInnegoKosztu[];
  leasing: number; // domyślnie 2300
  wyplata?: WyplataInfo;
  zamkniety?: MonthLock;
  zgloszenia?: ZgloszenieDnia[]; // weryfikacje dni przez kierowcę
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

export interface WorkspaceData {
  miesiace: Partial<Record<MiesiącId, DaneMiesiaca>>;
  notatki?: Notatka[];
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
