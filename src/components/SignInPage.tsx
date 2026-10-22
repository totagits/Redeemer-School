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
    window.history.replaceState(null, '', '/set-password');
    return value;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);

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
      const response = await fetch('/api/auth/accept-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ token, newPassword }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not set the account password.');
      setComplete(true);
      window.history.replaceState(null, '', '/set-password');
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
        <h1 className="mt-2 text-2xl font-extrabold text-slate-950">Password set</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">Your account is ready. Sign in with your school code, email address, and new password.</p>
        <button onClick={onContinue} className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-blue-700 px-4 py-3 text-sm font-bold text-white hover:bg-blue-800">Continue to sign in</button>
      </> : <>
        <h1 className="mt-2 text-2xl font-extrabold text-slate-950">Set your account password</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Choose a private password with at least 12 characters. This invitation link can only be used once.</p>
        {!token && <p role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">This invitation link is missing or has already been removed from the address. Open the complete link from your email or ask the school administrator for a new invitation.</p>}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <label className="block text-sm font-semibold text-slate-700">New password<input required minLength={12} autoComplete="new-password" name="newPassword" type="password" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" /></label>
          <label cla