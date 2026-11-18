ALTER TABLE public.financials
    ADD COLUMN IF NOT EXISTS additional_revenue jsonb;
