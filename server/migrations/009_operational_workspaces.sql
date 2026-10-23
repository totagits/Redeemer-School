INSERT INTO permissions (code, description) VALUES
  ('inventory.read', 'View school stock and procurement records'),
  ('inventory.write', 'Record stock and manage procurement'),
  ('communications.read', 'View school announcements and delivery history'),
  ('communications.write', 'Draft and publish school announcements')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (school_id, role_id, permission_code)
SELECT r.school_id, r.id, p.code
FROM school_roles r
CROSS JOIN permissions p
WHERE r.code = 'SCHOOL_ADMIN'
  AND p.code IN ('inventory.read','inventory.write','communications.read','communications.write')
ON CONFLICT (school_id, role_id, permission_code) DO NOTHING;

INSERT INTO role_permissions (school_id, role_id, permission_code)
SELECT r.school_id, r.id, p.code
FROM school_roles r
CROSS JOIN permissions p
WHERE (r.code = 'INVENTORY_MANAGER' AND p.code IN ('inventory.read','inventory.write'))
   OR (r.code IN ('PRINCIPAL','CAMPUS_ADMIN') AND p.code IN ('inventory.read','communications.read','communications.write'))
   OR (r.code IN ('REGISTRAR','TEACHER','HR_MANAGER') AND p.code IN ('communications.read'))
ON CONFLICT (school_id, role_id, permission_code) DO NOTHING;
