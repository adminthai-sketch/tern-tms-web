BEGIN;

ALTER TABLE public.shipment_legs
    ADD COLUMN IF NOT EXISTS vehicle_type text;

-- Capture the current master value only when assigning a plate.
CREATE OR REPLACE FUNCTION public.capture_shipment_leg_vehicle_type()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.plate IS NOT DISTINCT FROM OLD.plate THEN
            NEW.vehicle_type := OLD.vehicle_type;
            RETURN NEW;
        END IF;
    END IF;

    SELECT NULLIF(BTRIM(t.vehicle_type), '') INTO NEW.vehicle_type
    FROM public.trucks AS t
    WHERE t.plate_number = NULLIF(BTRIM(NEW.plate), '');
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shipment_leg_capture_vehicle_type ON public.shipment_legs;
CREATE TRIGGER shipment_leg_capture_vehicle_type
BEFORE INSERT OR UPDATE ON public.shipment_legs
FOR EACH ROW EXECUTE FUNCTION public.capture_shipment_leg_vehicle_type();

-- Upsert existing DROP steps in place so their captured vehicle type survives.
CREATE OR REPLACE FUNCTION public.refresh_shipment_legs()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM public.sync_shipment_legs(NEW);

    DELETE FROM public.shipment_legs
    WHERE order_id = NEW.order_id
      AND (
          (step_no = 2 AND NOT (
              COALESCE(NEW.leg1_is_drop, false) OR NEW.drop1_plate IS NOT NULL
              OR NEW.drop1_driver IS NOT NULL OR NEW.drop1_location IS NOT NULL
              OR COALESCE(NEW.drop1_completed, false)
          ))
          OR (step_no = 4 AND NOT (
              COALESCE(NEW.leg2_is_drop, false) OR NEW.drop2_plate IS NOT NULL
              OR NEW.drop2_driver IS NOT NULL OR NEW.drop2_location IS NOT NULL
              OR COALESCE(NEW.drop2_completed, false)
          ))
      );
    RETURN NEW;
END;
$$;

COMMIT;
