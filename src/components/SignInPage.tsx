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

export const InvitationPasswordSetupPage: React.FC<{ onContinue: () => void }> = ({ onContinue }) => {
  const [token] = useState(() => {
    const value = new URLSearchParams(window.location.search).get('token') || '';
    const route = window.location.pathname === '/reset-password' ? '/reset-password' : '/set-password';
    window.history.replaceState(null, '', route);
    return value;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);
  const isReset = window.location.pathname === '/reset-password';

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get('newPassword') || '');
    const confirmPassword = String(form.get('confirmPassword') || '');
    if (newPassword.length < 12) { setError('Choose a password with at least 12 characters.'); return; }
    if (newPassword !== confirmPassword) { setError('The passwords do not match.'); return; }
    setBusy(true);
    try {
      const response = await fetch(isReset ? '/api/auth/reset-password' : '/api/auth/accept-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ token, newPassword }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not set the account password.');
      setComplete(true);
      window.history.replaceState(null, '', isReset ? '/reset-password' : '/set-password');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reach the password setup service. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10">
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Redeemer ERP · Staging</p>
      {complete ? <>
        <h1 className="mt-2 text-2xl font-extrabold text-slate-950">{isReset ? 'Password reset' : 'Password set'}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{isReset ? 'Your password has been changed. Sign in with your school code, email address, and new password.' : 'Your account is ready. Sign in with your school code, email address, and new password.'}</p>
        <button onClick={onContinue} className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-blue-700 px-4 py-3 text-sm font-bold text-white hover:bg-blue-800">Continue to sign in</button>
      </> : <>
        <h1 className="mt-2 text-2xl font-extrabold text-slate-950">{isReset ? 'Reset your password' : 'Set your account password'}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{isReset ? 'Choose a new private password with at least 12 characters. This reset link expires after 60 minutes and can only be used once.' : 'Choose a private password with at least 12 characters. This invitation link can only be used once.'}</p>
        {!token && <p role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{isReset ? 'This password reset link is missing. Request a new reset link from the sign-in page.' : 'This invitation link is missing or has already been removed from the address. Open the complete link from your email or ask the school administrator for a new invitation.'}</p>}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <label className="block text-sm font-semibold text-slate-700">New password<input required minLength={12} autoComplete="new-password" name="newPassword" type="password" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" /></label>
          <label className="block text-sm font-semibold text-slate-700">Confirm password<input required minLength={12} autoComplete="new-password" name="confirmPassword" type="password" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" /></label>
          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">{error}</p>}
          <button disabled={busy || !token} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-70">{busy ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Setting password…</> : (isReset ? 'Reset password' : 'Set password')}</button>
        </form>
      </>}
    </div>
  </section>;
};

export const SignInPage: React.FC<SignInPageProps> = ({ onCancel, onSignedIn }) => {
  const [schoolCode, setSchoolCode] = useState('RIA');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recoveryMode, setRecoveryMode] = useState<'password' | 'email' | null>(null);
  const [recoveryMessage, setRecoveryMessage] = useState('');

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
          <div className="mt-3 flex justify-between gap-4 text-sm">
            <button type="button" onClick={() => { setRecoveryMode(recoveryMode === 'password' ? null : 'password'); setError(''); setRecoveryMessage(''); }} className="font-semibold text-blue-700 hover:text-blue-900">Forgot password?</button>
            <button type="button" onClick={() => { setRecoveryMode(recoveryMode === 'email' ? null : 'email'); setError(''); }} className="font-semibold text-blue-700 hover:text-blue-900">Forgot email?</button>
          </div>
          {recoveryMode === 'password' && <form className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4" onSubmit={async event => {
            event.preventDefault(); setError(''); setRecoveryMessage('');
            const data = new FormData(event.currentTarget);
            setBusy(true);
            try {
              const response = await fetch('/api/auth/request-password-reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ schoolCode: String(data.get('schoolCode') || '').trim().toUpperCase(), email: String(data.get('email') || '').trim() }) });
              const result = await response.json().catch(() => ({}));
              if (!response.ok) throw new Error(result.error || 'The password reset service is temporarily unavailable.');
              setRecoveryMessage(result.message || 'If the details match an active account, a reset link will be emailed.');
            } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not reach the password reset service. Please try again.'); }
            finally { setBusy(false); }
          }}>
            <h2 className="text-sm font-bold text-slate-900">Reset your password</h2>
            <label className="block text-sm font-semibold text-slate-700">School code<input required name="schoolCode" defaultValue="RIA" autoComplete="organization" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal uppercase" /></label>
            <label className="block text-sm font-semibold text-slate-700">Registered school email<input required type="email" name="email" autoComplete="email" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal" /></label>
            {error && <p role="alert" className="rounded-lg bg-red-50 p-2.5 text-sm text-red-800">{error}</p>}
            {recoveryMessage && <p role="status" className="rounded-lg bg-emerald-50 p-2.5 text-sm text-emerald-900">{recoveryMessage}</p>}
            <button disabled={busy} className="w-full rounded-lg bg-blue-700 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-70">{busy ? 'Sending…' : 'Email me a reset link'}</button>
          </form>}
          {recoveryMode === 'email' && <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-slate-700">
            <h2 className="font-bold text-slate-900">Forgot your school email?</h2>
            <p className="mt-2">For your privacy, this page cannot reveal account email addresses. Contact the school office and share your name and school or staff/student ID. The office should verify your identity before changing the email linked to your account.</p>
            <p className="mt-2 font-semibold">Redeemer’s International Academy · 0778786116 / 0555664239</p>
            <p>RIA Highway, Thinker’s Village, Guest House Road, Paynesville, Montserrado, Liberia</p>
          </div>}
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
