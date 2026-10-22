import React, { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react';

export interface SchoolAccount {
  id: string;
  schoolId: string;
  schoolName: string;
  email: string;
  fullName: string;
  roles: string[];
  permissions: string[];
  mustResetPassword?: boolean;
}

interface SignInPageProps {
  onCancel: () => void;
  onSignedIn: (account: SchoolAccount, csrfToken: string) => void;
}

interface AuthResponse {
  account?: SchoolAccount;
  csrfToken?: string;
  error?: string;
}

export const SignInPage: React.FC<SignInPageProps> = ({ onCancel, onSignedIn }) => {
  const [schoolCode, setSchoolCode] = useState('RIA');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ schoolCode, email, password }),
      });
      const result = await response.json() as AuthResponse;
      if (!response.ok || !result.account || !result.csrfToken) {
        throw new Error(result.error || 'Sign-in failed. Check the school code, email, and password.');
      }
      setPassword('');
      onSignedIn(result.account, result.csrfToken);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reach the sign-in service. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid min-h-[calc(100vh-4rem)] place-items-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <button onClick={onCancel} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950">
          <ArrowLeft className="h-4 w-4" /> Back to school information
        </button>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-800"><LockKeyhole className="h-5 w-5" /></span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">School staff sign-in</p>
              <h1 className="mt-1 text-xl font-bold text-slate-950">Sign in to Redeemer ERP</h1>
            </div>
          </div>
          <p className="mb-6 text-sm leading-6 text-slate-600">Use your school code and the account details provided by your school administrator.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block text-sm font-semibold text-slate-700">
              School code
              <input required autoComplete="organization" value={schoolCode} onChange={event => setSchoolCode(event.target.value.toUpperCase())} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal uppercase outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              School email
              <input required type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Password
              <span className="relative mt-1.5 block">
                <input required type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 pr-12 font-normal outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
                <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-slate-500 hover:text-slate-900">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </span>
            </label>
            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">{error}</p>}
            <button disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-blue-800 disabled:cursor-wait disabled:opacity-70">
              {busy ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Signing in…</> : 'Sign in'}
            </button>
          </form>
          <p className="mt-5 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-950"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> Staging sign-in verifies your account. Student, finance, staff, and other operating screens are still being connected to the database. Do not enter real school records yet.</p>
        </div>
      </div>
    </section>
  );
};

interface SignedInPageProps {
  account: SchoolAccount;
  busy: boolean;
  error: string;
  onSignOut: () => void;
}

export const SignedInPage: React.FC<SignedInPageProps> = ({ account, busy, error, onSignOut }) => (
  <section className="grid min-h-[calc(100vh-4rem)] place-items-center bg-slate-50 px-4 py-10">
    <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8">
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700"><ShieldCheck className="h-6 w-6" /></span>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Sign-in verified</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">Welcome, {account.fullName}</h1>
          <p className="mt-2 text-sm text-slate-600">{account.schoolName} · {account.email}</p>
          <p className="mt-1 text-xs text-slate-500">School code: RIA · Access: {account.roles.join(', ') || 'school account'}</p>
        </div>
      </div>
      <div className="mt-7 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <h2 className="text-sm font-bold text-amber-950">Staging setup is confirmed</h2>
        <p className="mt-1.5 text-sm leading-6 text-amber-900">Your account can sign in to the staging server. The ERP modules are not yet connected to persistent school records, so this page does not open student, fee, staff, or attendance workflows.</p>
      </div>
      {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">{error}</p>}
      <button onClick={onSignOut} disabled={busy} className="mt-6 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-70">{busy ? 'Signing out…' : 'Sign out'}</button>
    </div>
  </section>
);
