import { BookOpenCheck, Check, FileUp, LayoutDashboard, MousePointer2 } from 'lucide-react';
import { useEffect, useState } from 'react';

export const assignmentDemoSteps = [
  ['Assignments', 'Click Assignments in the sidebar to open work from your classes.'],
  ['Your answer', 'Click the Your answer box and type your response. In this example, seven plus five equals twelve.'],
  ['Submit assignment', 'Click Submit assignment to send your answer to your teacher.'],
  ['Submitted', 'Check the Submitted badge and the confirmation that your work was sent.'],
  ['Returned', 'If your teacher returns the work, read the feedback before editing your answer.'],
  ['Your answer', 'Click Your answer and revise your work. Here, we add a line showing how we reached twelve.'],
  ['Resubmit assignment', 'Click Resubmit assignment. Check that the assignment returns to Submitted.'],
] as const;

const answer = '7 + 5 = 12.';
const working = ' 7 + 3 = 10, then 10 + 2 = 12.';
const pointer = <span className="guide-cursor pointer-events-none absolute right-3 top-2 z-10" aria-hidden="true">
  <MousePointer2 className="relative h-5 w-5 fill-blue-700 text-blue-950"/>
</span>;

export function AssignmentGuideDemo({ step }: { step: number }) {
  const [acted, setActed] = useState(false);
  const [typed, setTyped] = useState(0);
  const textToType = step === 5 ? working : answer;

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const click = window.setTimeout(() => setActed(true), reducedMotion ? 0 : 430);
    return () => window.clearTimeout(click);
  }, []);

  useEffect(() => {
    if ((step !== 1 && step !== 5) || !acted || typed >= textToType.length) return;
    const character = window.setTimeout(() => setTyped(typed + 1), 55);
    return () => window.clearTimeout(character);
  }, [step, acted, typed, textToType]);

  const assignmentsOpen = step > 0 || acted;
  const submitted = step === 3 || ((step === 2 || step === 6) && acted);
  const returned = step >= 4 && !submitted;
  const editing = step === 1 || step === 5;
  const displayedAnswer = step === 1 ? answer.slice(0, typed) : step === 5 ? answer + working.slice(0, typed) : step === 6 ? answer + working : step > 1 ? answer : '';

  return <div className="grid min-h-72 gap-3 p-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:p-4">
    <div className="flex gap-2 rounded-xl border border-slate-200 bg-white p-2 sm:block sm:space-y-2">
      <div className="flex items-center gap-2 rounded-lg p-2 text-xs font-semibold text-slate-600">
        <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden="true"/> Overview
      </div>
      <div className={`relative flex items-center gap-2 rounded-lg p-2 pr-8 text-xs font-bold ${assignmentsOpen ? 'bg-blue-100 text-blue-950' : 'text-slate-700'}`}>
        <BookOpenCheck className="h-4 w-4 shrink-0" aria-hidden="true"/> Assignments
        {step === 0 && pointer}
      </div>
    </div>
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
      <h4 className="text-base font-extrabold text-slate-950">{assignmentsOpen ? 'Assignments from your classes' : 'Your learning dashboard'}</h4>
      {assignmentsOpen ? <>
        {submitted && <p className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          <Check className="h-4 w-4 shrink-0" aria-hidden="true"/> Your work was submitted to your teacher.
        </p>}
        <div className="mt-3 rounded-xl border border-slate-200 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><p className="text-sm font-bold">Practice assignment</p><p className="text-xs text-slate-600">Mathematics · No deadline</p></div>
            <span className={`relative rounded-full px-3 py-1 text-xs font-bold ${submitted ? 'bg-emerald-100 text-emerald-950' : returned ? 'bg-amber-100 text-amber-950' : 'bg-slate-100 text-slate-700'} ${step === 3 ? 'ring-2 ring-emerald-500' : ''}`}>{submitted ? 'Submitted' : returned ? 'Returned' : 'Open'}{step === 3 && pointer}</span>
          </div>
          {returned && <p className="relative mt-3 rounded-lg bg-amber-50 p-3 pr-8 text-sm text-amber-950">Teacher feedback: Please show how you added 7 and 5.{step === 4 && pointer}</p>}
          {!submitted && <>
            <p className="mt-3 text-xs font-bold">Your answer</p>
            <div className={`relative mt-1 min-h-16 rounded-lg border p-2 pr-8 text-sm ${editing && acted ? 'border-blue-600 ring-2 ring-blue-100' : 'border-slate-300'}`}>
              {displayedAnswer || <span className="text-slate-500">Write your response</span>}
              {editing && pointer}
            </div>
            <div className="relative mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-700 py-2 pl-3 pr-9 text-xs font-bold text-white">
              <FileUp className="h-4 w-4" aria-hidden="true"/> {returned ? 'Resubmit assignment' : 'Submit assignment'}
              {(step === 2 || step === 6) && pointer}
            </div>
          </>}
        </div>
      </> : <p className="mt-2 text-sm text-slate-600">Open a workspace from the sidebar.</p>}
    </div>
  </div>;
}
