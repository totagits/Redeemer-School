import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Users, 
  Key, 
  Lock, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Plus, 
  Search, 
  Download, 
  FileCheck2, 
  ShieldAlert, 
  UserCheck 
} from 'lucide-react';
import { 
  ErpUser, 
  ErpSystemRole, 
  PermissionCode, 
  SecurityAuditRecord, 
  SYSTEM_ROLE_DEFINITIONS, 
  checkUserPermission 
} from '../logic/erpAuth.ts';

interface UserManagementModuleProps {
  users: ErpUser[];
  auditLogs: SecurityAuditRecord[];
  onRegisterUser: (newUser: Omit<ErpUser, 'id' | 'createdAt' | 'lastLoginAt'>) => void;
  onUpdateUserRole: (userId: string, newRole: ErpSystemRole) => void;
  onToggleUserStatus: (userId: string) => void;
}

export const UserManagementModule: React.FC<UserManagementModuleProps> = ({
  users,
  auditLogs,
  onRegisterUser,
  onUpdateUserRole,
  onToggleUserStatus
}) => {
  const [activeTab, setActiveTab] = useState<'users' | 'rbac' | 'audit'>('users');
  const [searchTerm, setSearchTerm] = useState('');
  const [auditModuleFilter, setAuditModuleFilter] = useState('ALL');

  // Modals
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [editingUser, setEditingUser] = useState<ErpUser | null>(null);

  // New User Form State
  const [newFullName, setNewFullName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newDepartment, setNewDepartment] = useState('Finance');
  const [newRole, setNewRole] = useState<ErpSystemRole>('ACCOUNTANT');
  const [new2FA, setNew2FA] = useState(true);

  const permissionCategories: Array<{
    category: string;
    permissions: Array<{ code: PermissionCode; label: string; sensitive?: boolean }>;
  }> = [
    {
      category: 'Finance Module Access',
      permissions: [
        { code: 'finance.gl.view', label: 'View General Ledger & Accounts' },
        { code: 'finance.gl.post', label: 'Post Manual Journal Entries' },
        { code: 'finance.ar.manage', label: 'Manage Invoices & Receive Payments' },
        { code: 'finance.ap.manage', label: 'Manage Vendor Bills & Disbursements' },
        { code: 'finance.reports.view', label: 'Access GAAP Financial Statements' }
      ]
    },
    {
      category: 'Human Resources & Compensation',
      permissions: [
        { code: 'hr.employee.view', label: 'View Staff Directory & Profiles' },
        { code: 'hr.employee.manage', label: 'Onboard & Edit Employee Records' },
        { 
          code: 'hr.compensation.view_sensitive', 
          label: 'Inspect Sensitive Executive Salary & Bonus Figures',
          sensitive: true 
        },
        { code: 'hr.leave.approve', label: 'Adjudicate Employee Leave Requests' },
        { code: 'hr.payroll.execute', label: 'Execute Monthly Payroll Runs' }
      ]
    },
    {
      category: 'Inventory & Supply Chain',
      permissions: [
        { code: 'inventory.stock.view', label: 'View Stock Quantities & Locations' },
        { code: 'inventory.movement.record', label: 'Record Stock In / Stock Out Movements' },
        { code: 'inventory.reorder.manage', label: 'Authorize Purchase Order Reorders' },
        { code: 'inventory.valuation.view', label: 'Access Balance Sheet Inventory Cost Valuation' }
      ]
    },
    {
      category: 'Administration & System Audit',
      permissions: [
        { code: 'admin.users.manage', label: 'Register Users & Suspend Accounts' },
        { code: 'admin.roles.assign', label: 'Modify User Role & Permission Assignments' },
        { code: 'admin.audit.view', label: 'Inspect Immutable Security Audit Logs' }
      ]
    }
  ];

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFullName.trim() || !newUsername.trim() || !newEmail.trim()) return;

    onRegisterUser({
      fullName: newFullName,
      username: newUsername,
      email: newEmail,
      department: newDepartment,
      role: newRole,
      status: 'ACTIVE',
      twoFactorEnabled: new2FA
    });

    setShowRegisterModal(false);
    setNewFullName('');
    setNewUsername('');
    setNewEmail('');
  };

  const handleAuditExport = () => {
    const headers = ['Timestamp', 'UserName', 'Role', 'Action', 'Module', 'Status', 'IPAddress', 'Details'];
    const rows = auditLogs.map(l => [
      l.timestamp,
      `"${l.userName}"`,
      l.userRole,
      l.action,
      l.module,
      l.status,
      l.ipAddress,
      `"${l.details.replace(/"/g, '""')}"`
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'The_Redeemer_School_Security_Audit_Logs.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredUsers = users.filter(u => 
    u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.department.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredAudit = auditLogs.filter(a => 
    auditModuleFilter === 'ALL' || a.module === auditModuleFilter
  );

  return (
    <div className="space-y-6">
      {/* Title & Tab Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-slate-800" />
            The Redeemer School — Staff Access & RBAC Controls
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Role-based authorization (Principal, Bursar, Dean, Storekeeper, MoE Auditor), sensitive compensation gating, and security audit log
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            onClick={() => setActiveTab('users')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'users' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            User Directory ({users.length})
          </button>
          <button
            onClick={() => setActiveTab('rbac')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'rbac' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Permissions & Data Points Matrix
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'audit' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Security Audit Trail ({auditLogs.length})
          </button>
        </div>
      </div>

      {/* TAB 1: User Directory & Registration */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search user, email, department..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-400"
              />
            </div>

            <button
              onClick={() => setShowRegisterModal(true)}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1.5 shadow-xs whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Register Enterprise User
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-2.5 px-4">User Details</th>
                    <th className="py-2.5 px-4">Department</th>
                    <th className="py-2.5 px-4">Assigned Role</th>
                    <th className="py-2.5 px-4 text-center">2FA Auth</th>
                    <th className="py-2.5 px-4">Last Activity</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/75 transition-colors">
                      <td className="py-2.5 px-4">
                        <div className="font-bold text-slate-900">{u.fullName}</div>
                        <div className="text-[11px] text-slate-400 font-mono">@{u.username} · {u.email}</div>
                      </td>
                      <td className="py-2.5 px-4 text-slate-700 font-medium">{u.department}</td>
                      <td className="py-2.5 px-4">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm ${
                          u.role === 'ADMINISTRATOR' ? 'bg-rose-50 text-rose-700' :
                          u.role === 'ACCOUNTANT' ? 'bg-blue-50 text-blue-700' :
                          u.role === 'HR_MANAGER' ? 'bg-purple-50 text-purple-700' :
                          u.role === 'INVENTORY_CLERK' ? 'bg-amber-50 text-amber-700' :
                          'bg-emerald-50 text-emerald-700'
                        }`}>
                          {SYSTEM_ROLE_DEFINITIONS[u.role].title}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        {u.twoFactorEnabled ? (
                          <span className="text-emerald-700 text-xs font-semibold flex items-center justify-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Enforced
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">Optional</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {u.lastLoginAt}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm ${
                          u.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}>
                          {u.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => setEditingUser(u)}
                            className="px-2 py-1 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
                          >
                            Edit Role
                          </button>
                          <button
                            onClick={() => onToggleUserStatus(u.id)}
                            className={`px-2 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                              u.status === 'ACTIVE' 
                                ? 'text-rose-700 bg-rose-50 hover:bg-rose-100' 
                                : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                            }`}
                          >
                            {u.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Roles & Granular Data Points Matrix */}
      {activeTab === 'rbac' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <h2 className="text-sm font-bold text-slate-900">
              Role-Based Access Control (RBAC) & Data Point Access Matrix
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Every operation and sensitive data point (such as executive compensation or journal posting) is enforced at the controller level.
            </p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 border-b border-slate-200 text-slate-800 font-bold">
                  <tr>
                    <th className="py-3 px-4 w-96">Module Permission / Data Point</th>
                    <th className="py-3 px-3 text-center">Administrator</th>
                    <th className="py-3 px-3 text-center">Accountant</th>
                    <th className="py-3 px-3 text-center">HR Manager</th>
                    <th className="py-3 px-3 text-center">Inventory Clerk</th>
                    <th className="py-3 px-3 text-center">Executive Auditor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {permissionCategories.map((cat, cIdx) => (
                    <React.Fragment key={cIdx}>
                      <tr className="bg-slate-50 font-bold text-[11px] text-slate-500 uppercase tracking-wider">
                        <td colSpan={6} className="py-2 px-4">{cat.category}</td>
                      </tr>
                      {cat.permissions.map((perm) => (
                        <tr key={perm.code} className="hover:bg-slate-50/50">
                          <td className="py-2.5 px-4 font-medium text-slate-800">
                            <div className="flex items-center gap-1.5">
                              {perm.label}
                              {perm.sensitive && (
                                <span className="text-[10px] bg-rose-100 text-rose-800 font-bold px-1.5 py-0.2 rounded-sm flex items-center gap-0.5">
                                  <Lock className="w-2.5 h-2.5" /> Sensitive Data Point
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400 mt-0.5">{perm.code}</div>
                          </td>
                          {(['ADMINISTRATOR', 'ACCOUNTANT', 'HR_MANAGER', 'INVENTORY_CLERK', 'EXECUTIVE_AUDITOR'] as ErpSystemRole[]).map((r) => {
                            const hasAccess = SYSTEM_ROLE_DEFINITIONS[r].permissions.includes(perm.code);
                            return (
                              <td key={r} className="py-2.5 px-3 text-center">
                                {hasAccess ? (
                                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-300">
                                    —
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Security Audit Trail */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">Filter by Module:</span>
              <select
                value={auditModuleFilter}
                onChange={(e) => setAuditModuleFilter(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-hidden cursor-pointer"
              >
                <option value="ALL">All Modules</option>
                <option value="FINANCE">Finance</option>
                <option value="HR">Human Resources</option>
                <option value="INVENTORY">Inventory</option>
                <option value="SECURITY_ADMIN">Security Administration</option>
                <option value="REPORTS">Reports & Export</option>
              </select>
            </div>

            <button
              onClick={handleAuditExport}
              className="px-3 py-1.5 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Download Audit CSV
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-4">Timestamp</th>
                    <th className="py-2.5 px-4">Actor</th>
                    <th className="py-2.5 px-4">Action</th>
                    <th className="py-2.5 px-4">Module</th>
                    <th className="py-2.5 px-4">Event Details</th>
                    <th className="py-2.5 px-4">IP Address</th>
                    <th className="py-2.5 px-4">Outcome</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAudit.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/75">
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {log.timestamp.replace('T', ' ').slice(0, 19)}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-bold text-slate-900">{log.userName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{log.userRole}</div>
                      </td>
                      <td className="py-2.5 px-4 font-mono font-bold text-slate-800">
                        {log.action}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded-sm">
                          {log.module}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-700 max-w-md">
                        {log.details}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-500 text-[11px] whitespace-nowrap">
                        {log.ipAddress}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm ${
                          log.status === 'SUCCESS' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}>
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Register New User */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-slate-200 p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              Register New Enterprise User
            </h3>

            <form onSubmit={handleRegisterSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Legal Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Samuel K. Doe"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Username</label>
                  <input
                    type="text"
                    required
                    placeholder="samuel_d"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Department</label>
                  <select
                    value={newDepartment}
                    onChange={(e) => setNewDepartment(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2"
                  >
                    <option value="Finance">Finance</option>
                    <option value="Human Resources">Human Resources</option>
                    <option value="Logistics & Warehouse">Logistics & Warehouse</option>
                    <option value="Executive Operations">Executive Operations</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Corporate Email</label>
                <input
                  type="email"
                  required
                  placeholder="s.doe@enterprise-erp.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Initial System Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as ErpSystemRole)}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2"
                >
                  <option value="ACCOUNTANT">Accountant / Controller</option>
                  <option value="HR_MANAGER">HR Manager & People Lead</option>
                  <option value="INVENTORY_CLERK">Inventory Clerk / Logistics</option>
                  <option value="ADMINISTRATOR">System Administrator</option>
                  <option value="EXECUTIVE_AUDITOR">Executive Auditor</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="twofa"
                  checked={new2FA}
                  onChange={(e) => setNew2FA(e.target.checked)}
                  className="rounded-sm border-slate-300"
                />
                <label htmlFor="twofa" className="text-xs text-slate-700 font-medium">
                  Enforce Two-Factor Authentication (2FA) on login
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  Provision User Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Edit User Role */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full border border-slate-200 p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              Update Role & Permissions
            </h3>
            <p className="text-xs text-slate-500">
              User: <strong className="text-slate-900">{editingUser.fullName}</strong> (@{editingUser.username})
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Assign Role</label>
              <select
                defaultValue={editingUser.role}
                id="editRoleSelect"
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2"
              >
                <option value="ADMINISTRATOR">System Administrator</option>
                <option value="ACCOUNTANT">Accountant / Controller</option>
                <option value="HR_MANAGER">HR Manager</option>
                <option value="INVENTORY_CLERK">Inventory Clerk</option>
                <option value="EXECUTIVE_AUDITOR">Executive Auditor</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const sel = document.getElementById('editRoleSelect') as HTMLSelectElement;
                  if (sel) {
                    onUpdateUserRole(editingUser.id, sel.value as ErpSystemRole);
                    setEditingUser(null);
                  }
                }}
                className="px-4 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                Save Assignment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
