"use client";

// Legenda zasad wypłaty kierowcy — współdzielona przez panel kierowcy i admina.
// Treść (PL/RU) pochodzi z driver-translations; admin używa "pl".

import { Card } from "./ui/Card";
import { IconMoneybag, IconAlertTriangle, IconCheck } from "./ui/icons";
import { cn } from "@/lib/utils";
import { DriverLanguage, driverTexts } from "@/lib/driver-translations";

export function LegendaWyplaty({ lang }: { lang: DriverLanguage }) {
  const t = driverTexts(lang);
  const legend = t.legend;

  return (
    <Card className="!p-4 border-amber-brand/25 bg-surface/90">
      <div className="flex items-start gap-2 mb-3">
        <IconMoneybag size={18} className="text-amber-brand mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-extrabold uppercase tracking-wider text-amber-brand">
            {legend.title}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-dim" style={{ textAlign: "justify" }}>
            {legend.intro}
          </p>
        </div>
      </div>

      <div className="space-y-2.5 text-xs leading-relaxed">
        {legend.sections.map((section) => {
          const highlight = "highlight" in section ? section.highlight : false;
          const points = "points" in section ? section.points : undefined;
          const examples = "examples" in section ? section.examples : undefined;

          return (
            <section
              key={section.title}
              className={cn(
                "rounded-xl border px-3 py-3",
                highlight
                  ? "border-amber-brand/35 bg-amber-brand/10"
                  : "border-line bg-surface2/70"
              )}
            >
              <div className="mb-2 flex items-center gap-2">
                {highlight && <IconAlertTriangle size={13} className="text-amber-brand shrink-0" />}
                <h3 className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-amber-brand underline decoration-amber-brand/70 underline-offset-4">
                  {section.title}
                </h3>
              </div>
              <p className="font-bold text-white">
                {section.important}
              </p>
              {points && (
                <div className="mt-2 space-y-1.5 text-dim">
                  {points.map((point) => (
                    <p key={point} className="flex gap-2" style={{ textAlign: "justify" }}>
                      <span className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-amber-brand" />
                      <span>{point}</span>
                    </p>
                  ))}
                </div>
              )}
              {examples && (
                <div className="mt-2 space-y-1.5">
                  {examples.map((example) => (
                    <p
                      key={example}
                      className="rounded-lg border border-line/70 bg-black/15 px-2.5 py-2 text-dim"
                      style={{ textAlign: "justify" }}
                    >
                      <span className="font-bold text-amber-brand underline decoration-amber-brand/60 underline-offset-4">
                        {lang === "ru" ? "Пример:" : "Przykład:"}
                      </span>{" "}
                      {example}
                    </p>
                  ))}
                </div>
              )}
            </section>
          );
        })}

        <section className="rounded-xl border border-green-500/30 bg-green-soft/70 px-3 py-3">
          <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-green-300 underline decoration-green-300/70 underline-offset-4">
            {legend.summaryTitle}
          </h3>
          <div className="space-y-1.5">
            {legend.summary.map((item) => (
              <p key={item} className="flex gap-2 text-dim" style={{ textAlign: "justify" }}>
                <IconCheck size={13} className="mt-0.5 shrink-0 text-green-300" />
                <span>{item}</span>
              </p>
            ))}
          </div>
        </section>
      </div>
    </Card>
  );
}
