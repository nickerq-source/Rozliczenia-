"use client";

// Pole liczbowe — ciemne tło, wyrównane do prawej, focus amber

import { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface NumInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value: number | string;
  onChange: (val: number) => void;
  className?: string;
  placeholder?: string;
}

export function NumInput({ value, onChange, className, placeholder = "0", ...rest }: NumInputProps) {
  return (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      value={value === 0 ? "" : value}
      placeholder={placeholder}
      onChange={(e) => {
        const n = parseFloat(e.target.value);
        onChange(isNaN(n) ? 0 : n);
      }}
      className={cn(
        "w-full bg-input border border-line rounded-[10px] px-3 py-2",
        "text-right text-ink tabular-nums text-[15px]",
        "placeholder:text-dim/50",
        className
      )}
      {...rest}
    />
  );
}
