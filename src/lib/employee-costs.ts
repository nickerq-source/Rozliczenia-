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

export interface WyplataPoPotraceniach {
  wynagrodzenieNaliczone: number;
  potraceniaKierowcy: number;
  wynagrodzenieDoWyplaty: number;
}

function kwota(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, value ?? 0) * 100) / 100;
}

/** Realna wypłata gotówkowa po potrąceniach (mandat, szkoda, zaliczka). */
export function obliczWyplatePoPotraceniach(
  wynagrodzenieNaliczone: number,
  sumaPotracen: number
): WyplataPoPotraceniach {
  const naliczone = kwota(wynagrodzenieNaliczone);
  const potracenia = Math.min(naliczone, kwota(sumaPotracen));
  return {
    wynagrodzenieNaliczone: naliczone,
    potraceniaKierowcy: potracenia,
    wynagrodzenieDoWyplaty: kwota(naliczone - potracenia),
  };
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
