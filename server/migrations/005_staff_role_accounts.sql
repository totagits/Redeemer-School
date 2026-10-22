-- Align the legacy account role column with the school roles seeded in migration 002.
-- Runtime authorization continues to use school-scoped role assignments and permissions.
ALTER TABLE user_accounts DROP CONSTRAINT IF EXISTS user_accounts_role_check;
ALTER TABLE user_accounts
  ADD CONSTRAINT user_accounts_role_check CHECK (role IN (
    'SCHOOL_ADMIN', 'CAMPUS_ADMIN', 'PRINCIPAL', 'REGISTRAR', 'TEACHER',
    'DEPARTMENT_HEAD', 'FINANCE', 'HR_MANAGER', 'INVENTORY_MANAGER',
    'PARENT', 'STUDENT', 'AUDITOR'
  ));
