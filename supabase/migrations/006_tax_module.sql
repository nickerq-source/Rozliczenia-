-- ════════════════════════════════════════════════════════════════════════
-- PapiTrans — migracja 006: moduł kosztów, kategorii, VAT, PIT i zdrowotnej
-- UWAGA: aplikacja v1 liczy podatki z danych JSONB (workspaces.data) — te
-- kolumny utrzymują spójną strukturę docelową tabel relacyjnych.
-- ════════════════════════════════════════════════════════════════════════

-- ── KATEGORIE I ŹRÓDŁA (other_costs) ────────────────────────────────────────
ALTER TABLE other_costs
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'inne',
  ADD COLUMN IF NOT EXISTS category_source TEXT DEFAULT 'manual'
    CHECK (category_source IN ('manual','rule','ai')),
  ADD COLUMN IF NOT EXISTS category_confidence DECIMAL(4,3),
  ADD COLUMN IF NOT EXISTS categorized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vat_source TEXT DEFAULT 'rule'
    CHECK (vat_source IN ('manual','rule','ai'));

ALTER TABLE fuel_entries
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'paliwo_adblue',
  ADD COLUMN IF NOT EXISTS category_source TEXT DEFAULT 'manual'
    CHECK (category_source IN ('manual','rule','ai')),
  ADD COLUMN IF NOT EXISTS category_confidence DECIMAL(4,3),
  ADD COLUMN IF NOT EXISTS categorized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vat_source TEXT DEFAULT 'rule'
    CHECK (vat_source IN ('manual','rule','ai'));

-- ── VAT KOSZTÓW (fuel_entries + other_costs) ────────────────────────────────
ALTER TABLE fuel_entries
  ADD COLUMN IF NOT EXISTS has_invoice BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS supplier_name TEXT,
  ADD COLUMN IF NOT EXISTS supplier_nip TEXT,
  ADD COLUMN IF NOT EXISTS amount_mode TEXT DEFAULT 'brutto'
    CHECK (amount_mode IN ('netto','brutto')),
  ADD COLUMN IF NOT EXISTS vat_rate TEXT DEFAULT '0.23',
  ADD COLUMN IF NOT EXISTS vat_deductible BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS vat_deduction_percent DECIMAL(5,2) DEFAULT 100.00,
  ADD COLUMN IF NOT EXISTS netto_amount DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS vat_amount DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS vat_deductible_amount DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS brutto_amount DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS tax_cost_amount DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS tax_note TEXT;

ALTER TABLE other_costs
  ADD COLUMN IF NOT EXISTS has_invoice BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS supplier_name TEXT,
  ADD COLUMN IF NOT EXISTS supplier_nip TEXT,
  ADD COLUMN IF NOT EXISTS amount_mode TEXT DEFAULT 'brutto'
    CHECK (amount_mode IN ('netto','brutto')),
  ADD COLUMN IF NOT EXISTS vat_rate TEXT DEFAULT '0.23',
  ADD COLUMN IF NOT EXISTS vat_deductible BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS vat_deduction_percent DECIMAL(5,2) DEFAULT 100.00,
  ADD COLUMN IF NOT EXISTS netto_amount DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS vat_amount DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS vat_deductible_amount DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS brutto_amount DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS tax_cost_amount DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS tax_note TEXT;

-- ── FAKTURY SPRZEDAŻOWE — VAT NALEŻNY ───────────────────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS amount_mode TEXT DEFAULT 'netto'
    CHECK (amount_mode IN ('netto','brutto')),
  ADD COLUMN IF NOT EXISTS vat_rate DECIMAL(4,2) DEFAULT 0.23,
  ADD COLUMN IF NOT EXISTS netto_amount DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS vat_amount DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS brutto_amount DECIMAL(12,2);

-- ── USTAWIENIA PODATKOWE (settings) ─────────────────────────────────────────
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS default_cost_amount_mode TEXT DEFAULT 'brutto',
  ADD COLUMN IF NOT EXISTS default_cost_vat_rate DECIMAL(4,2) DEFAULT 0.23,
  ADD COLUMN IF NOT EXISTS default_cost_has_invoice BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS default_cost_vat_deductible BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS default_cost_vat_deduction_percent DECIMAL(5,2) DEFAULT 100.00,
  ADD COLUMN IF NOT EXISTS fuel_vat_deduction_percent DECIMAL(5,2) DEFAULT 100.00,
  ADD COLUMN IF NOT EXISTS invoice_amount_mode TEXT DEFAULT 'netto',
  ADD COLUMN IF NOT EXISTS default_sales_vat_rate DECIMAL(4,2) DEFAULT 0.23,
  -- PIT (sekcja 11)
  ADD COLUMN IF NOT EXISTS tax_form TEXT DEFAULT 'skala'
    CHECK (tax_form IN ('skala','liniowy')),
  ADD COLUMN IF NOT EXISTS tax_free_amount DECIMAL(12,2) DEFAULT 30000.00,
  ADD COLUMN IF NOT EXISTS first_tax_threshold DECIMAL(12,2) DEFAULT 120000.00,
  ADD COLUMN IF NOT EXISTS first_tax_rate DECIMAL(4,2) DEFAULT 0.12,
  ADD COLUMN IF NOT EXISTS second_tax_rate DECIMAL(4,2) DEFAULT 0.32,
  ADD COLUMN IF NOT EXISTS tax_reducing_amount DECIMAL(12,2) DEFAULT 3600.00,
  ADD COLUMN IF NOT EXISTS linear_tax_rate DECIMAL(4,2) DEFAULT 0.19,
  -- Zdrowotna (sekcja 12)
  ADD COLUMN IF NOT EXISTS health_rate_skala DECIMAL(4,3) DEFAULT 0.090,
  ADD COLUMN IF NOT EXISTS health_rate_liniowy DECIMAL(4,3) DEFAULT 0.049,
  ADD COLUMN IF NOT EXISTS health_min_monthly DECIMAL(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS health_min_enabled BOOLEAN DEFAULT TRUE;
