import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Square, Volume2 } from 'lucide-react';
import { guideLessons } from './guideLessons';
import { AssignmentGuideDemo, assignmentDemoSteps } from './AssignmentGuideDemo';
import { StudentGuideDemo, studentGuideSteps } from './StudentGuideDemo';
import { RoleGuideDemo } from './RoleGuideDemo';
import { roleGuideDemos } from './roleGuideDemos';
import './userGuide.css';

type Workspace = { id: string; label: string };
const controlClass = 'inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-40';

export function UserGuide({ workspaces, permissions, roles = [], onOpen }: {
  workspaces: Workspace[];
  permissions: string[];
  roles?: string[];
  onOpen: (id: string) => void;
}) {
  const [selected, setSelected] = useState('overview');
  const [step, setStep] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [take, setTake] = useState(0);
  const [tour, setTour] = useState(false);
  const [playbackRun, setPlaybackRun] = useState(0);
  const narration = useRef<SpeechSynthesisUtterance | null>(null);
  const lessonPanel = useRef<HTMLElement>(null);
  const topics = workspaces.filter(workspace => guideLessons[workspace.id]);
  const topic = topics.find(workspace => workspace.id === selected) ?? topics[0];
  const [title] = guideLessons[topic.id];
  const studentLesson = workspaces.some(workspace => workspace.id === 'student-classes') && studentGuideSteps[topic.id];
  const roleDemo = roleGuideDemos(permissions, workspaces.some(workspace => workspace.id === 'parent-children'),roles)[topic.id];
  const steps: readonly (readonly [string, string])[] = topic.id === 'student-assignments' ? assignmentDemoSteps : studentLesson || [
    [topic.label, `Click ${topic.label} in the sidebar to open the workspace.`],
    ...roleDemo.actions.map(action => [action.target, action.narration] as const),
  ];
  const script = steps[step]?.[1] ?? 'Open the workspace to see the tools available to your account.';
  const stepCount = Math.max(steps.length, 1);
  const lessonIndex = topics.findIndex(item => item.id === topic.id);
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

  function startLesson(id: string) {
    stopVoice();
    setAudioError(false);
    setStep(0);
    setSelected(id);
    setTour(voiceAvailable);
    setPlaybackRun(run => run + 1);
    lessonPanel.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
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
    if (tour) {
      lessonPanel.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
      playVoice(0);
    }
  }, [tour, selected, playbackRun]);

  return <section className="space-y-5" aria-label="User guide">
    <div className="rounded-2xl bg-slate-950 p-6 text-white">
      <p className="flex items-center gap-2 text-sm font-semibold text-blue-200"><BookOpen className="h-4 w-4" aria-hidden="true"/> Redeemer learning center</p>
      <h2 className="mt-2 text-2xl font-extrabold">Learn your workspace</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200">Choose a lesson from your menu and follow the highlighted clicks. These practice screens use examples and never save school records.</p>
      {voiceAvailable && <button type="button" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-bold text-blue-950 hover:bg-blue-50" onClick={() => {
        if (tour) { stopVoice(); setTour(false); return; }
        startLesson(topics[0].id);
      }}>{tour ? <><Square className="h-4 w-4" aria-hidden="true"/> Stop guided tour</> : <><Volume2 className="h-4 w-4" aria-hidden="true"/> Start guided tour</>}</button>}
      <p className="mt-2 text-sm text-blue-200">{tour ? `Lesson ${topics.findIndex(item => item.id === topic.id) + 1} of ${topics.length} · ${topic.label} · Next lessons open automatically` : 'The guided tour opens and narrates every lesson in sequence. You can also choose a lesson below.'}</p>
    </div>
    <div className="grid gap-5 xl:grid-cols-[16rem_minmax(0,1fr)]">
      <nav aria-label="Guide topics" className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="mb-2 font-bold">Your lessons</h3>
        <div className="grid gap-1 sm:grid-cols-2 xl:grid-cols-1">
          {topics.map(item => <button type="button" key={item.id} aria-current={item.id === topic.id ? 'true' : undefined}
            className={`rounded-lg px-3 py-2 text-left text-sm font-semibold ${item.id === topic.id ? 'bg-blue-100 text-blue-900' : 'text-slate-700 hover:bg-slate-100'}`}
            onClick={() => startLesson(item.id)}>{item.label}</button>)}
        </div>
      </nav>
      <article ref={lessonPanel} className="min-w-0 scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-extrabold text-slate-950">{title}</h3>
          <p className="text-sm font-semibold text-slate-600">Step {step + 1} of {stepCount}</p>
        </div>
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
            <span className="text-sm font-bold text-slate-900">{topic.label}</span>
            <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-bold text-blue-900">Practice screen</span>
          </div>
          {topic.id === 'student-assignments' ? <AssignmentGuideDemo step={step} take={take} /> : studentLesson ? <StudentGuideDemo key={topic.id} topic={topic.id} label={topic.label} step={step} take={take} /> : <RoleGuideDemo key={topic.id} demo={roleDemo} label={topic.label} step={step} take={take} />}
        </div>
        <p aria-live="polite" className="mt-4 min-h-12 text-sm leading-6 text-slate-700">{script}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={controlClass} disabled={lessonIndex === 0} onClick={() => startLesson(topics[lessonIndex - 1].id)}><ArrowLeft className="h-4 w-4" aria-hidden="true"/> Previous lesson</button>
          <button type="button" className={controlClass} disabled={lessonIndex + 1 >= topics.length} onClick={() => startLesson(topics[lessonIndex + 1].id)}>Next lesson <ArrowRight className="h-4 w-4" aria-hidden="true"/></button>
          {voiceAvailable && <button type="button" className={controlClass} onClick={() => {
            if (speaking) { stopVoice(); setTour(false); }
            else startLesson(topic.id);
          }}>
            {speaking ? <><Square className="h-4 w-4" aria-hidden="true"/> Stop guided tour</> : <><Volume2 className="h-4 w-4" aria-hidden="true"/> Play guided tour from here</>}
          </button>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Demonstration step controls">
          <button type="button" className={controlClass} disabled={step === 0} onClick={() => showStep(step - 1)}>Previous step</button>
          <button type="button" className={controlClass} disabled={step + 1 >= stepCount} onClick={() => showStep(step + 1)}>Next step</button>
        </div>
        {(!voiceAvailable || audioError) && <p role="status" className="mt-2 text-sm text-slate-600">Narration is unavailable on this device. The full step is written above.</p>}
        <button type="button" className="mt-5 text-sm font-bold text-blue-800 underline" onClick={() => onOpen(topic.id)}>Open {topic.label}</button>
      </article>
    </div>
  </section>;
}
