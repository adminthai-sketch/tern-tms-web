-- Run after 001, 002 and 003. Additive: existing rows remain readable.
BEGIN;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS container_list jsonb;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS job_owner text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS factory text;
ALTER TABLE public.shipment_operations ADD COLUMN IF NOT EXISTS order_container_size text;
-- Snapshot the legacy single size, without rewriting an already assigned size.
UPDATE public.shipment_operations s
SET order_container_size = b.container_size
FROM public.bookings b
WHERE s.booking_no = b.booking_no AND s.order_container_size IS NULL;
COMMIT;
