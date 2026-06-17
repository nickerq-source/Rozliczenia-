import { parseNum } from "./business-logic";

export const TANK_CAPACITY_LITERS = 91;

export type FuelReviewStatus =
  | "ok"
  | "needs_review"
  | "no_previous_refuel"
  | "missing_odometer_photo"
  | "missing_receipt_photo"
  | "uncertain_ai"
  | "invalid_odometer"
  | "suspicious_liters"
  | "vat_review";

export interface FuelMetricsInput {
  litersFilled?: number | null;
  grossAmount?: number | null;
  netAmount?: number | null;
  currentOdometerKm?: number | null;
  previousOdometerKm?: number | null;
  hasReceiptPhoto?: boolean;
  hasOdometerPhoto?: boolean;
  aiNeedsReview?: boolean;
  vatNeedsReview?: boolean;
}

export interface FuelMetricsResult {
  previousOdometerKm?: number;
  kmSinceLastFuel?: number;
  fuelBeforeRefuelLiters?: number;
  costPerKmGross?: number;
  costPerKmNet?: number;
  fuelConsumptionLPer100Km?: number;
  needsReview: boolean;
  fuelStatus: FuelReviewStatus;
  reviewReasons: string[];
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

function positive(n: unknown): number | null {
  const value = typeof n === "string" || typeof n === "number" ? parseNum(n) : 0;
  return Number.isFinite(value) && value > 0 ? value : null;
}

function statusPriority(statuses: FuelReviewStatus[]): FuelReviewStatus {
  const priority: FuelReviewStatus[] = [
    "invalid_odometer",
    "suspicious_liters",
    "vat_review",
    "uncertain_ai",
    "missing_receipt_photo",
    "missing_odometer_photo",
    "no_previous_refuel",
    "needs_review",
  ];
  return priority.find((status) => statuses.includes(status)) ?? "ok";
}

export function fuelStatusLabel(status: FuelReviewStatus | undefined): string {
  switch (status) {
    case "ok":
      return "OK";
    case "no_previous_refuel":
      return "Brak poprzedniego tankowania";
    case "missing_odometer_photo":
      return "Brak zdjęcia licznika";
    case "missing_receipt_photo":
      return "Brak zdjęcia paragonu";
    case "uncertain_ai":
      return "Niepewny odczyt AI";
    case "invalid_odometer":
      return "Przebieg nieprawidłowy";
    case "suspicious_liters":
      return "Podejrzana ilość litrów";
    case "vat_review":
      return "VAT do sprawdzenia";
    case "needs_review":
    default:
      return "Do sprawdzenia";
  }
}

export function computeFuelMetrics(input: FuelMetricsInput): FuelMetricsResult {
  const liters = positive(input.litersFilled);
  const gross = positive(input.grossAmount);
  const net = positive(input.netAmount);
  const currentOdo = positive(input.currentOdometerKm);
  const previousOdo = positive(input.previousOdometerKm);
  const statuses: FuelReviewStatus[] = [];
  const reviewReasons: string[] = [];

  let fuelBeforeRefuelLiters: number | undefined;
  if (liters != null) {
    fuelBeforeRefuelLiters = round2(TANK_CAPACITY_LITERS - liters);
    if (liters > TANK_CAPACITY_LITERS || fuelBeforeRefuelLiters < 0) {
      statuses.push("suspicious_liters");
      reviewReasons.push(`Zatankowana ilość litrów przekracza pojemność baku i układu paliwowego ${TANK_CAPACITY_LITERS} L.`);
    } else if (fuelBeforeRefuelLiters < 5) {
      statuses.push("needs_review");
      reviewReasons.push("Przed tankowaniem w baku było bardzo mało paliwa.");
    }
  } else {
    statuses.push("suspicious_liters");
    reviewReasons.push("Brak poprawnej liczby litrów.");
  }

  if (!input.hasReceiptPhoto) {
    statuses.push("missing_receipt_photo");
    reviewReasons.push("Brak zdjęcia paragonu albo faktury.");
  }
  if (!input.hasOdometerPhoto) {
    statuses.push("missing_odometer_photo");
    reviewReasons.push("Brak zdjęcia licznika.");
  }
  if (input.aiNeedsReview) {
    statuses.push("uncertain_ai");
    reviewReasons.push("AI oznaczyło odczyt jako niepewny.");
  }
  if (input.vatNeedsReview) {
    statuses.push("vat_review");
    reviewReasons.push("VAT wymaga ręcznego sprawdzenia.");
  }

  if (currentOdo == null) {
    statuses.push("missing_odometer_photo");
    reviewReasons.push("Brak przebiegu pojazdu.");
  }

  if (previousOdo == null) {
    statuses.push("no_previous_refuel");
    reviewReasons.push("Brak poprzedniego tankowania — statystyki pojawią się od kolejnego wpisu.");
  }

  let kmSinceLastFuel: number | undefined;
  let fuelConsumptionLPer100Km: number | undefined;
  let costPerKmGross: number | undefined;
  let costPerKmNet: number | undefined;

  if (currentOdo != null && previousOdo != null) {
    kmSinceLastFuel = round2(currentOdo - previousOdo);
    if (kmSinceLastFuel <= 0) {
      statuses.push("invalid_odometer");
      reviewReasons.push("Przebieg musi być większy niż przy poprzednim tankowaniu.");
      kmSinceLastFuel = undefined;
    } else {
      if (kmSinceLastFuel < 10) {
        statuses.push("needs_review");
        reviewReasons.push("Od poprzedniego tankowania przejechano mniej niż 10 km.");
      }
      if (liters != null) {
        fuelConsumptionLPer100Km = round2((liters / kmSinceLastFuel) * 100);
        if (fuelConsumptionLPer100Km < 3 || fuelConsumptionLPer100Km > 40) {
          statuses.push("needs_review");
          reviewReasons.push("Spalanie wygląda nietypowo i wymaga sprawdzenia.");
        }
      }
      if (gross != null) costPerKmGross = round2(gross / kmSinceLastFuel);
      if (net != null) costPerKmNet = round2(net / kmSinceLastFuel);
    }
  }

  const fuelStatus = statusPriority(statuses);
  return {
    previousOdometerKm: previousOdo ?? undefined,
    kmSinceLastFuel,
    fuelBeforeRefuelLiters,
    costPerKmGross,
    costPerKmNet,
    fuelConsumptionLPer100Km,
    needsReview: fuelStatus !== "ok",
    fuelStatus,
    reviewReasons: [...new Set(reviewReasons)],
  };
}
