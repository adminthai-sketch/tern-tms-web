BEGIN;
CREATE TABLE IF NOT EXISTS dispatch_document_audit (
    id bigserial PRIMARY KEY,
    order_id text NOT NULL,
    actor text NOT NULL,
    action text NOT NULL,
    before_data jsonb,
    after_data jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS dispatch_export_templates (
    id bigserial PRIMARY KEY,
    owner_id integer NOT NULL REFERENCES users(id),
    customer_id integer REFERENCES customers(id),
    name text NOT NULL,
    columns jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
