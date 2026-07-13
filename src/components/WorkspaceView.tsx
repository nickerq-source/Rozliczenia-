"use client";

// Główny widok workspace — łączy header, zakładki miesięcy i zawartość

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { AppHeader } from "./AppHeader";
import { TabName } from "./TabSwitch";
import { PodsumowanieTab } from "./tabs/PodsumowanieTab";
import { ZarobekTab } from "./tabs/ZarobekTab";
import { KosztyTab } from "./tabs/KosztyTab";
import { RaportTab } from "./tabs/RaportTab";
import { WiadomosciTab } from "./tabs/WiadomosciTab";
import { LegendaWyplaty } from "./LegendaWyplaty";
import { UstawieniaTab } from "./tabs/UstawieniaTab";
import { getUstawienia, podatkiMiesiaca } from "@/lib/tax";
import { UserNameModal } from "./UserNameModal";
import { MiesiącId, Saldo5050Snapshot, WpisTankowania } from "@/lib/types";
import { domyslneDaneMiesiaca, formatZlCaly } from "@/lib/business-logic";
import { podsumujSaldo, zbierzPozycjeMiesiaca, tekstSalda } from "@/lib/rozliczenie-5050";
import { getUserName, setUserName } from "@/lib/push";
import { logChange } from "@/lib/audit";
import { IconLock, IconLockOpen } from "./ui/icons";
import { getWeeksOfMonth, POLSKIE_MIESIACE, MIESIACE_ZAKRESU, getDefaultMonth } from "@/lib/dates";
import { useAppBackLayer, useSwipeNavigation } from "@/lib/mobile-navigation";
import { getInvoiceWeekIndex } from "@/lib/invoice-weeks";

// Tło z obrazu + ciemna nakładka; karty leżą nad nakładką
function Background() {
  return (
    <>
      <div
        className="fixed inset-0 z-0"
        style={{
          backgroundImage: "url('/papitrans-bg.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center top",
          backgroundAttachment: "fixed",
          // Podbij kolory, żeby tło nie było szare pod nakładką
          filter: "saturate(1.35) contrast(1.08)",
        }}
        aria-hidden
      />
      <div
        className="fixed inset-0 z-0"
        style={{ background: "rgba(7, 12, 9, 0.78)" }}
        aria-hidden
      />
    </>
  );
}

// Skeleton cards podczas ładowania danych
function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="skeleton h-10 w-full" />
      <div className="skeleton h-64 w-full !rounded-2xl" />
      <div className="grid grid-cols-2 gap-3">
        <div className="skeleton h-24 !rounded-2xl" />
        <div className="skeleton h-24 !rounded-2xl" />
      </div>
    </div>
  );
}

function FooterGraphic() {
  return (
    <div className="mt-10 mb-6 select-none pointer-events-none" aria-hidden>
      <svg viewBox="0 0 480 90" xmlns="http://www.w3.org/2000/svg" className="w-full opacity-20">
        {/* Droga */}
        <rect x="0" y="62" width="480" height="6" rx="3" fill="#52525b" />
        {/* Przerywana linia środkowa */}
        <rect x="20"  y="64" width="30" height="2" rx="1" fill="#a1a1aa" />
        <rect x="80"  y="64" width="30" height="2" rx="1" fill="#a1a1aa" />
        <rect x="140" y="64" width="30" height="2" rx="1" fill="#a1a1aa" />
        <rect x="200" y="64" width="30" height="2" rx="1" fill="#a1a1aa" />
        <rect x="260" y="64" width="30" height="2" rx="1" fill="#a1a1aa" />
        <rect x="320" y="64" width="30" height="2" rx="1" fill="#a1a1aa" />
        <rect x="380" y="64" width="30" height="2" rx="1" fill="#a1a1aa" />
        <rect x="440" y="64" width="30" height="2" rx="1" fill="#a1a1aa" />

        {/* Ciężarówka — kabina */}
        <rect x="60" y="36" width="28" height="26" rx="4" fill="#f5a524" />
        {/* Szyba */}
        <rect x="63" y="39" width="22" height="12" rx="2" fill="#1c1917" />
        {/* Reflektor */}
        <rect x="84" y="56" width="6" height="4" rx="1" fill="#fde68a" />
        {/* Naczepa */}
        <rect x="88" y="40" width="80" height="22" rx="3" fill="#3f3f46" />
        {/* Koła kabiny */}
        <circle cx="72"  cy="65" r="5" fill="#27272a" />
        <circle cx="72"  cy="65" r="2" fill="#52525b" />
        {/* Koła naczepy */}
        <circle cx="102" cy="65" r="5" fill="#27272a" />
        <circle cx="102" cy="65" r="2" fill="#52525b" />
        <circle cx="118" cy="65" r="5" fill="#27272a" />
        <circle cx="118" cy="65" r="2" fill="#52525b" />
        <circle cx="156" cy="65" r="5" fill="#27272a" />
        <circle cx="156" cy="65" r="2" fill="#52525b" />

        {/* Pakiety na naczepie */}
        <rect x="100" y="43" width="16" height="12" rx="2" fill="#f5a524" opacity="0.4" />
        <rect x="120" y="44" width="20" height="11" rx="2" fill="#f5a524" opacity="0.3" />
        <rect x="143" y="45" width="14" height="10" rx="2" fill="#f5a524" opacity="0.35" />

        {/* Budynek / magazyn po lewej */}
        <rect x="0" y="30" width="44" height="32" rx="2" fill="#3f3f46" />
        <rect x="0" y="24" width="44" height="8"  rx="2" fill="#52525b" />
        <rect x="6" y="38" width="10" height="14" rx="1" fill="#1c1917" />
        <rect x="20" y="38" width="10" height="14" rx="1" fill="#1c1917" />
        <rect x="34" y="40" width="8" height="12"  rx="1" fill="#f5a524" opacity="0.3" />

        {/* Drzewa po prawej */}
        <rect x="290" y="42" width="4"  height="20" rx="1" fill="#3f3f46" />
        <ellipse cx="292" cy="38" rx="10" ry="9" fill="#3f3f46" />
        <rect x="320" y="46" width="4"  height="16" rx="1" fill="#3f3f46" />
        <ellipse cx="322" cy="42" rx="8"  ry="7" fill="#3f3f46" />

        {/* Budynek po prawej */}
        <rect x="370" y="26" width="50" height="36" rx="2" fill="#3f3f46" />
        <rect x="370" y="20" width="50" height="8"  rx="2" fill="#52525b" />
        <rect x="376" y="34" width="10" height="10" rx="1" fill="#1c1917" />
        <rect x="390" y="34" width="10" height="10" rx="1" fill="#f5a524" opacity="0.25" />
        <rect x="404" y="34" width="10" height="10" rx="1" fill="#1c1917" />
        <rect x="384" y="46" width="12" height="16" rx="1" fill="#1c1917" />

        {/* Chmurki */}
        <ellipse cx="240" cy="12" rx="28" ry="8"  fill="#3f3f46" />
        <ellipse cx="218" cy="15" rx="16" ry="6"  fill="#3f3f46" />
        <ellipse cx="262" cy="15" rx="16" ry="6"  fill="#3f3f46" />
        <ellipse cx="350" cy="8"  rx="20" ry="6"  fill="#3f3f46" />
        <ellipse cx="332" cy="11" rx="12" ry="5"  fill="#3f3f46" />
        <ellipse cx="368" cy="11" rx="12" ry="5"  fill="#3f3f46" />
      </svg>

      <p className="text-center text-xs text-dim/50 mt-1 tracking-widest uppercase font-medium">
        PapiTrans · Flota 2026
      </p>
    </div>
  );
}

function buildCloseChecklist(dane: ReturnType<typeof domyslneDaneMiesiaca>, miesiac: MiesiącId) {
  const weeks = getWeeksOfMonth(miesiac);
  const tygodnieZFaktura = new Set(
    (dane.faktury ?? [])
      .map((f, index) => ({ f, index }))
      .filter(({ f }) => (f.kwota ?? 0) > 0)
      .map(({ f, index }) => getInvoiceWeekIndex(f, index, miesiac))
  );
  const koszty = [...(dane.tankowanie ?? []), ...(dane.inneKoszty ?? [])];
  const kosztyZKategoria = koszty.filter((k) => !!k.kategoria).length;
  const kosztyZeStatusem = koszty.filter((k) => k.documentStatus || k.hasInvoice !== undefined).length;
  const zgloszeniaOtwarte = (dane.zgloszenia ?? []).filter((z) => z.status === "zgloszony").length;

  return [
    {
      label: "Faktury wpisane",
      ok: tygodnieZFaktura.size === weeks.length,
      detail: `${tygodnieZFaktura.size}/${weeks.length} tygodni`,
    },
    {
      label: "Koszty mają kategorię",
      ok: koszty.length === 0 || kosztyZKategoria === koszty.length,
      detail: `${kosztyZKategoria}/${koszty.length}`,
    },
    {
      label: "Koszty mają status dokumentu",
      ok: koszty.length === 0 || kosztyZeStatusem === koszty.length,
      detail: `${kosztyZeStatusem}/${koszty.length}`,
    },
    {
      label: "Wypłata oznaczona",
      ok: dane.wyplata?.status === "wypłacone",
      detail: dane.wyplata?.status ?? "niewypłacone",
    },
    {
      label: "Zgłoszenia kierowcy rozwiązane",
      ok: zgloszeniaOtwarte === 0,
      detail: zgloszeniaOtwarte === 0 ? "OK" : `${zgloszeniaOtwarte} oczekuje`,
    },
  ];
}

interface Props {
  token: string;
  // Z profilu Supabase Auth — gdy podane, pomijamy modal pytania o imię
  initialUserName?: string;
  isAdmin?: boolean;
}

export function WorkspaceView({ token, initialUserName, isAdmin = false }: Props) {
  const { data, loading, saveStatus, updateMiesiac, updateWorkspace, updateNotatki, updateUstawienia } = useWorkspace(token);
  // Domyślnie aktualny miesiąc (nie zawsze Czerwiec). URL param ma priorytet — patrz efekt niżej.
  const [aktywnyMiesiac, setAktywnyMiesiac] = useState<MiesiącId>(getDefaultMonth());
  const [aktywnaZakladka, setAktywnaZakladka] = useState<TabName>("podsumowanie");
  const [focusZgloszenie, setFocusZgloszenie] = useState<string | null>(null);
  const tabHistory = useRef<TabName[]>([]);
  const [tabBackDepth, setTabBackDepth] = useState(0);

  // Deep-link z powiadomienia: /admin?miesiac=6&zakladka=koszty&zgloszenie=ID
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Priorytet miesiąca: URL (?miesiac= albo ?month=) > aktualny miesiąc (init).
    const m = Number(params.get("miesiac") ?? params.get("month"));
    const z = params.get("zakladka");
    const zgl = params.get("zgloszenie");
    if (MIESIACE_ZAKRESU.includes(m as (typeof MIESIACE_ZAKRESU)[number])) {
      setAktywnyMiesiac(m as MiesiącId);
    }
    const zNorm = z === "historia" ? "wiadomosci" : z; // alias starych linków
    if (zNorm === "podsumowanie" || zNorm === "zarobek" || zNorm === "koszty" || zNorm === "raport" || zNorm === "wiadomosci" || zNorm === "legenda" || zNorm === "ustawienia") {
      setAktywnaZakladka(zNorm as TabName);
    }
    if (zgl) setFocusZgloszenie(zgl);
    // Wyczyść query, żeby odświeżenie nie wracało do deep-linku
    if (m || z || zgl) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  // Imię: z profilu auth, fallback do localStorage (legacy)
  const [userName, setUserNameState] = useState<string | null>(initialUserName ?? null);
  useEffect(() => {
    if (initialUserName) {
      setUserName(initialUserName); // synchronizuj localStorage dla push/notatek
      setUserNameState(initialUserName);
    } else {
      setUserNameState(getUserName());
    }
  }, [initialUserName]);

  function handleSaveUserName(name: string) {
    setUserName(name);
    setUserNameState(name);
  }

  const changeZakladka = useCallback(
    (tab: TabName) => {
      if (tab === aktywnaZakladka) return;
      tabHistory.current.push(aktywnaZakladka);
      setTabBackDepth(tabHistory.current.length);
      setAktywnaZakladka(tab);
    },
    [aktywnaZakladka]
  );

  const cofnijZakladke = useCallback(() => {
    const prev = tabHistory.current.pop();
    setTabBackDepth(tabHistory.current.length);
    if (!prev) return true;
    setAktywnaZakladka(prev);
    return true;
  }, []);

  useAppBackLayer(tabBackDepth > 0, "admin-tab-history", cofnijZakladke, 10);

  const swipeTabs = useMemo<TabName[]>(
    () => (isAdmin
      ? ["podsumowanie", "zarobek", "koszty", "raport", "wiadomosci"]
      : ["podsumowanie", "zarobek", "koszty", "raport"]),
    [isAdmin]
  );

  const przelaczSwipe = useCallback(
    (offset: number) => {
      const idx = swipeTabs.indexOf(aktywnaZakladka);
      if (idx < 0) return;
      const next = swipeTabs[idx + offset];
      if (next) changeZakladka(next);
    },
    [aktywnaZakladka, changeZakladka, swipeTabs]
  );

  const swipeHandlers = useSwipeNavigation({
    enabled: !loading,
    onSwipeLeft: () => przelaczSwipe(1),
    onSwipeRight: () => przelaczSwipe(-1),
  });

  const daneMiesiaca = data.miesiace[aktywnyMiesiac] ?? domyslneDaneMiesiaca(aktywnyMiesiac);
  const ustawienia = getUstawienia(data);
  const podatki = isAdmin ? podatkiMiesiaca(data, aktywnyMiesiac) : undefined;
  const monthLocked = !!daneMiesiaca.zamkniety?.locked;
  const closeChecklist = buildCloseChecklist(daneMiesiaca, aktywnyMiesiac);
  const lockedMonths = MIESIACE_ZAKRESU.filter(
    (m) => !!data.miesiace[m as MiesiącId]?.zamkniety?.locked
  ) as number[];

  function handleUpdateMiesiac(updater: (prev: typeof daneMiesiaca) => typeof daneMiesiaca) {
    // Zamknięty miesiąc = readonly (dodatkowo inputy blokuje <fieldset disabled>)
    if (monthLocked) return;
    updateMiesiac(aktywnyMiesiac, updater);
  }

  function moveTankowanieDoMiesiaca(
    id: string,
    targetMonth: MiesiącId,
    patch: Partial<WpisTankowania>
  ): boolean {
    if (monthLocked) return false;
    if (data.miesiace[targetMonth]?.zamkniety?.locked) {
      window.alert(`Miesiąc ${POLSKIE_MIESIACE[targetMonth]} jest zamknięty.`);
      return false;
    }

    updateWorkspace((prev) => {
      const source = prev.miesiace[aktywnyMiesiac] ?? domyslneDaneMiesiaca(aktywnyMiesiac);
      const target = prev.miesiace[targetMonth] ?? domyslneDaneMiesiaca(targetMonth);
      const entry = source.tankowanie.find((t) => t.id === id);
      if (!entry) return prev;
      if (targetMonth === aktywnyMiesiac) {
        return {
          ...prev,
          miesiace: {
            ...prev.miesiace,
            [aktywnyMiesiac]: {
              ...source,
              tankowanie: source.tankowanie.map((t) => (t.id === id ? { ...t, ...patch } : t)),
            },
          },
        };
      }
      return {
        ...prev,
        miesiace: {
          ...prev.miesiace,
          [aktywnyMiesiac]: {
            ...source,
            tankowanie: source.tankowanie.filter((t) => t.id !== id),
          },
          [targetMonth]: {
            ...target,
            tankowanie: [...(target.tankowanie ?? []), { ...entry, ...patch }],
          },
        },
      };
    });
    return true;
  }

  function toggleMonthLock() {
    const nazwa = POLSKIE_MIESIACE[aktywnyMiesiac];
    // Saldo 50/50 liczone teraz (miesiąc jeszcze otwarty) — snapshot na zamknięcie.
    const saldo = podsumujSaldo(zbierzPozycjeMiesiaca(daneMiesiaca, ustawienia, aktywnyMiesiac));
    const saldoTekst = tekstSalda(saldo, formatZlCaly);

    if (monthLocked) {
      if (
        !window.confirm(
          `Odblokować miesiąc ${nazwa} 2026?\n\nUWAGA: odblokowanie cofnie status rozliczenia 50/50 i koszty tego miesiąca znów wejdą do bieżącego salda Artur/Damian.`
        )
      )
        return;
    } else {
      const braki = closeChecklist.filter((x) => !x.ok);
      const detail = braki.length
        ? `\n\nDo sprawdzenia:\n${braki.map((x) => `- ${x.label}: ${x.detail}`).join("\n")}`
        : "";
      if (
        !window.confirm(
          `Zamknąć miesiąc ${nazwa} 2026? Wszystkie pola staną się tylko do odczytu.\n\nRozliczenie 50/50 zostanie uznane za rozliczone: ${saldoTekst}${detail}`
        )
      )
        return;
    }
    const newLocked = !monthLocked;
    const snapshot: Saldo5050Snapshot | undefined = newLocked
      ? {
          arturPaid: saldo.arturPaid,
          damianPaid: saldo.damianPaid,
          firmaPaid: saldo.firmaPaid,
          kosztyRazem: saldo.kosztyRazem,
          kto: saldo.kto,
          ile: saldo.ile,
          settledAt: new Date().toISOString(),
          settledBy: userName ?? "",
        }
      : undefined;
    updateMiesiac(aktywnyMiesiac, (prev) => ({
      ...prev,
      zamkniety: {
        locked: newLocked,
        lockedBy: userName ?? "",
        lockedAt: new Date().toISOString(),
        saldo5050: snapshot,
      },
    }));
    logChange({
      workspaceId: token,
      userName: userName ?? "",
      action: newLocked ? "miesiac_zamkniety" : "miesiac_odblokowany",
      entity: "month",
      entityId: String(aktywnyMiesiac),
      description: newLocked
        ? `${userName} zamknął miesiąc ${nazwa} 2026. Rozliczenie 50/50: ${saldoTekst}`
        : `${userName} odblokował miesiąc ${nazwa} 2026. Snapshot 50/50 został cofnięty.`,
      url: `/admin?miesiac=${aktywnyMiesiac}&zakladka=podsumowanie`,
    });
  }

  return (
    <div className="min-h-screen text-ink">
      <Background />

      <div className="relative z-[1]">
        <AppHeader
          saveStatus={saveStatus}
          aktywnyMiesiac={aktywnyMiesiac}
          onMiesiacChange={setAktywnyMiesiac}
          aktywnaZakladka={aktywnaZakladka}
          onZakladkaChange={changeZakladka}
          userName={userName ?? ""}
          showHistoria={isAdmin}
          lockedMonths={lockedMonths}
        />

        {/* Jednorazowy modal imienia (userName === "" po odczycie localStorage) */}
        {userName === "" && <UserNameModal onSave={handleSaveUserName} />}

        <main
          {...swipeHandlers}
          className="app-swipe-surface max-w-[480px] mx-auto px-3 sm:px-6 py-4 space-y-4 pb-0"
        >
          {loading ? (
            <LoadingSkeleton />
          ) : (
            <>
              {/* Baner zamkniętego miesiąca */}
              {monthLocked && aktywnaZakladka !== "raport" && aktywnaZakladka !== "wiadomosci" && aktywnaZakladka !== "legenda" && aktywnaZakladka !== "ustawienia" && (
                <div className="flex items-center gap-2 rounded-xl bg-surface2 border border-line px-4 py-2.5 text-sm text-dim">
                  <IconLock size={15} className="text-amber-brand" />
                  Miesiąc {POLSKIE_MIESIACE[aktywnyMiesiac]} 2026 jest zamknięty — tylko do odczytu.
                </div>
              )}

              {/* fieldset disabled = wszystkie pola i przyciski readonly */}
              <fieldset disabled={monthLocked} className={monthLocked ? "opacity-80" : undefined}>
                <div className="space-y-4">
                  {aktywnaZakladka === "podsumowanie" && (
                    <PodsumowanieTab
                      miesiac={aktywnyMiesiac}
                      dane={daneMiesiaca}
                      token={token}
                      userName={userName ?? ""}
                      onUpdate={handleUpdateMiesiac}
                      isAdmin={isAdmin}
                      podatki={podatki}
                      taxForm={ustawienia.taxForm}
                      ustawienia={ustawienia}
                    />
                  )}
                  {aktywnaZakladka === "zarobek" && (
                    <ZarobekTab
                      miesiac={aktywnyMiesiac}
                      dane={daneMiesiaca}
                      onUpdate={handleUpdateMiesiac}
                      token={token}
                      userName={userName ?? ""}
                    />
                  )}
                  {aktywnaZakladka === "koszty" && (
                    <KosztyTab
                      miesiac={aktywnyMiesiac}
                      dane={daneMiesiaca}
                      onUpdate={handleUpdateMiesiac}
                      token={token}
                      userName={userName ?? ""}
                      ustawienia={ustawienia}
                      wszystkieMiesiace={data.miesiace}
                      vehicles={data.vehicles}
                      saveStatus={saveStatus}
                      focusZgloszenieId={focusZgloszenie}
                      onMoveTankowanie={moveTankowanieDoMiesiaca}
                    />
                  )}
                </div>
              </fieldset>

              {aktywnaZakladka === "raport" && <RaportTab data={data} />}
              {aktywnaZakladka === "wiadomosci" && isAdmin && (
                <WiadomosciTab
                  token={token}
                  miesiac={aktywnyMiesiac}
                  notatki={data.notatki ?? []}
                  userName={userName ?? ""}
                  onUpdateNotatki={updateNotatki}
                />
              )}
              {aktywnaZakladka === "legenda" && isAdmin && <LegendaWyplaty lang="pl" />}
              {aktywnaZakladka === "ustawienia" && isAdmin && (
                <UstawieniaTab
                  ustawienia={ustawienia}
                  onUpdate={updateUstawienia}
                  token={token}
                  userName={userName ?? ""}
                />
              )}

              {/* Zamknięcie / odblokowanie miesiąca (poza fieldsetem) */}
              {isAdmin && aktywnaZakladka !== "raport" && aktywnaZakladka !== "wiadomosci" && aktywnaZakladka !== "legenda" && aktywnaZakladka !== "ustawienia" && (
                <div className="space-y-2">
                  <div className="rounded-2xl border border-line bg-surface p-4">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wider text-dim">
                      Checklista zamknięcia
                    </p>
                    <div className="space-y-1.5">
                      {closeChecklist.map((item) => (
                        <div key={item.label} className="flex items-center gap-2 text-xs">
                          <span className={item.ok ? "text-green-300" : "text-amber-brand"}>
                            {item.ok ? "✓" : "!"}
                          </span>
                          <span className="flex-1 text-ink">{item.label}</span>
                          <span className="tabular-nums text-dim">{item.detail}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={toggleMonthLock}
                    className="w-full flex items-center justify-center gap-2 py-2.5 min-h-[44px] rounded-xl border border-line text-sm text-dim hover:text-ink hover:border-dim transition-all duration-150"
                  >
                    {monthLocked ? <IconLockOpen size={15} /> : <IconLock size={15} />}
                    {monthLocked
                      ? `Odblokuj miesiąc ${POLSKIE_MIESIACE[aktywnyMiesiac]}`
                      : `Zamknij miesiąc ${POLSKIE_MIESIACE[aktywnyMiesiac]}`}
                  </button>
                </div>
              )}
            </>
          )}

          <FooterGraphic />
        </main>
      </div>
    </div>
  );
}
