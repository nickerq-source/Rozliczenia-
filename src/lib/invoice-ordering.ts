export interface InvoiceSlotOrderData {
  empty: boolean;
  sourceOrder: number;
  weekIndex?: number;
}

export function orderAndNumberInvoiceSlots<T extends InvoiceSlotOrderData>(
  slots: T[]
): Array<T & { displayLabel: string }> {
  return [...slots]
    .sort((a, b) => {
      const emptyOrder = Number(a.empty) - Number(b.empty);
      return emptyOrder || a.sourceOrder - b.sourceOrder || (a.weekIndex ?? 0) - (b.weekIndex ?? 0);
    })
    .map((slot, index) => ({ ...slot, displayLabel: `Faktura ${index + 1}` }));
}
