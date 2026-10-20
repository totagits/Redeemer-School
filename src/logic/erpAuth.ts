/**
 * ERP User Management, Role-Based Access Control (RBAC), and Security Audit Engine.
 * Supports user registration, role assignment, granular data point permissions, and audit logging.
 */

export type ErpSystemRole = 
  | 'ADMINISTRATOR'
  | 'ACCOUNTANT'
  | 'HR_MANAGER'
  | 'INVENTORY_CLERK'
  | 'EXECUTIVE_AUDITOR';

export type PermissionCode = 
  // Finance Permissions
  | 'finance.gl.view'
  | 'finance.gl.post'
  | 'finance.ar.manage'
  | 'finance.ap.manage'
  | 'finance.reports.view'
  // HR Permissions & Sensitive Data Points
  | 'hr.employee.view'
  | 'hr.employee.manage'
  | 'hr.compensation.view_sensitive' // Controls access to executive salaries
  | 'hr.leave.approve'
  | 'hr.payroll.execute'
  // Inventory Permissions
  | 'inventory.stock.view'
  | 'inventory.movement.record'
  | 'inventory.reorder.manage'
  | 'inventory.valuation.view'
  // Administration & Audit
  | 'admin.users.manage'
  | 'admin.roles.assign'
  | 'admin.audit.view';

export interface RoleDefinition {
  code: ErpSystemRole;
  title: string;
  description: string;
  permissions: PermissionCode[];
}

export const SYSTEM_ROLE_DEFINITIONS: Record<ErpSystemRole, RoleDefinition> = {
  ADMINISTRATOR: {
    code: 'ADMINISTRATOR',
    title: 'System Administrator',
    description: 'Unrestricted enterprise control, user provisioning, role assignments, and security audit logs.',
    permissions: [
      'finance.gl.view', 'finance.gl.post', 'finance.ar.manage', 'finance.ap.manage', 'finance.reports.view',
      'hr.employee.view', 'hr.employee.manage', 'hr.compensation.view_sensitive', 'hr.leave.approve', 'hr.payroll.execute',
      'inventory.stock.view', 'inventory.movement.record', 'inventory.reorder.manage', 'inventory.valuation.view',
      'admin.users.manage', 'admin.roles.assign', 'admin.audit.view'
    ]
  },
  ACCOUNTANT: {
    code: 'ACCOUNTANT',
    title: 'Senior Accountant / Controller',
    description: 'Full accounting control over General Ledger, AR, AP, financial statements, and disbursal reconciliations.',
    permissions: [
      'finance.gl.view', 'finance.gl.post', 'finance.ar.manage', 'finance.ap.manage', 'finance.reports.view',
      'inventory.valuation.view', 'inventory.stock.view',
      'hr.employee.view' // Read basic employee info, but CANNOT view sensitive compensation or execute payroll
    ]
  },
  HR_MANAGER: {
    code: 'HR_MANAGER',
    title: 'HR Manager & People Lead',
    description: 'Workforce records management, sensitive compensation data, leave approvals, and payroll runs.',
    permissions: [
      'hr.employee.view', 'hr.employee.manage', 'hr.compensation.view_sensitive', 'hr.leave.approve', 'hr.payroll.execute',
      'finance.reports.view' // Read-only financial statements
    ]
  },
  INVENTORY_CLERK: {
    code: 'INVENTORY_CLERK',
    title: 'Inventory & Warehouse Specialist',
    description: 'Stock physical movements, purchase order receipts, cycle adjustments, and safety reorders.',
    permissions: [
      'inventory.stock.view', 'inventory.movement.record', 'inventory.reorder.manage', 'inventory.valuation.view'
    ]
  },
  EXECUTIVE_AUDITOR: {
    code: 'EXECUTIVE_AUDITOR',
    title: 'Executive Auditor / Board Reviewer',
    description: 'Comprehensive read-only visibility across all financial statements, headcount, inventory, and audit logs.',
    permissions: [
      'finance.gl.view', 'finance.reports.view',
      'hr.employee.view', 'hr.compensation.view_sensitive',
      'inventory.stock.view', 'inventory.valuation.view',
      'admin.audit.view'
    ]
  }
};

export interface ErpUser {
  id: string;
  username: string;
  fullName: string;
  email: string;
  department: string;
  role: ErpSystemRole;
  status: 'ACTIVE' | 'SUSPENDED';
  customPermissionOverrides?: PermissionCode[];
  twoFactorEnabled: boolean;
  createdAt: string;
  lastLoginAt: string;
}

export interface SecurityAuditRecord {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: ErpSystemRole;
  action: string;
  module: 'FINANCE' | 'HR' | 'INVENTORY' | 'SECURITY_ADMIN' | 'REPORTS';
  details: string;
  ipAddress: string;
  status: 'SUCCESS' | 'ACCESS_DENIED';
}

export function checkUserPermission(user: ErpUser, requiredPermission: PermissionCode): boolean {
  if (user.status === 'SUSPENDED') return false;
  
  // Custom overrides (if explicitly granted)
  if (user.customPermissionOverrides && user.customPermissionOverrides.includes(requiredPermission)) {
    return true;
  }

  // Base role permissions
  const roleDef = SYSTEM_ROLE_DEFINITIONS[user.role];
  if (!roleDef) return false;

  return roleDef.permissions.includes(requiredPermission);
}

export function createAuditLog(
  user: ErpUser,
  action: string,
  module: SecurityAuditRecord['module'],
  details: string,
  status: 'SUCCESS' | 'ACCESS_DENIED' = 'SUCCESS',
  ip: string = '192.168.1.104'
): SecurityAuditRecord {
  return {
    id: `audit-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    action,
    module,
    details,
    ipAddress: ip,
    status
  };
}
