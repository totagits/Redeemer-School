import test from 'node:test';
import assert from 'node:assert/strict';
import { 
  checkUserPermission, 
  createAuditLog, 
  SYSTEM_ROLE_DEFINITIONS,
  type ErpUser 
} from './erpAuth.ts';

test('RBAC: checkUserPermission enforces role-based boundaries and sensitive data point access', () => {
  const accountant: ErpUser = {
    id: 'u-acc',
    username: 'marcus_v',
    fullName: 'Marcus Vance',
    email: 'marcus@erp.org',
    department: 'Finance',
    role: 'ACCOUNTANT',
    status: 'ACTIVE',
    twoFactorEnabled: true,
    createdAt: '2025-01-01',
    lastLoginAt: '2026-10-20'
  };

  const inventoryClerk: ErpUser = {
    id: 'u-inv',
    username: 'kofi_m',
    fullName: 'Kofi Mensah',
    email: 'kofi@erp.org',
    department: 'Operations',
    role: 'INVENTORY_CLERK',
    status: 'ACTIVE',
    twoFactorEnabled: false,
    createdAt: '2025-06-01',
    lastLoginAt: '2026-10-20'
  };

  // Accountant CAN post to GL and view financial reports
  assert.equal(checkUserPermission(accountant, 'finance.gl.post'), true);
  assert.equal(checkUserPermission(accountant, 'finance.reports.view'), true);
  // Accountant CANNOT manage user roles or view sensitive executive salary data
  assert.equal(checkUserPermission(accountant, 'admin.roles.assign'), false);
  assert.equal(checkUserPermission(accountant, 'hr.compensation.view_sensitive'), false);

  // Inventory Clerk CAN record stock movements
  assert.equal(checkUserPermission(inventoryClerk, 'inventory.movement.record'), true);
  // Inventory Clerk CANNOT post GL entries or view HR employee records
  assert.equal(checkUserPermission(inventoryClerk, 'finance.gl.post'), false);
  assert.equal(checkUserPermission(inventoryClerk, 'hr.employee.view'), false);
});

test('RBAC: suspended user is blocked from all permissions', () => {
  const suspendedUser: ErpUser = {
    id: 'u-sus',
    username: 'bad_actor',
    fullName: 'Suspended Account',
    email: 'bad@erp.org',
    department: 'Sales',
    role: 'ADMINISTRATOR',
    status: 'SUSPENDED',
    twoFactorEnabled: false,
    createdAt: '2025-01-01',
    lastLoginAt: '2026-10-10'
  };

  assert.equal(checkUserPermission(suspendedUser, 'finance.gl.view'), false);
  assert.equal(checkUserPermission(suspendedUser, 'admin.users.manage'), false);
});

test('RBAC: createAuditLog generates immutable event record with status and actor data', () => {
  const admin: ErpUser = {
    id: 'u-adm',
    username: 'sys_admin',
    fullName: 'Chief Administrator',
    email: 'admin@erp.org',
    department: 'IT',
    role: 'ADMINISTRATOR',
    status: 'ACTIVE',
    twoFactorEnabled: true,
    createdAt: '2024-01-01',
    lastLoginAt: '2026-10-20'
  };

  const log = createAuditLog(
    admin,
    'ROLE_ASSIGNED',
    'SECURITY_ADMIN',
    'Assigned role ACCOUNTANT to user u-acc'
  );

  assert.equal(log.userId, 'u-adm');
  assert.equal(log.userRole, 'ADMINISTRATOR');
  assert.equal(log.action, 'ROLE_ASSIGNED');
  assert.equal(log.status, 'SUCCESS');
  assert.ok(log.id.startsWith('audit-'));
});
