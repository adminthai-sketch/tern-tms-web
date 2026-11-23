-- Additive migration. Does not rename sizes already saved on any Booking/Order.
BEGIN;
ALTER TABLE public.master_container_sizes
    ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP;
INSERT INTO public.master_container_sizes(size_name,description)
SELECT code,label FROM (VALUES
    ('20DC','ตู้แห้ง 20 ฟุต'),('40DC','ตู้แห้ง 40 ฟุต'),('40HC','ตู้สูง 40 ฟุต')
) AS defaults(code,label)
WHERE NOT EXISTS(SELECT 1 FROM public.master_container_sizes existing WHERE lower(trim(existing.size_name))=lower(code));
COMMIT;
