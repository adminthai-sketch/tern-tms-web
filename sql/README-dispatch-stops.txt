Apply 008-dispatch-stops.sql after 001 through 007 on the TMS database.
Run the complete file. It creates shipment_stops and copies legacy DROP legs
with deterministic IDs. Re-running will not overwrite edited migrated stops.
The existing shipment_legs triggers remain responsible for the legacy fields.
New stops are stored only in shipment_stops, so those triggers cannot delete them.

Deploy matching code only after the migration succeeds. GET /api/shipments
uses shipment_stops for its count. Run the SELECT at the end to verify.
This change does not alter completion rules or financial calculations.

Local tests use mocks. Actual PostgreSQL execution and browser end-to-end
verification are still required before deployment.
