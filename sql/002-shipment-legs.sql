BEGIN;

CREATE TABLE IF NOT EXISTS public.shipment_legs (
    order_id varchar(50) NOT NULL REFERENCES public.shipment_operations(order_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    step_no smallint NOT NULL CHECK (step_no BETWEEN 1 AND 5),
    step_type text GENERATED ALWAYS AS (
        CASE step_no WHEN 1 THEN 'PICKUP' WHEN 2 THEN 'DROP'
            WHEN 3 THEN 'DELIVERY' WHEN 4 THEN 'DROP' WHEN 5 THEN 'RETURN' END
    ) STORED,
    plate varchar(100),
    driver varchar(255),
    appointment timestamp without time zone,
    location text,
    completed boolean,
    PRIMARY KEY (order_id, step_no)
);

-- Keep current writers compatible during the transition to the child tables.
CREATE OR REPLACE FUNCTION public.sync_shipment_legs(shipment public.shipment_operations)
RETURNS void LANGUAGE sql AS $$
    INSERT INTO public.shipment_legs (
        order_id, step_no, plate, driver, appointment, location, completed
    )
    SELECT (shipment).order_id, step.step_no, step.plate, step.driver,
           step.appointment, step.location, step.completed
    FROM (VALUES
        (1, (shipment).leg1_plate, (shipment).leg1_driver, (shipment).leg1_appointment, NULL, (shipment).leg1_completed, true),
        (2, (shipment).drop1_plate, (shipment).drop1_driver, NULL, (shipment).drop1_location, (shipment).drop1_completed, (shipment).leg1_is_drop),
        (3, (shipment).leg2_plate, (shipment).leg2_driver, (shipment).leg2_appointment, NULL, (shipment).leg2_completed, true),
        (4, (shipment).drop2_plate, (shipment).drop2_driver, NULL, (shipment).drop2_location, (shipment).drop2_completed, (shipment).leg2_is_drop),
        (5, (shipment).leg3_plate, (shipment).leg3_driver, (shipment).leg3_appointment, NULL, (shipment).leg3_completed, true)
    ) AS step(step_no, plate, driver, appointment, location, completed, enabled)
    WHERE step.enabled OR step.plate IS NOT NULL OR step.driver IS NOT NULL
        OR step.location IS NOT NULL OR step.completed
    ON CONFLICT (order_id, step_no) DO UPDATE SET
        plate = EXCLUDED.plate, driver = EXCLUDED.driver,
        appointment = EXCLUDED.appointment, location = EXCLUDED.location,
        completed = EXCLUDED.completed;
$$;

CREATE OR REPLACE FUNCTION public.refresh_shipment_legs()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM public.shipment_legs
    WHERE order_id = NEW.order_id AND step_no IN (2, 4);
    PERFORM public.sync_shipment_legs(NEW);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shipment_operations_sync_legs ON public.shipment_operations;
CREATE TRIGGER shipment_operations_sync_legs
AFTER INSERT OR UPDATE OF leg1_plate, leg1_driver, leg1_appointment, leg1_completed,
    leg1_is_drop, drop1_plate, drop1_driver, drop1_location, drop1_completed,
    leg2_plate, leg2_driver, leg2_appointment, leg2_completed, leg2_is_drop,
    drop2_plate, drop2_driver, drop2_location, drop2_completed,
    leg3_plate, leg3_driver, leg3_appointment, leg3_completed
ON public.shipment_operations FOR EACH ROW
EXECUTE FUNCTION public.refresh_shipment_legs();

SELECT public.sync_shipment_legs(s) FROM public.shipment_operations AS s;

COMMIT;
