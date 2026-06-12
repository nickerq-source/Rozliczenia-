"use client";

// Zakładka Ustawienia (admin) — koszty/VAT, paliwo, sprzedaż, PIT, zdrowotna.
// Każda zmiana trafia do audit logu.

import { UstawieniaPodatkowe, VatRate } from "@/lib/types";
import { Card, CardTitle } from "../ui/Card";
import { NumInput } from "../ui/NumInput";
import { logChange } from "@/lib/audit";
import { cn } from "@/lib/utils";

interface Props {
  ustawienia: UstawieniaPodatkowe;
  onUpdate: (patch: Partial<UstawieniaPodatkowe>) => void;
  token: string;
  userName: string;
}

export function UstawieniaTab({ ustawienia: u, onUpdate, token, userName }: Props) {
  function zmien(patch: Partial<UstawieniaPodatkowe>, opis: string) {
    onUpdate(patch);
    logChange({
      workspaceId: token,
      userName,
      action: "ustawienia_zmienione",
      entity: "settings",
      newValue: patch as Record<string, unknown>,
      description: `${userName} ${opis}`,
    });
  }

  const selectCls = "bg-input border border-line rounded-[10px] px-3 py-2 text-sm text-ink";
  const labelCls = "text-sm text-dim flex-1";
  const rowCls = "flex items-center gap-3 py-2 border-b border-line last:border-0";

  return (
    <div className="space-y-4">
      <p className="text-xs text-dim/70 px-1">
        Podatki są szacunkiem pomocniczym. Ostateczne rozliczenie potwierdza księgowa.
      </p>

      {/* ── KOSZTY ───────────────────────────────────────────────────────── */}
      <Card>
        <CardTitle>Koszty</CardTitle>
        <p className="text-xs text-dim mb-3">
          Domyślnie wszystkie koszty w aplikacji traktowane są jako koszty z faktury.
        </p>
        <div className={rowCls}>
          <span className={labelCls}>Koszty są domyślnie na fakturze</span>
          <input
            type="checkbox"
            checked={u.defaultCostHasInvoice}
            onChange={(e) =>
              zmien({ defaultCostHasInvoice: e.target.checked }, `zmienił domyślne „koszt z faktury" na ${e.target.checked ? "tak" : "nie"}`)
            }
            className="accent-[#f5a524] w-4 h-4"
          />
        </div>
        <div className={rowCls}>
          <span className={labelCls}>Tryb wpisywanej kwoty</span>
          <select
            value={u.defaultCostAmountMode}
            onChange={(e) =>
              zmien({ defaultCostAmountMode: e.target.value as "netto" | "brutto" }, `zmienił domyślny tryb kwoty kosztu na ${e.target.value}`)
            }
            className={selectCls}
          >
            <option value="brutto">brutto</option>
            <option value="netto">netto</option>
          </select>
        </div>
        <div className={rowCls}>
          <span className={labelCls}>Domyślna stawka VAT</span>
          <select
            value={u.defaultCostVatRate}
            onChange={(e) =>
              zmien({ defaultCostVatRate: e.target.value as VatRate }, `zmienił domyślną stawkę VAT kosztów na ${e.target.value}`)
            }
            className={selectCls}
          >
            <option value="0.23">23%</option>
            <option value="0.08">8%</option>
            <option value="0.05">5%</option>
            <option value="0">0%</option>
          </select>
        </div>
        <div className={rowCls}>
          <span className={labelCls}>Domyślne odliczenie VAT</span>
          <select
            value={u.defaultCostVatDeductionPercent}
            onChange={(e) =>
              zmien({ defaultCostVatDeductionPercent: Number(e.target.value) }, `zmienił domyślne odliczenie VAT na ${e.target.value}%`)
            }
            className={selectCls}
          >
            <option value={100}>100%</option>
            <option value={50}>50%</option>
            <option value={0}>0%</option>
          </select>
        </div>
      </Card>

      {/* ── PALIWO ───────────────────────────────────────────────────────── */}
      <Card>
        <CardTitle>Paliwo</CardTitle>
        <div className={rowCls}>
          <span className={labelCls}>Odliczenie VAT od paliwa/AdBlue</span>
          <div className="flex gap-1">
            {[100, 50].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() =>
                  zmien({ fuelVatDeductionPercent: p }, `zmienił odliczenie VAT od paliwa na ${p}%`)
                }
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-bold border transition-colors",
                  u.fuelVatDeductionPercent === p
                    ? "bg-amber-brand text-amber-ink border-amber-brand"
                    : "border-line text-dim hover:text-ink"
                )}
              >
                {p}%
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* ── SPRZEDAŻ ─────────────────────────────────────────────────────── */}
      <Card>
        <CardTitle>Sprzedaż</CardTitle>
        <div className={rowCls}>
          <span className={labelCls}>Tryb kwot faktur sprzedaży</span>
          <select
            value={u.invoiceAmountMode}
            onChange={(e) =>
              zmien({ invoiceAmountMode: e.target.value as "netto" | "brutto" }, `zmienił tryb kwot sprzedaży na ${e.target.value}`)
            }
            className={selectCls}
          >
            <option value="netto">netto</option>
            <option value="brutto">brutto</option>
          </select>
        </div>
        <div className={rowCls}>
          <span className={labelCls}>Stawka VAT sprzedaży</span>
          <select
            value={u.defaultSalesVatRate}
            onChange={(e) =>
              zmien({ defaultSalesVatRate: Number(e.target.value) }, `zmienił stawkę VAT sprzedaży na ${Number(e.target.value) * 100}%`)
            }
            className={selectCls}
          >
            <option value={0.23}>23%</option>
            <option value={0.08}>8%</option>
            <option value={0}>0%</option>
          </select>
        </div>
      </Card>

      {/* ── PODATEK DOCHODOWY ────────────────────────────────────────────── */}
      <Card>
        <CardTitle>Podatek dochodowy (PIT)</CardTitle>
        <div className={rowCls}>
          <span className={labelCls}>Forma opodatkowania</span>
          <div className="flex gap-1">
            {(["skala", "liniowy"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  if (u.taxForm === f) return;
                  zmien({ taxForm: f }, `zmienił formę opodatkowania: ${u.taxForm} → ${f}`);
                }}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-bold border transition-colors",
                  u.taxForm === f
                    ? "bg-amber-brand text-amber-ink border-amber-brand"
                    : "border-line text-dim hover:text-ink"
                )}
              >
                {f === "skala" ? "Skala (12/32%)" : "Liniowy (19%)"}
              </button>
            ))}
          </div>
        </div>

        {u.taxForm === "skala" ? (
          <>
            <div className={rowCls}>
              <span className={labelCls}>Kwota wolna (rocznie)</span>
              <div className="w-32">
                <NumInput
                  value={u.taxFreeAmount}
                  onChange={(v) => zmien({ taxFreeAmount: v }, `zmienił kwotę wolną na ${v} zł`)}
                  className="!py-1.5 !text-sm"
                />
              </div>
            </div>
            <div className={rowCls}>
              <span className={labelCls}>Próg podatkowy</span>
              <div className="w-32">
                <NumInput
                  value={u.firstTaxThreshold}
                  onChange={(v) => zmien({ firstTaxThreshold: v }, `zmienił próg podatkowy na ${v} zł`)}
                  className="!py-1.5 !text-sm"
                />
              </div>
            </div>
            <div className={rowCls}>
              <span className={labelCls}>Stawki (do progu / powyżej)</span>
              <span className="text-sm text-ink tabular-nums">
                {u.firstTaxRate * 100}% / {u.secondTaxRate * 100}%
              </span>
            </div>
            <div className={rowCls}>
              <span className={labelCls}>Kwota zmniejszająca podatek</span>
              <div className="w-32">
                <NumInput
                  value={u.taxReducingAmount}
                  onChange={(v) => zmien({ taxReducingAmount: v }, `zmienił kwotę zmniejszającą na ${v} zł`)}
                  className="!py-1.5 !text-sm"
                />
              </div>
            </div>
          </>
        ) : (
          <div className={rowCls}>
            <span className={labelCls}>Stawka liniowa</span>
            <span className="text-sm text-ink tabular-nums">{u.linearTaxRate * 100}%</span>
          </div>
        )}
      </Card>

      {/* ── ZDROWOTNA ────────────────────────────────────────────────────── */}
      <Card>
        <CardTitle>Składka zdrowotna</CardTitle>
        <div className={rowCls}>
          <span className={labelCls}>Stawka (wg formy opodatkowania)</span>
          <span className="text-sm text-ink tabular-nums">
            {u.taxForm === "skala"
              ? `${(u.healthRateSkala * 100).toFixed(1)}% (skala)`
              : `${(u.healthRateLiniowy * 100).toFixed(1)}% (liniowy)`}
          </span>
        </div>
        <div className={rowCls}>
          <span className={labelCls}>Minimalna składka miesięczna</span>
          <div className="w-32">
            <NumInput
              value={u.healthMinMonthly}
              onChange={(v) => zmien({ healthMinMonthly: v }, `zmienił minimalną składkę zdrowotną na ${v} zł`)}
              className="!py-1.5 !text-sm"
            />
          </div>
        </div>
        <div className={rowCls}>
          <span className={labelCls}>Stosuj minimalną składkę</span>
          <input
            type="checkbox"
            checked={u.healthMinEnabled}
            onChange={(e) =>
              zmien({ healthMinEnabled: e.target.checked }, `${e.target.checked ? "włączył" : "wyłączył"} minimalną składkę zdrowotną`)
            }
            className="accent-[#f5a524] w-4 h-4"
          />
        </div>
      </Card>
    </div>
  );
}
