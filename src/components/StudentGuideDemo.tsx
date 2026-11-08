import {INSTITUTION,SCHOOL_PORTAL_NAME} from '../data/institution.ts';
import { MousePointer2 } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';

export const studentGuideSteps: Record<string, readonly (readonly [string, string])[]> = {
  overview: [
    ['Overview', 'Click Overview to open your learning dashboard.'],
    ['Learner', 'Check the learner name and class on the dashboard. This example uses a fictional learner.'],
    ['Published grades', 'The dashboard shows how many published grades are available. Open Grades from your sidebar to read them.'],
  ],
  'student-classes': [
    ['My classes', 'Click My classes in the sidebar. The subjects and class timetable will open.'],
    ['Subjects', 'Read the Subjects panel. This example shows Mathematics, with three hundred minutes and five lessons each week.'],
    ['Class timetable', 'Now read the Class timetable. Check the day, lesson time, subject and room. These example lessons show where to find each detail.'],
  ],
  'student-grades': [
    ['Grades', 'Click Grades to open your published results.'],
    ['Published grades', 'Read the subject, assessment and mark in the results table. This example shows eight out of ten in Mathematics.'],
    ['Feedback', 'Read the teacher feedback beside the mark. Contact your school if you have a question about a published result.'],
  ],
  'student-attendance': [
    ['Attendance', 'Click Attendance to display your recorded lessons.'],
    ['Attendance records', 'Read the lesson date, subject and status. This example lesson is marked Present.'],
  ],
  'student-materials': [
    ['Learning materials', 'Click Learning materials to see resources published for your class.'],
    ['Open linked material', 'Click Open linked material on the practice Mathematics resource.'],
    ['Resource preview', 'The example resource is now open. In your real portal, the school resource opens at its published link.'],
  ],
  'student-notices': [
    ['School notices', 'Click School notices to display school announcements.'],
    ['Notice', 'Read the notice title, date and full message. This practice notice announces a fictional library activity.'],
    ['Mark as read', 'Click Mark as read to clear this example notification.'],
  ],
  'student-fees': [
    ['Fees & balance', 'Click Fees and balance to display invoices and receipts available to your account.'],
    ['Invoices', 'Check the invoice number, currency and balance. This fictional invoice has a balance of twenty five US dollars.'],
    ['Mobile Money', 'Check the payment availability notice. MTN Mobile Money is currently awaiting activation.'],
  ],
  'student-id': [
    ['My Digital ID', 'Click My Digital ID to open your school identification workspace.'],
    ['Digital Student ID', 'Review the example learner name, school ID and issue status. The school must issue your real Digital ID before you use it.'],
  ],
  'student-messages': [
    ['Messages', 'Click Messages to open the teacher conversation workspace.'],
    ['Teacher', 'Choose the assigned Mathematics teacher from the Teacher list.'],
    ['Message', 'Enter a subject and your question. This fictional message asks for help with homework.'],
    ['Send message', 'Click Send message. The example conversation now contains your message.'],
  ],
  'student-alerts': [
    ['Alerts', 'Click Alerts to display assignment updates and school notifications.'],
    ['Alert', 'Read this example assignment feedback alert.'],
    ['Mark read', 'Click Mark read to mark the example alert as read.'],
  ],
};

export function StudentGuideDemo({ topic, label, step, take }: { topic: string; label: string; step: number; take: number }) {
  const scene = useRef<HTMLDivElement>(null);
  const [completed, setCompleted] = useState('');
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const action = `${topic}-${step}-${take}`;
  const acted = completed === action;
  const open = step > 0 || acted;
  const detail = (step >= 2 && acted) || step > 2;
  const resourceOpen = step > 1 || (step === 1 && acted);
  const target = studentGuideSteps[topic][step][0];

  useLayoutEffect(() => {
    const frame = scene.current;
    const control = frame?.querySelector('[data-demo-target]');
    if (!frame || !control) return;
    const move = () => {
      const bounds = frame.getBoundingClientRect();
      const destination = control.getBoundingClientRect();
      setPosition({ x: destination.left - bounds.left + Math.min(destination.width / 2, 100), y: destination.top - bounds.top + Math.min(destination.height / 2, 28) });
    };
    move();
    const resize = new ResizeObserver(move);
    resize.observe(frame);
    const timer = window.setTimeout(() => { resize.disconnect(); setCompleted(action); }, 800);
    return () => { window.clearTimeout(timer); resize.disconnect(); };
  }, [action]);

  const point = (name: string) => target === name ? true : undefined;
  const panel = 'rounded-xl border border-slate-200 bg-white p-4';
  const button = 'rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white';
  return <div ref={scene} className="relative grid min-h-80 gap-3 bg-slate-50 p-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:p-4">
    <span aria-hidden="true" className="pointer-events-none absolute left-0 top-0 z-10 motion-safe:transition-transform motion-safe:duration-700" style={{ transform: `translate(${position.x}px, ${position.y}px)` }}>
      {acted && <span key={action} className="guide-demo-click absolute -left-2 -top-2 h-6 w-6 rounded-full border-2 border-blue-600"/>}
      <MousePointer2 className="relative h-6 w-6 fill-blue-700 text-white drop-shadow"/>
    </span>
    <div className={panel}>
      <p className="text-xs font-bold text-blue-800">{SCHOOL_PORTAL_NAME}</p>
      <p className="mb-4 text-xs text-slate-500">Student · Example</p>
      <div data-demo-target={step === 0 ? true : undefined} className={`rounded-lg px-2 py-3 text-sm font-bold ${open ? 'bg-blue-100 text-blue-950' : 'text-slate-700'}`}>{label}</div>
    </div>
    <div className="min-w-0 space-y-3">
      <header className={panel}><p className="text-xs font-semibold text-blue-800">STUDENT & FAMILY PORTAL · PRACTICE</p><h4 className="mt-1 text-lg font-extrabold">{open ? label : 'Your learning dashboard'}</h4><p className="text-xs text-slate-600">Example Learner · PRACTICE-001</p></header>
      {!open ? <div className={panel}>Choose a workspace from the sidebar.</div> : <>
        {topic === 'overview' && <>
          <div data-demo-target={point('Learner')} className={panel}><p className="text-xs text-slate-500">Learner</p><b>Example Learner</b><p className="text-sm">Grade 4 · PRACTICE-001</p></div>
          <div data-demo-target={point('Published grades')} className={panel}><p>Published grades</p><b className="text-2xl">1</b></div>
        </>}
        {topic === 'student-classes' && <>
          <div data-demo-target={point('Subjects')} className={panel}><h5 className="font-bold">Subjects</h5><p className="mt-3 text-sm"><b>Mathematics</b> · 300 minutes / 5 lessons weekly</p><p className="mt-2 text-sm"><b>English</b> · 240 minutes / 4 lessons weekly</p></div>
          <div data-demo-target={point('Class timetable')} className={panel}><h5 className="font-bold">Class timetable</h5><div className="mt-3 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>Day</th><th>Time</th><th>Subject</th><th>Room</th></tr></thead><tbody><tr><td className="pt-3">Monday</td><td className="pt-3">08:00</td><td className="pt-3">Mathematics</td><td className="pt-3">Room 4</td></tr><tr><td className="pt-3">Tuesday</td><td className="pt-3">09:00</td><td className="pt-3">English</td><td className="pt-3">Room 4</td></tr></tbody></table></div></div>
        </>}
        {topic === 'student-grades' && <div data-demo-target={point('Published grades')} className={panel}><h5 className="font-bold">Published grades</h5><p className="mt-3 text-sm">Mathematics · Practice assignment</p><b className="text-xl">8 / 10</b><p data-demo-target={point('Feedback')} className="mt-3 rounded-lg bg-blue-50 p-3 text-sm"><b>Feedback</b><br/>Your revised answer explains your method clearly.</p></div>}
        {topic === 'student-attendance' && <div data-demo-target={point('Attendance records')} className={panel}><h5 className="font-bold">Attendance records</h5><p className="mt-3 text-sm">Monday · Mathematics · 08:00</p><p className="mt-2 font-bold text-emerald-800">Present</p></div>}
        {topic === 'student-materials' && <div className={panel}><h5 className="font-bold">{resourceOpen ? 'Resource preview' : 'Learning materials'}</h5>{resourceOpen ? <div data-demo-target={point('Resource preview')} className="mt-3 rounded-lg bg-blue-50 p-4"><b>Adding whole numbers</b><p className="mt-3">7 + 3 = 10</p><p>10 + 2 = 12</p><p className="mt-2 text-xs">Fictional school resource</p></div> : <><p className="my-3 text-sm">Mathematics · Adding whole numbers</p><button type="button" data-demo-target={point('Open linked material')} className={button}>Open linked material</button></>}</div>}
        {topic === 'student-notices' && <div data-demo-target={point('Notice')} className={panel}><h5 className="font-bold">Practice library activity</h5><p className="mt-2 text-xs">Example notice · Monday</p><p className="my-3 text-sm">Bring your favourite story to the fictional class reading activity.</p>{detail ? <b className="text-sm text-emerald-800">Read</b> : <button type="button" data-demo-target={point('Mark as read')} className={button}>Mark as read</button>}</div>}
        {topic === 'student-fees' && <>
          <div data-demo-target={point('Invoices')} className={panel}><h5 className="font-bold">Invoices</h5><p className="mt-3 text-sm">PRACTICE-INV-001 · USD</p><p className="mt-2">Balance <b>25.00</b></p></div>
          <div data-demo-target={point('Mobile Money')} className={panel}><h5 className="font-bold">Pay tuition or arrears with Mobile Money</h5><p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm">Online collection is not active yet.</p><button type="button" disabled className="mt-3 rounded-lg bg-slate-200 p-2 text-sm">Pay with MTN MoMo — activation pending</button></div>
        </>}
        {topic === 'student-id' && <div data-demo-target={point('Digital Student ID')} className={panel}><h5 className="font-bold">Digital Student ID</h5><div className="mt-3 rounded-lg border border-blue-200 p-4"><b>Example Learner</b><p className="mt-2">PRACTICE-001 · Grade 4</p><p className="mt-3 font-bold text-amber-900">NOT ISSUED</p><p className="mt-2 text-xs">Contact the school office for ID assistance.</p></div></div>}
        {topic === 'student-messages' && <div className={panel}><h5 className="font-bold">{step === 3 && acted ? 'Your conversations' : 'Message your teacher'}</h5>{step === 3 && acted ? <div className="mt-3 rounded-lg bg-emerald-50 p-3"><b>Message sent to your teacher.</b><p className="mt-2 text-sm">Homework question · Example Mathematics Teacher</p><p className="mt-2 text-sm">Please explain question two.</p></div> : <>
          <label className="mt-3 block text-xs font-bold">Teacher<select data-demo-target={point('Teacher')} value={step >= 2 || (step === 1 && acted) ? 'teacher' : ''} onChange={()=>{}} className="mt-1 block w-full rounded-lg border p-2 text-sm"><option value="">Choose a current teacher</option><option value="teacher">Example Mathematics Teacher</option></select></label>
          <div data-demo-target={point('Message')} className="mt-3"><p className="text-xs font-bold">Subject</p><input readOnly value={step >= 3 || (step === 2 && acted) ? 'Homework question' : ''} className="mt-1 w-full rounded-lg border p-2 text-sm"/><p className="mt-2 text-xs font-bold">Message</p><textarea readOnly value={step >= 3 || (step === 2 && acted) ? 'Please explain question two.' : ''} className="mt-1 w-full rounded-lg border p-2 text-sm"/></div>
          <button type="button" data-demo-target={point('Send message')} className={button+' mt-3'}>Send message</button>
        </>}</div>}
        {topic === 'student-alerts' && <div data-demo-target={point('Alert')} className={panel}><h5 className="font-bold">Assignment feedback is ready</h5><p className="my-3 text-sm">Your teacher returned practice work for revision.</p>{detail ? <b className="text-sm text-emerald-800">Read</b> : <button type="button" data-demo-target={point('Mark read')} className={button}>Mark read</button>}</div>}
      </>}
    </div>
  </div>;
}
