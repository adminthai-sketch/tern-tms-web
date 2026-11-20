-- Apply after 001 through 007. Existing shipment_legs triggers do not touch this table.
BEGIN;
CREATE TABLE IF NOT EXISTS public.shipment_stops (
    order_id varchar(50) NOT NULL REFERENCES public.shipment_operations(order_id) ON DELETE CASCADE ON UPDATE CASCADE,
    stop_id text NOT NULL,
    segment text NOT NULL CHECK (segment IN ('after_pickup','after_delivery')),
    position integer NOT NULL CHECK (position >= 0),
    location text,
    plate text,
    driver text,
    appointment timestamp without time zone,
    actual_at timestamp without time zone,
    completed boolean NOT NULL DEFAULT false,
    PRIMARY KEY (order_id, stop_id)
);
-- Deterministic IDs make reruns safe. Never overwrite an edited migrated stop.
INSERT INTO public.shipment_stops (order_id,stop_id,segment,position,location,plate,driver,completed)
SELECT order_id,'legacy-drop-' || step_no,
       CASE step_no WHEN 2 THEN 'after_pickup' ELSE 'after_delivery' END,
       0,location,plate,driver,COALESCE(completed,false)
FROM public.shipment_legs
WHERE step_no IN (2,4)
ON CONFLICT (order_id,stop_id) DO NOTHING;
COMMIT;

-- Read-only verification
SELECT segment,count(*) FROM public.shipment_stops GROUP BY segment;
