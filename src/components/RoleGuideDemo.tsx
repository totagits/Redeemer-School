import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MousePointer2, CheckCircle2 } from 'lucide-react';
import type { DemoScreen, WorkspaceDemo } from './roleGuideDemos';

export function RoleGuideDemo({ demo, label, step, take }: {
  demo: WorkspaceDemo;
  label: string;
  step: number;
  take: number;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [completed, setCompleted] = useState('');
  const [typed, setTyped] = useState(0);
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const actionId = `${step}-${take}`;
  const acted = completed === actionId;
  const action = step > 0 ? demo.actions[step - 1] : undefined;
  let before: DemoScreen = demo.screen;
  for (const previous of demo.actions.slice(0, Math.max(0, step - 1))) {
    if (previous.screen) before = previous.screen;
    if (previous.value !== undefined) before = {
      ...before,
      controls: before.controls.map(control => control.label === previous.target ? { ...control, value: previous.value } : control),
    };
  }
  const scene = acted && action?.screen ? action.screen : before;
  const open = step > 0 || acted;
  const control = before.controls.find(item => item.label === action?.target);
  const typing = control?.kind === 'text' && action?.value !== undefined;
  const value = action?.value;
  const target = step === 0 ? label : action?.target;

  useLayoutEffect(() => {
    const container = frame.current;
    const destination = container?.querySelector('[data-demo-target]');
    if (!container || !destination) return;
    const move = () => {
      const area = container.getBoundingClientRect();
      const rect = destination.getBoundingClientRect();
      setPosition({ x: rect.left - area.left + Math.min(rect.width / 2, 100), y: rect.top - area.top + Math.min(rect.height / 2, 30) });
    };
    move();
    const resize = new ResizeObserver(move);
    resize.observe(container);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => { resize.disconnect(); setCompleted(actionId); }, reduced ? 0 : 800);
    return () => { window.clearTimeout(timer); resize.disconnect(); };
  }, [actionId]);

  useEffect(() => setTyped(0), [actionId]);
  useEffect(() => {
    if (!acted || !typing || value === undefined || typed >= value.length) return;
    const timer = window.setTimeout(() => setTyped(typed + 1), 35);
    return () => window.clearTimeout(timer);
  }, [acted, typing, typed, value]);

  return <div ref={frame} className="relative grid min-h-80 gap-3 bg-slate-50 p-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:p-4">
    <span aria-hidden="true" className="pointer-events-none absolute left-0 top-0 z-10 motion-safe:transition-transform motion-safe:duration-700" style={{ transform: `translate(${position.x}px, ${position.y}px)` }}>
      {acted && <span key={actionId} className="guide-demo-click absolute -left-2 -top-2 h-6 w-6 rounded-full border-2 border-blue-600"/>}
      <MousePointer2 className="relative h-6 w-6 fill-blue-700 text-white drop-shadow"/>
    </span>
    <aside className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs font-bold text-blue-800">REDEEMER ERP</p>
      <p className="mb-4 text-xs text-slate-500">Example workspace</p>
      <div data-demo-target={step === 0 ? true : undefined} className={`rounded-lg p-2 text-sm font-bold ${open ? 'bg-blue-100 text-blue-950' : 'text-slate-600'}`}>{label}</div>
    </aside>
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold text-blue-800">FICTIONAL PRACTICE DATA</p>
      <h4 className="mt-1 text-lg font-extrabold">{open ? scene.title : 'Overview'}</h4>
      {open ? <div className="mt-4 space-y-3">
        {scene.notice && <p className="flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true"/>{scene.notice}</p>}
        {scene.controls.map(item => {
          const focused = item.label === target;
          const shown = acted && focused && value !== undefined ? typing ? value.slice(0, typed) : value : item.value || '';
          const focusClass = focused && acted ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-300';
          return <div key={item.label} data-demo-target={focused ? true : undefined}>
            {item.kind === 'read' ? <div className={`rounded-lg border p-3 ${focused && acted ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}><p className="text-sm font-bold">{item.label}</p><p className="mt-1 text-sm leading-6 text-slate-700">{shown}</p></div> :
            item.kind === 'button' ? <button type="button" tabIndex={-1} onClick={() => setCompleted(actionId)} className={`rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white ${focused && acted ? 'ring-2 ring-blue-300 ring-offset-2' : ''}`}>{item.label}</button> :
            <label className="block text-sm font-semibold">{item.label}
              {item.kind === 'select' ? <select tabIndex={-1} value={shown} onChange={() => {}} className={`mt-1 w-full rounded-lg border bg-white p-2 text-sm ${focusClass}`}><option value="">Choose {item.label.toLowerCase()}</option>{item.options?.map(option => <option key={option} value={option}>{option}</option>)}</select> :
              item.kind === 'file' ? <div className={`mt-1 rounded-lg border p-3 text-sm font-normal ${focusClass}`}>{shown || 'Choose file · No file chosen'}</div> :
              <input tabIndex={-1} readOnly value={shown} className={`mt-1 w-full rounded-lg border p-2 text-sm font-normal ${focusClass}`}/>}
            </label>}
          </div>;
        })}
        {scene.table && <div className="overflow-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr>{scene.table.headings.map(heading => <th key={heading} className="p-2">{heading}</th>)}</tr></thead><tbody>{scene.table.rows.map((row,index) => <tr key={index}>{row.map((cell,column) => <td key={column} className="border-t p-2">{cell}</td>)}</tr>)}</tbody></table></div>}
      </div> : <p className="mt-3 text-sm text-slate-600">Open your workspace from the sidebar.</p>}
    </div>
  </div>;
}
