import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, LoaderCircle } from 'lucide-react';

type Option = { id: string; name: string; code?: string; grade_level?: string; education_level_id?: string | null };
type AdmissionsOptions = { schoolName: string; levels: Option[]; classes: Option[] };

const fieldClass = 'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100';
const labelClass = 'block text-sm font-semibold text-slate-700';

export const PublicAdmissionsPage: React.FC<{ schoolCode: string; onBack: () => void }> = ({ schoolCode, onBack }) => {
  const [options, setOptions] = useState<AdmissionsOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [applicationNumber, setApplicationNumber] = useState('');

  const loadOptions = async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/public/admissions/options?schoolCode=${encodeURIComponent(schoolCode)}`, { credentials: 'same-origin', cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The application form could not be loaded.');
      setOptions(result as AdmissionsOptions);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The application form could not be loaded.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void loadOptions(); }, [schoolCode]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget; const values = new FormData(form);
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/public/admissions/apply', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolCode, firstName: values.get('firstName'), middleName: values.get('middleName'), lastName: values.get('lastName'),
          dateOfBirth: values.get('dateOfBirth'), sex: values.get('sex'), requestedLevelId: values.get('requestedLevelId'), requestedClassGroupId: values.get('requestedClassGroupId'),
          guardianFirstName: values.get('guardianFirstName'), guardianLastName: values.get('guardianLastName'), relationship: values.get('relationship'),
          email: values.get('email'), phone: values.get('phone'), notes: values.get('notes'), consent: values.get('consent') === 'on', website: values.get('website'),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'The application could not be submitted.');
      if (result.applicationNumber) setApplicationNumber(result.applicationNumber);
      else setApplicationNumber('RECEIVED');
      form.reset();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The application could not be submitted.'); }
    finally { setBusy(false); }
  };

  return <div className="min-h-[calc(100vh-5rem)] bg-slate-50 px-4 py-8 sm:px-6 lg:py-12">
    <div className="mx-auto max-w-4xl">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-blue-800 hover:text-blue-950"><ArrowLeft className="h-4 w-4"/> Back to school home</button>
      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="bg-[#071b33] px-6 py-7 text-white sm:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-200">Online admissions</p>
          <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">Start an application{options?.schoolName ? ` · ${options.schoolName}` : ''}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Share the applicant’s details and one guardian contact method. The school will review the application and follow up about supporting documents and next steps.</p>
        </header>
        {applicationNumber ? <div role="status" className="m-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5 sm:m-8"><h2 className="text-lg font-extrabold text-emerald-950">Application received</h2><p className="mt-2 text-sm text-emerald-900">Keep this reference number and share it with the school if you contact the admissions office:</p><p className="mt-3 inline-block rounded-lg bg-white px-4 py-2 font-mono text-lg font-bold text-emerald-950">{applicationNumber}</p><p className="mt-3 text-sm text-emerald-900">The admissions team will review the information and contact the guardian using the details provided.</p><button type="button" onClick={() => setApplicationNumber('')} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-900">Submit another application <ArrowRight className="h-4 w-4"/></button></div> : loading ? <div className="grid min-h-56 place-items-center text-sm text-slate-600"><LoaderCircle className="mb-2 h-5 w-5 animate-spin"/>Loading application form…</div> : error && !options ? <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800 sm:m-8"><p role="alert">{error}</p><button onClick={() => void loadOptions()} className="mt-3 rounded-lg border border-red-300 px-3 py-2 font-semibold">Try again</button></div> : <form onSubmit={submit} className="space-y-7 p-6 sm:p-8">
          {error&&<p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          <section><h2 className="font-bold text-slate-950">Applicant information</h2><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className={labelClass}>First name<input required name="firstName" autoComplete="given-name" maxLength={120} className={fieldClass}/></label>
            <label className={labelClass}>Middle name (optional)<input name="middleName" maxLength={120} className={fieldClass}/></label>
            <label className={labelClass}>Last name<input required name="lastName" autoComplete="family-name" maxLength={120} className={fieldClass}/></label>
            <label className={labelClass}>Date of birth<input type="date" name="dateOfBirth" max={new Date().toISOString().slice(0,10)} className={fieldClass}/></label>
            <label className={labelClass}>Sex<select name="sex" defaultValue="" className={fieldClass}><option value="">Not provided</option><option value="F">Female</option><option value="M">Male</option><option value="X">Another / self-described</option><option value="UNDISCLOSED">Prefer not to say</option></select></label>
            <label className={labelClass}>Education level<select name="requestedLevelId" defaultValue="" className={fieldClass}><option value="">Choose later with the school</option>{(options?.levels||[]).map(level=><option key={level.id} value={level.id}>{level.name}</option>)}</select></label>
            <label className={`${labelClass} sm:col-span-2 lg:col-span-3`}>Requested class (optional)<select name="requestedClassGroupId" defaultValue="" className={fieldClass}><option value="">School can confirm placement</option>{(options?.classes||[]).map(group=><option key={group.id} value={group.id}>{group.name}{group.grade_level?` · ${group.grade_level}`:''}</option>)}</select></label>
          </div></section>
          <section><h2 className="font-bold text-slate-950">Parent or guardian</h2><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className={labelClass}>First name<input required name="guardianFirstName" maxLength={120} autoComplete="given-name" className={fieldClass}/></label>
            <label className={labelClass}>Last name<input required name="guardianLastName" maxLength={120} autoComplete="family-name" className={fieldClass}/></label>
            <label className={labelClass}>Relationship to applicant<input required name="relationship" maxLength={50} placeholder="Parent, aunt, guardian…" className={fieldClass}/></label>
            <label className={labelClass}>Email address<input name="email" type="email" maxLength={254} autoComplete="email" className={fieldClass}/></label>
            <label className={labelClass}>Phone number<input name="phone" type="tel" inputMode="tel" maxLength={40} autoComplete="tel" placeholder="Liberia or international number" className={fieldClass}/></label>
            <p className="self-end pb-2 text-xs font-normal text-slate-500">Enter an email address, phone number, or both so the school can follow up.</p>
          </div></section>
          <section><label className={labelClass}>Additional information (optional)<textarea name="notes" maxLength={1000} rows={3} className={fieldClass} placeholder="Anything the admissions team should know"/></label></section>
          <label className="hidden" aria-hidden="true">Leave this field empty<input name="website" tabIndex={-1} autoComplete="off"/></label>
          <label className="flex items-start gap-3 rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-700"><input required name="consent" type="checkbox" className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"/><span>I confirm that I am the applicant’s parent/guardian or have permission to submit these details, and I consent to the school contacting me about this application.</span></label>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5"><p className="max-w-xl text-xs leading-5 text-slate-500">Do not enter passwords or sensitive financial details. Supporting documents are requested securely by the admissions team after review.</p><button disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-5 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60">{busy?'Submitting…':'Submit application'} <ArrowRight className="h-4 w-4"/></button></div>
        </form>}
      </div>
    </div>
  </div>;
};
