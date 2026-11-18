# Booking phase 1

Branch: `feat/booking-phase1`. No live database migration was performed.
Pushing this feature branch may trigger a Vercel Preview; it requires the migration
before the new database queries can work. Production/main is not changed by this work.

## Migration order

1. Existing installations must already have `001-shipment-containers.sql`,
   `002-shipment-legs.sql` and `003-shipment-leg-vehicle-type.sql` applied.
   Do not rerun earlier migrations just to apply this feature.
2. Run the entire `004-booking-phase1.sql` in Neon SQL Editor on the intended TMS database.
   It includes BEGIN/COMMIT. This action is left to the operator; it was not run during implementation.
3. Deploy the matching application code only after the migration succeeds.

The migration adds nullable `bookings.container_list` (JSONB), `job_owner`, `factory`
and `shipment_operations.order_container_size` (text). It snapshots each existing
Order's legacy Booking size only where the new Order size is null. It does not
delete Orders, change existing IDs or change finance formulas.

`container_list` is the initial Booking plan: `[{"qty":5,"size":"40HC"},{"qty":3,"size":"20"}]`.
Actual dispatch and billing size comes from each Order's `order_container_size`,
with the legacy header size as fallback. It is not inferred from the JSON at read time.
Existing rows with a null list are rendered as one quantity/size row.

## Behavior

- Defaults apply only to new Bookings: EXPORT / CONTAINER, one 40HC container.
- Customer lookup uses short names and saves the selected ID. Quick Add stores the
  customer independently, even if the user subsequently cancels the Booking.
- Job owner is separate from `job_name`; the optional old rate lookup remains.
  Saving this form never updates Master Rates.
- EXPORT omits DEMURRAGE from its payload, preserving an existing stored value.
- New Booking, planned container rows, Orders and initial finance rows share one
  checked-out pg client and transaction. The existing shared advisory lock protects
  Order numbering, including the dispatch-add path. The numeric suffix can exceed 999.
- Initial finance rows retain the old price-seeding behavior. Billing confirmation,
  permissions, taxes and formulas are not redesigned in this phase.
- This form keeps the quantity/size plan read-only on existing Bookings; editing
  header details does not recreate missing Orders or remove existing ones.
- Dispatch's existing add-Order path records the supplied size on the new Order.
  The original container plan is not a live count of subsequent dispatch changes.

## Verification

Run `npm test` locally. Tests use a simulated database and DOM, without DATABASE_URL
or any connection to Neon. They cover mixed sizes, rollback on the fifth Order,
legacy editing, Quick Add, connection release, default fields and hidden DEMURRAGE.
SQL execution on actual PostgreSQL and browser end-to-end testing remain to be done
after an operator applies the migration in an approved environment.

## Deferred business decisions

- Whether a second container adds demand or combines existing demand/Orders.
- How to change quantity/size on an already dispatched Booking.
- Which jobs can close without RETURN, and how billing confirms actual amounts.

No automatic policy for these decisions is introduced.
