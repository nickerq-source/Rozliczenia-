export interface MileageOcrResult {
  mileage: number | null;
  mileageText: string | null;
  tachoStatus: string | null;
  speed: number | null;
  confidence: number;
  source: "tachograph_display" | "odometer_display" | "manual";
}

function toNum(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/[^0-9,.-]/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function normalizeMileageValue(raw: unknown): number | null {
  const n = toNum(raw);
  if (n == null) return null;
  // Odrzucamy godzinę, prędkość, temperaturę, krótkie tripy i inne drobne liczby.
  if (n < 1000 || n > 2_000_000) return null;
  return Math.round(n * 10) / 10;
}

export function parseMileageFromText(text: string): MileageOcrResult {
  const sourceText = text.replace(/\s+/g, " ").trim();
  const speedMatch = sourceText.match(/(\d+(?:[,.]\d+)?)\s*km\s*\/\s*h/i);
  const speed = speedMatch ? toNum(speedMatch[1]) : null;
  const statusMatch = sourceText.match(/\b(OUT|IN|REST|DRIVE|WORK|PAUSE)\b/i);
  const tachoStatus = statusMatch ? statusMatch[1].toUpperCase() : null;

  const withoutDistractors = sourceText
    .replace(/\b\d{1,2}:\d{2}\b/g, " ")
    .replace(/\d+(?:[,.]\d+)?\s*km\s*\/\s*h/gi, " ");

  const candidates: { value: number; raw: string; nearKm: boolean }[] = [];
  for (const match of withoutDistractors.matchAll(/(^|[^\d])(\d{4,7}(?:[,.]\d)?)\s*km\b(?!\s*\/)/gi)) {
    const value = normalizeMileageValue(match[2]);
    if (value != null) candidates.push({ value, raw: match[2], nearKm: true });
  }
  if (!candidates.length) {
    for (const match of withoutDistractors.matchAll(/(^|[^\d])(\d{4,7}(?:[,.]\d)?)(?=$|[^\d])/g)) {
      const value = normalizeMileageValue(match[2]);
      if (value != null) candidates.push({ value, raw: match[2], nearKm: false });
    }
  }

  candidates.sort((a, b) => {
    if (a.nearKm !== b.nearKm) return a.nearKm ? -1 : 1;
    return b.value - a.value;
  });

  const best = candidates[0];
  if (!best) {
    return {
      mileage: null,
      mileageText: null,
      tachoStatus,
      speed,
      confidence: 0,
      source: tachoStatus ? "tachograph_display" : "odometer_display",
    };
  }

  let confidence = best.nearKm ? 0.86 : 0.72;
  if (tachoStatus) confidence += 0.04;
  if (speed != null) confidence += 0.03;

  return {
    mileage: best.value,
    mileageText: `${String(best.raw).replace(",", ".")} km`,
    tachoStatus,
    speed,
    confidence: Math.min(0.95, Math.round(confidence * 100) / 100),
    source: tachoStatus ? "tachograph_display" : "odometer_display",
  };
}

export function normalizeMileageAi(raw: Record<string, unknown>): MileageOcrResult {
  const mileage =
    normalizeMileageValue(raw.mileage) ??
    normalizeMileageValue(raw.odometerKm) ??
    normalizeMileageValue(raw.odometer_km);
  const mileageText =
    typeof raw.mileage_text === "string"
      ? raw.mileage_text.trim() || null
      : typeof raw.mileageText === "string"
      ? raw.mileageText.trim() || null
      : mileage != null
      ? `${mileage} km`
      : null;
  const tachoStatus =
    typeof raw.tacho_status === "string"
      ? raw.tacho_status.trim().toUpperCase() || null
      : typeof raw.tachoStatus === "string"
      ? raw.tachoStatus.trim().toUpperCase() || null
      : null;
  const speed = toNum(raw.speed);
  const confidenceRaw = toNum(raw.confidence);
  const confidence =
    confidenceRaw == null ? 0 : Math.max(0, Math.min(1, Math.round(confidenceRaw * 100) / 100));

  return {
    mileage,
    mileageText,
    tachoStatus,
    speed,
    confidence: mileage == null ? 0 : confidence,
    source: tachoStatus ? "tachograph_display" : "odometer_display",
  };
}
