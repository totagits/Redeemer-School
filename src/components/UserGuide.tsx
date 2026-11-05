import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, MousePointer2, Square, Volume2 } from 'lucide-react';
import { guideLessons } from './guideLessons';
import { AssignmentGuideDemo, assignmentDemoSteps } from './AssignmentGuideDemo';
import { StudentGuideDemo, studentGuideSteps } from './StudentGuideDemo';
import './userGuide.css';

type Workspace = { id: string; label: string };
const controlClass = 'inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-40';

export function UserGuide({ workspaces, permissions, onOpen }: {
  workspaces: Workspace[];
  permissions: string[];
  onOpen: (id: string) => void;
}) {
  const [selected, setSelected] = useState('overview');
  const [step, setStep] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [take, setTake] = useState(0);
  const [tour, setTour] = useState(false);
  const narration = useRef<SpeechSynthesisUtterance | null>(null);
  const topics = workspaces.filter(workspace => guideLessons[workspace.id]);
  const topic = topics.find(workspace => workspace.id === selected) ?? topics[0];
  const [title, ...allSteps] = guideLessons[topic.id];
  const studentLesson = workspaces.some(workspace => workspace.id === 'student-classes') && studentGuideSteps[topic.id];
  const steps = topic.id === 'student-assignments' ? assignmentDemoSteps : studentLesson || (topic.id === 'teaching' ? allSteps.filter(([control]) => {
    if (control === 'Teacher class roll call') return permissions.includes('attendance.write');
    if (control === 'Approve marks awaiting review') return permissions.includes('grades.moderate');
    if (control === 'Publish approved marks') return permissions.includes('grades.publish');
    return permissions.includes('grades.enter');
  }) : allSteps);
  const [target, script] = steps[step] ?? ['Teaching & learning', 'Open Teaching and learning to see the class tools available to your account.'];
  const stepCount = Math.max(steps.length, 1);
  const voiceAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

  function stopVoice() {
    if (narration.current) {
      narration.current = null;
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }

  useEffect(() => () => {
    if (narration.current) {
      narration.current = null;
      window.speechSynthesis.cancel();
    }
  }, []);

  function showStep(index: number) {
    setTour(false);
    stopVoice();
    setAudioError(false);
    setStep(index);
  }

  function playVoice(index: number) {
    stopVoice();
    setAudioError(false);
    const utterance = new SpeechSynthesisUtterance(steps[index]?.[1] ?? script);
    utterance.lang = 'en';
    utterance.rate = 0.95;
    narration.current = utterance;
    const finish = (failed: boolean) => {
      if (narration.current !== utterance) return;
      narration.current = null;
      setSpeaking(false);
      setAudioError(failed);
      if (failed) setTour(false);
    };
    utterance.onend = () => {
      if (narration.current !== utterance) return;
      if (index + 1 < stepCount) {
        narration.current = null;
        playVoice(index + 1);
      }
      else if (tour) {
        const nextTopic = topics[topics.findIndex(item => item.id === topic.id) + 1];
        narration.current = null;
        if (nextTopic) {
          setStep(0);
          setSelected(nextTopic.id);
        } else {
          setSpeaking(false);
          setTour(false);
        }
      } else finish(false);
    };
    utterance.onstart = () => {
      if (narration.current !== utterance) return;
      setStep(index);
      setTake(value => value + 1);
    };
    utterance.onerror = () => finish(true);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }

  useEffect(() => {
    if (tour) playVoice(0);
  }, [tour, selected]);

  return <section className="space-y-5" aria-label="User guide">
    <div className="rounded-2xl bg-slate-950 p-6 text-white">
      <p className="flex items-center gap-2 text-sm font-semibold text-blue-200"><BookOpen className="h-4 w-4" aria-hidden="true"/> Redeemer learning center</p>
      <h2 className="mt-2 text-2xl font-extrabold">Learn your workspace</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200">Choose a lesson from your menu and follow the highlighted clicks. These practice screens use examples and never save school records.</p>
      {voiceAvailable && <button type="button" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-bold text-blue-950 hover:bg-blue-50" onClick={() => {
        stopVoice();
        if (tour) { setTour(false); return; }
        setSelected(topics[0].id);
        setStep(0);
        setTour(true);
      }}>{tour ? <><Square className="h-4 w-4" aria-hidden="true"/> Stop guided tour</> : <><Volume2 className="h-4 w-4" aria-hidden="true"/> Start guided tour</>}</button>}
      <p className="mt-2 text-sm text-blue-200">{tour ? `Lesson ${topics.findIndex(item => item.id === topic.id) + 1} of ${topics.length} · ${topic.label} · Next lessons open automatically` : 'The guided tour opens and narrates every lesson in sequence. You can also choose a lesson below.'}</p>
    </div>
    <div className="grid gap-5 xl:grid-cols-[16rem_minmax(0,1fr)]">
      <nav aria-label="Guide topics" className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="mb-2 font-bold">Your lessons</h3>
        <div className="grid gap-1 sm:grid-cols-2 xl:grid-cols-1">
          {topics.map(item => <button type="button" key={item.id} aria-current={item.id === topic.id ? 'true' : undefined}
            className={`rounded-lg px-3 py-2 text-left text-sm font-semibold ${item.id === topic.id ? 'bg-blue-100 text-blue-900' : 'text-slate-700 hover:bg-slate-100'}`}
            onClick={() => { showStep(0); setSelected(item.id); }}>{item.label}</button>)}
        </div>
      </nav>
      <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-extrabold text-slate-950">{title}</h3>
          <p className="text-sm font-semibold text-slate-600">Step {step + 1} of {stepCount}</p>
        </div>
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
            <span className="text-sm font-bold text-slate-900">{topic.label}</span>
            <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-bold text-blue-900">Practice screen</span>
          </div>
          {topic.id === 'student-assignments' ? <AssignmentGuideDemo step={step} take={take} /> : studentLesson ? <StudentGuideDemo key={topic.id} topic={topic.id} label={topic.label} step={step} take={take} /> : <div className="p-4 sm:p-6">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-600">Click demonstration</p>
            <div className="grid gap-2">
              {(steps.length ? steps.map(([label]) => label) : [target]).map((label, index) =>
                <div key={label} className={`relative flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 pr-12 text-sm font-semibold ${step === index ? 'border-blue-500 bg-blue-100 text-blue-950' : 'border-slate-200 bg-white text-slate-600'}`}>
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-xs">{index + 1}</span>
                  {label}
                  {step === index && <span key={`${topic.id}-${step}-${take}`} className="guide-cursor absolute right-4 top-3" aria-hidden="true"><MousePointer2 className="relative h-5 w-5 fill-blue-700 text-blue-950"/></span>}
                </div>)}
            </div>
          </div>}
        </div>
        <p aria-live="polite" className="mt-4 min-h-12 text-sm leading-6 text-slate-700">{script}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={controlClass} disabled={step === 0} onClick={() => showStep(step - 1)}><ArrowLeft className="h-4 w-4" aria-hidden="true"/> Previous</button>
          <button type="button" className={controlClass} disabled={step + 1 >= stepCount} onClick={() => showStep(step + 1)}>Next <ArrowRight className="h-4 w-4" aria-hidden="true"/></button>
          {voiceAvailable && <button type="button" className={controlClass} onClick={() => { setTour(false); if (speaking) stopVoice(); else playVoice(0); }}>
            {speaking ? <><Square className="h-4 w-4" aria-hidden="true"/> Stop narration</> : <><Volume2 className="h-4 w-4" aria-hidden="true"/> Play narrated lesson</>}
          </button>}
        </div>
        {(!voiceAvailable || audioError) && <p role="status" className="mt-2 text-sm text-slate-600">Narration is unavailable on this device. The full step is written above.</p>}
        <button type="button" className="mt-5 text-sm font-bold text-blue-800 underline" onClick={() => onOpen(topic.id)}>Open {topic.label}</button>
      </article>
    </div>
  </section>;
}
