import type { LogistykUstawienia } from "./types";

export const DOMYSLNE_USTAWIENIA_LOGISTYKA: LogistykUstawienia = {
  liczProwizjeZlecen: true,
  prowizjaZlecenProcent: 12,
  liczProwizjeNaCzysto: true,
  prowizjaNaCzystoProcent: 5,
  liczBonusZaAuta: true,
  bonusZaAuto: 200,
  liczFakturyDamiana: true,
};

function boundedPercent(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(0, Math.round(parsed * 100) / 100));
}

function nonNegativeMoney(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed * 100) / 100);
}

export function getLogistykUstawienia(
  value?: Partial<LogistykUstawienia> | null
): LogistykUstawienia {
  const defaults = DOMYSLNE_USTAWIENIA_LOGISTYKA;
  return {
    liczProwizjeZlecen: value?.liczProwizjeZlecen ?? defaults.liczProwizjeZlecen,
    prowizjaZlecenProcent: boundedPercent(
      value?.prowizjaZlecenProcent,
      defaults.prowizjaZlecenProcent
    ),
    liczProwizjeNaCzysto: value?.liczProwizjeNaCzysto ?? defaults.liczProwizjeNaCzysto,
    prowizjaNaCzystoProcent: boundedPercent(
      value?.prowizjaNaCzystoProcent,
      defaults.prowizjaNaCzystoProcent
    ),
    liczBonusZaAuta: value?.liczBonusZaAuta ?? defaults.liczBonusZaAuta,
    bonusZaAuto: nonNegativeMoney(value?.bonusZaAuto, defaults.bonusZaAuto),
    liczFakturyDamiana: value?.liczFakturyDamiana ?? defaults.liczFakturyDamiana,
  };
}
