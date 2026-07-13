export interface UstawieniaObciazenPracownika {
  pracownikPodatekDochodowyMies?: number;
  pracownikSkladkaZdrowotnaMies?: number;
  pracownikPozostaleSkladkiZusMies?: number;
}

export interface ObciazeniaPracownika {
  podatekDochodowyPracownika: number;
  skladkaZdrowotnaPracownika: number;
  pozostaleSkladkiZusPracownika: number;
  obciazeniaPracownika: number;
}

function kwota(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, value ?? 0) * 100) / 100;
}

/** Stałe miesięczne zobowiązania firmy za pracownika, naliczane tylko przy wypłacie. */
export function obliczObciazeniaPracownika(
  ustawienia: UstawieniaObciazenPracownika | undefined,
  maWyplate: boolean
): ObciazeniaPracownika {
  if (!maWyplate) {
    return {
      podatekDochodowyPracownika: 0,
      skladkaZdrowotnaPracownika: 0,
      pozostaleSkladkiZusPracownika: 0,
      obciazeniaPracownika: 0,
    };
  }

  const podatekDochodowyPracownika = kwota(ustawienia?.pracownikPodatekDochodowyMies);
  const skladkaZdrowotnaPracownika = kwota(ustawienia?.pracownikSkladkaZdrowotnaMies);
  const pozostaleSkladkiZusPracownika = kwota(ustawienia?.pracownikPozostaleSkladkiZusMies);

  return {
    podatekDochodowyPracownika,
    skladkaZdrowotnaPracownika,
    pozostaleSkladkiZusPracownika,
    obciazeniaPracownika: kwota(
      podatekDochodowyPracownika
        + skladkaZdrowotnaPracownika
        + pozostaleSkladkiZusPracownika
    ),
  };
}
