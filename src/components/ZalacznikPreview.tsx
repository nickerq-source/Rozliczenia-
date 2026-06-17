"use client";

import { useEffect, useMemo, useState } from "react";
import type { KosztZalacznik } from "@/lib/types";
import { IconLoader, IconPaperclip, IconX } from "./ui/icons";
import { cn } from "@/lib/utils";
import { useAppBackLayer } from "@/lib/mobile-navigation";

interface Props {
  zalaczniki?: KosztZalacznik[];
  label?: string;
  emptyLabel?: string;
  className?: string;
  compact?: boolean;
}

function pickAttachment(zalaczniki: KosztZalacznik[] | undefined): KosztZalacznik | null {
  if (!zalaczniki?.length) return null;
  return zalaczniki.find((z) => z.typ === "dokument") ?? zalaczniki[0] ?? null;
}

async function signedUrl(path: string): Promise<string> {
  const res = await fetch(`/api/attachments/url?path=${encodeURIComponent(path)}`);
  const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !json.url) throw new Error(json.error ?? "Nie udało się utworzyć podglądu.");
  return json.url;
}

export function ZalacznikPreview({
  zalaczniki,
  label = "Podgląd zdjęcia",
  emptyLabel = "Brak zdjęcia dokumentu",
  className,
  compact = false,
}: Props) {
  const attachment = useMemo(() => pickAttachment(zalaczniki), [zalaczniki]);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const canPreview = !!url && !error;

  useAppBackLayer(
    open && canPreview,
    "attachment-preview",
    () => {
      setOpen(false);
      return true;
    },
    80
  );

  useEffect(() => {
    let alive = true;
    setUrl(null);
    setError(false);
    if (!attachment) return;
    if (attachment.dataUrl) {
      setUrl(attachment.dataUrl);
      return;
    }
    if (!attachment.storagePath) return;
    setBusy(true);
    signedUrl(attachment.storagePath)
      .then((next) => {
        if (alive) setUrl(next);
      })
      .catch(() => {
        if (alive) setError(true);
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [attachment]);

  if (!attachment) {
    return <span className={cn("text-[11px] text-dim/60", className)}>{emptyLabel}</span>;
  }

  return (
    <>
      <div className={cn("inline-flex items-center gap-2", className)}>
        {canPreview ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={cn(
              "group inline-flex items-center gap-2 rounded-xl border border-line bg-surface2 p-1.5 text-left hover:border-amber-brand/60",
              compact && "rounded-lg px-2 py-1"
            )}
            title={label}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt="dokument"
              className={cn(
                "h-10 w-10 rounded-lg border border-line object-cover bg-black/30",
                compact && "h-7 w-7 rounded-md"
              )}
            />
            <span className="max-w-[110px] truncate text-[11px] font-semibold text-amber-brand group-hover:text-amber-300">
              {label}
            </span>
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface2 px-2 py-1 text-[11px] text-dim">
            {busy ? <IconLoader size={12} /> : <IconPaperclip size={12} />}
            {busy ? "Ładuję…" : error ? "Brak podglądu" : "Dokument"}
          </span>
        )}
      </div>

      {open && canPreview && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-3 animate-fade-in"
          role="dialog"
          aria-modal="true"
          data-swipe-ignore="true"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative flex max-h-[92vh] w-full max-w-[720px] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-line px-3 py-2">
              <IconPaperclip size={16} className="text-amber-brand" />
              <p className="min-w-0 flex-1 truncate text-sm font-bold text-white">
                {attachment.nazwa || "Dokument"}
              </p>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-amber-brand/50 px-2 py-1 text-xs font-bold text-amber-brand hover:bg-amber-brand/10"
              >
                Otwórz
              </a>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-dim hover:bg-surface2 hover:text-white"
                title="Zamknij"
              >
                <IconX size={17} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-black/30 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt="podgląd dokumentu"
                className="mx-auto max-h-[78vh] max-w-full rounded-xl object-contain"
                data-swipe-ignore="true"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
