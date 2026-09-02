"use client";

import { useEffect, useState } from "react";
import type { LogistykUstawienia, MiesiącId } from "@/lib/types";
import { POLSKIE_MIESIACE } from "@/lib/dates";
import { NumInput } from "./ui/NumInput";
import { Card, CardTitle } from "./ui/Card";
import { IconCheck } from "./ui/icons";

export function LogistykSettingsPanel({
  miesiac,
  settings,
  onSave,
}: {
  miesiac: MiesiącId;
  settings: LogistykUstawienia;
  onSave: (settings: LogistykUstawienia) => void;
}) {
  const [draft, setDraft] = useState(settings);

  useEffect(() => setDraft(settings), [settings]);

  function set<K extends keyof LogistykUstawienia>(key: K, value: LogistykUstawienia[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <Card>
      <CardTitle className="mb-1">Ustawienia rozliczenia — {POLSKIE_MIESIACE[miesiac]} 2026</CardTitle>
      <p className="mb-4 text-[11px] text-dim">
        Ustawienia dotyczą tylko wybranego miesiąca. Zmiana stawki przelicza wszystkie powiązane sumy.
      </p>

      <div className="divide-y divide-line/60 rounded-xl border border-line bg-surface2/50 px-3">
        <SettingRow
          checked={draft.liczProwizjeZlecen}
          onChecked={(value) => set("liczProwizjeZlecen", value)}
          title="Prowizja od zleceń"
          description="Liczona od wartości netto zleceń ręcznych i pobranych z faktur."
        >
          <RateInput
            label="Stawka"
            value={draft.prowizjaZlecenProcent}
            onChange={(value) => set("prowizjaZlecenProcent", value)}
            disabled={!draft.liczProwizjeZlecen}
            suffix="%"
          />
        </SettingRow>

        <SettingRow
          checked={draft.liczProwizjeNaCzysto}
          onChecked={(value) => set("liczProwizjeNaCzysto", value)}
          title="Prowizja od kwoty na czysto"
          description="Liczona od końcowego wyniku po kosztach i podatkach zgodnie z rozpisaniem."
        >
          <RateInput
            label="Stawka"
            value={draft.prowizjaNaCzystoProcent}
            onChange={(value) => set("prowizjaNaCzystoProcent", value)}
            disabled={!draft.liczProwizjeNaCzysto}
            suffix="%"
          />
        </SettingRow>

        <SettingRow
          checked={draft.liczBonusZaAuta}
          onChecked={(value) => set("liczBonusZaAuta", value)}
          title="Bonus za auta"
          description="Stała kwota za każde auto widoczne w rozliczeniu logistyka."
        >
          <RateInput
            label="Za jedno auto"
            value={draft.bonusZaAuto}
            onChange={(value) => set("bonusZaAuto", value)}
            disabled={!draft.liczBonusZaAuta}
            suffix="zł"
          />
        </SettingRow>

        <SettingRow
          checked={draft.liczFakturyDamiana}
          onChecked={(value) => set("liczFakturyDamiana", value)}
          title="Zlecenia z osobnych faktur Damiana"
          description="Po wyłączeniu faktury zostają zapisane, ale ich pozycje nie wchodzą do rozliczenia."
        />
      </div>

      <button
        type="button"
        onClick={() => onSave(draft)}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-brand py-2.5 text-sm font-bold text-amber-ink hover:bg-[#e09420]"
      >
        <IconCheck size={16} /> Zapisz ustawienia
      </button>
    </Card>
  );
}

function SettingRow({
  checked,
  onChecked,
  title,
  description,
  children,
}: {
  checked: boolean;
  onChecked: (value: boolean) => void;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="py-3">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChecked(event.target.checked)}
          aria-label={title}
          className="mt-0.5 h-5 w-5 shrink-0 accent-[#f5a623]"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white">{title}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-dim">{description}</p>
          {children ? <div className="mt-2 max-w-48">{children}</div> : null}
        </div>
      </div>
    </div>
  );
}

function RateInput({
  label,
  value,
  onChange,
  disabled,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
  suffix: string;
}) {
  return (
    <label className="grid grid-cols-[1fr_5.5rem_auto] items-center gap-2 text-[11px] font-semibold text-dim">
      <span>{label}</span>
      <NumInput
        value={value}
        onChange={onChange}
        disabled={disabled}
        min={0}
        className="!h-9 !px-2 !py-1 !text-right !text-sm"
      />
      <span>{suffix}</span>
    </label>
  );
}
