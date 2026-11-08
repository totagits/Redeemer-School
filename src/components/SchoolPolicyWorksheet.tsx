import React,{useEffect,useState} from 'react';

export function SchoolPolicyWorksheet(){
  const [text,setText]=useState<string|null>(null),[error,setError]=useState('');
  useEffect(()=>{const abort=new AbortController();void fetch('/api/staging-review/payroll-rules',{cache:'no-store',signal:abort.signal}).then(async response=>{if(!response.ok)throw Error('The staging policy worksheet is unavailable.');return response.text();}).then(setText).catch(e=>{if(!abort.signal.aborted)setError(e.message);});return()=>abort.abort();},[]);
  const blocks:React.ReactNode[]=[];
  if(text){const lines=text.split(/\r?\n/);for(let i=0;i<lines.length;i++){
    const line=lines[i].trim();if(!line)continue;
    if(line.startsWith('|')){
      const rows:string[][]=[];
      while(i<lines.length&&lines[i].trim().startsWith('|')){const cells=lines[i].trim().slice(1,-1).split('|').map(c=>c.trim());if(!cells.every(c=>/^:?-+:?$/.test(c)))rows.push(cells);i++;}i--;
      blocks.push(<div key={i} className="my-5 overflow-x-auto"><table className="w-full border-collapse text-left text-sm"><thead><tr>{rows[0]?.map((cell,j)=><th key={j} className="border border-slate-300 bg-slate-100 p-3">{cell}</th>)}</tr></thead><tbody>{rows.slice(1).map((row,j)=><tr key={j}>{row.map((cell,k)=><td key={k} className="min-w-32 border border-slate-300 p-3 align-top">{/^(To complete|Pending)/i.test(cell)?<label className="block"><span className="sr-only">{row[0]} — {rows[0]?.[k]}</span><textarea aria-label={`${row[0]} — ${rows[0]?.[k]}`} placeholder={cell} rows={2} onInput={event=>{event.currentTarget.style.height='auto';event.currentTarget.style.height=event.currentTarget.scrollHeight+'px';}} className="block w-full min-w-40 resize-y rounded border border-slate-300 p-2 print:border-0"/></label>:cell}</td>)}</tr>)}</tbody></table></div>);
    }else if(line.startsWith('# '))blocks.push(<h1 key={i} className="mt-5 text-3xl font-extrabold">{line.slice(2)}</h1>);
    else if(line.startsWith('## '))blocks.push(<h2 key={i} className="mt-8 text-xl font-bold">{line.slice(3)}</h2>);
    else blocks.push(<p key={i} className="my-3 whitespace-pre-wrap leading-7">{line.replace(/\*\*/g,'').replace(/^[-*] /,'• ')}</p>);
  }}
  return <main className="mx-auto max-w-5xl px-5 py-10"><div className="mb-7 rounded-xl border border-amber-200 bg-amber-50 p-5 print:hidden"><a href="/review" className="font-bold text-blue-800 underline">Back to school review</a><h1 className="mt-4 text-2xl font-bold">Payroll policy worksheet</h1><p className="mt-3 leading-7">HR and Finance can type proposed rules in the blank fields, then print or save the completed worksheet as a PDF and provide it to the review coordinator. Entries stay in this page only; they are not saved to the school database. Keep the page open until you have saved your copy.</p><p className="mt-3 leading-7">Use policy rules, not employee salaries or personal payroll records. School approval is separate, and this worksheet does not activate calculations or authorize payment.</p><button className="mt-4 rounded-lg bg-blue-800 px-4 py-3 font-bold text-white disabled:opacity-50" disabled={!text} onClick={()=>window.print()}>Print / save completed worksheet</button></div>{error?<p role="alert" className="rounded-lg bg-red-50 p-4">{error}</p>:!text?<p role="status">Loading policy worksheet…</p>:<article className="school-policy-worksheet">{blocks}</article>}</main>;
}
