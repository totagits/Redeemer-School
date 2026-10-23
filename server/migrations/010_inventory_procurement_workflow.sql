-- Inventory request, approval, purchase order, and receipt workflow.
CREATE TABLE procurement_request_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  procurement_request_id uuid NOT NULL,
  item_id uuid NOT NULL,
  quantity numeric(12,2) NOT NULL CHECK (quantity > 0),
  estimated_unit_cost numeric(14,2) NOT NULL DEFAULT 0 CHECK (estimated_unit_cost >= 0),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, procurement_request_id) REFERENCES procurement_requests(school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, item_id) REFERENCES inventory_items(school_id, id),
  UNIQUE (school_id, procurement_request_id, item_id),
  UNIQUE (school_id, id)
);

ALTER TABLE procurement_requests
  ADD COLUMN IF NOT EXISTS decision_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS estimated_currency char(3) NOT NULL DEFAULT 'LRD' CHECK (estimated_currency IN ('LRD', 'USD'));

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_one_per_request
  ON purchase_orders (school_id, procurement_request_id)
  WHERE procurement_request_id IS NOT NULL;

INSERT INTO permissions (code, description) VALUES
  ('inventory.approve', 'Approve or reject procurement requests and purchase orders')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (school_id, role_id, permission_code)
SELECT r.school_id, r.id, 'inventory.approve'
FROM school_roles r
WHERE r.code IN ('SCHOOL_ADMIN', 'PRINCIPAL', 'CAMPUS_ADMIN')
ON CONFLICT (school_id, role_id, permission_code) DO NOTHING;

ALTER TABLE procurement_request_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement_request_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_school_scope ON procurement_request_lines
  USING (school_id = app.current_school_id())
  WITH CHECK (school_id = app.current_school_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE procurement_request_lines TO redeemer_runtime;
