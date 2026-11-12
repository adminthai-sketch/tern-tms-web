BEGIN;

CREATE TABLE IF NOT EXISTS public.shipment_containers (
    order_id varchar(50) NOT NULL REFERENCES public.shipment_operations(order_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    container_position smallint NOT NULL CHECK (container_position IN (1, 2)),
    container_no varchar(100),
    seal_no varchar(100),
    tare numeric,
    max_gross numeric,
    PRIMARY KEY (order_id, container_position)
);

CREATE INDEX IF NOT EXISTS shipment_containers_container_no_idx
    ON public.shipment_containers (container_no);

WITH legacy AS (
    SELECT order_id, NULLIF(BTRIM(container_1_no), '') AS first_no,
           NULLIF(BTRIM(container_2_no), '') AS second_no, seal_no, tare, max_gross
    FROM public.shipment_operations
)
INSERT INTO public.shipment_containers (
    order_id, container_position, container_no, seal_no, tare, max_gross
)
SELECT order_id, slot.position, slot.container_no,
       CASE WHEN first_no IS NULL OR second_no IS NULL THEN seal_no END,
       CASE WHEN first_no IS NULL OR second_no IS NULL THEN tare END,
       CASE WHEN first_no IS NULL OR second_no IS NULL THEN max_gross END
FROM legacy
CROSS JOIN LATERAL (VALUES (1, first_no), (2, second_no)) AS slot(position, container_no)
WHERE slot.container_no IS NOT NULL
ON CONFLICT (order_id, container_position) DO NOTHING;

COMMIT;
