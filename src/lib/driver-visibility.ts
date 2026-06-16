// Zdarzenia, które MOGĄ trafić do kierowcy (panel powiadomień + push na telefon).
// Wszystko spoza tej listy (faktury, koszty, ustawienia, wewnętrzne notatki itp.)
// jest dla kierowcy niewidoczne i nie jest do niego pushowane.
export const DRIVER_VISIBLE_ACTIONS = [
  "wyplata_zmieniona", // dodanie/zmiana dniówki (kółka/szkolenie)
  "wyplata_oznaczona", // wypłata oznaczona jako wypłacona
  "wyplata_cofnieta",
  "obciazenie_dodane",
  "obciazenie_usuniete",
  "notatka_kierowca", // notatka napisana do kierowcy
  "przypomnienie_kierowca", // przypomnienie o terminie notatki dla kierowcy
] as const;

export function czyWidoczneDlaKierowcy(action: string): boolean {
  return (DRIVER_VISIBLE_ACTIONS as readonly string[]).includes(action);
}
