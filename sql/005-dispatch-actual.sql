BEGIN;
ALTER TABLE public.shipment_operations
    ADD COLUMN IF NOT EXISTS is_drop_only boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS actual_drop_date timestamp without time zone,
    ADD COLUMN IF NOT EXISTS actual_load_date timestamp without time zone,
    ADD COLUMN IF NOT EXISTS actual_return_date timestamp without time zone,
    ADD COLUMN IF NOT EXISTS order_vgm_cutoff timestamp without time zone,
    ADD COLUMN IF NOT EXISTS order_return_cutoff timestamp without time zone;
ALTER TABLE public.shipment_containers ADD COLUMN IF NOT EXISTS pop_no text;
INSERT INTO public.shipment_containers (order_id, container_position, pop_no)
SELECT s.order_id, 1, s.pop_no FROM public.shipment_operations s
WHERE NULLIF(BTRIM(s.pop_no), '') IS NOT NULL
    AND NULLIF(BTRIM(s.container_2_no), '') IS NULL
    AND NOT EXISTS (
        SELECT 1 FROM public.shipment_containers c
        WHERE c.order_id = s.order_id AND c.container_position = 2 AND c.container_no IS NOT NULL
    )
ON CONFLICT (order_id, container_position) DO UPDATE SET pop_no = EXCLUDED.pop_no
WHERE shipment_containers.pop_no IS NULL;
COMMIT;
