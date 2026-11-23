-- Confirmed crew snapshots. Planning a later leg does not change the current crew.
BEGIN;
CREATE TABLE IF NOT EXISTS public.shipment_handoffs (
    id bigserial PRIMARY KEY,
    order_id varchar(50) NOT NULL REFERENCES public.shipment_operations(order_id) ON DELETE CASCADE ON UPDATE CASCADE,
    leg_no smallint,
    stop_id text,
    plate text,
    driver text,
    accepted_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    accepted_by integer,
    CHECK ((leg_no IS NOT NULL AND leg_no BETWEEN 1 AND 3 AND stop_id IS NULL) OR (leg_no IS NULL AND stop_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS shipment_handoffs_order_latest ON public.shipment_handoffs(order_id,id DESC);
COMMIT;
