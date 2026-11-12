-- Read-only audit before assigning legacy seal and weight values to containers.
WITH legacy AS (
    SELECT
        NULLIF(BTRIM(container_1_no), '') IS NOT NULL AS has_first_container,
        NULLIF(BTRIM(container_2_no), '') IS NOT NULL AS has_second_container,
        (NULLIF(BTRIM(seal_no), '') IS NOT NULL
            OR tare IS NOT NULL OR max_gross IS NOT NULL) AS has_container_details
    FROM public.shipment_operations
)
SELECT
    COUNT(*) AS total_orders,
    COUNT(*) FILTER (WHERE has_first_container AND has_second_container) AS two_container_orders,
    COUNT(*) FILTER (
        WHERE has_first_container AND has_second_container AND has_container_details
    ) AS two_container_orders_needing_review,
    COUNT(*) FILTER (
        WHERE NOT has_first_container AND NOT has_second_container AND has_container_details
    ) AS orders_with_details_but_no_container_number
FROM legacy;
