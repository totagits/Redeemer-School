import React,{useEffect,useState} from 'react';
type HistoricalRow={academic_year:string;class_name:string;learners:number;male:number;female:number;sex_unrecorded:number};
type ArchiveRow=HistoricalRow&{batch_id:string;source_filename:string;imported_at:string};
const headings=['academic_year','class_name','learners','male','female','sex_unrecorded'];
function parseCsv(value:string):string[][]{
  const result:string[][]=[];let row:string[]=[],cell='',quoted=false;
  for(let i=0;i<value.length;i++){
    const char=value[i];
    if(quoted){if(char==='"'&&value[i+1]==='"'){cell+='"';i++;}else if(char==='"'){quoted=false;}else cell+=char;}
    else if(char==='"'){if(cell)throw new Error('Unexpected quote in CSV.');quoted=true;}
    else if(char===','){row.push(cell.trim());cell='';}
    else if(char==='\r'||char==='\n'){if(char==='\r'&&value[i+1]==='\n')i++;row.push(cell.trim());cell='';if(row.some(x=>x!==''))result.push(row);row=[];}
    else cell+=char;
  }
  if(quoted)throw new Error('The CSV has an unclosed quoted field.');
  row.push(cell.trim());if(row.some(x=>x!==''))result.push(row);
  return result;
}
function validate(text:string):HistoricalRow[]{
  const lines=parseCsv(text.replace(/^\uFEFF/,''));
  if(lines.length<2)throw new Error('CSV must include a header and at least one historical record.');
  const header=lines.shift()!.map(c=>c.toLowerCase().replaceAll(' ','_'));
  if(header.length!==headings.length||headings.some(h=>!header.includes(h)))throw new Error('Headers must be: '+headings.join(', '));
  if(lines.length>5000)throw new Error('Limit is 5,000 rows per import.');
  const seen=new Set<string>();
  return lines.map((fields,index)=>{
    if(fields.length!==headings.length)throw new Error(`Row ${index+2}: column count mismatch.`);
    const obj=Object.fromEntries(headings.map(key=>[key,fields[header.indexOf(key)]]));
    const academic_year=String(obj.academic_year||'').trim(),class_name=String(obj.class_name||'').trim();
    if(!/^\d{4}[-/]\d{4}$/.test(academic_year)||!class_name||class_name.length>100)throw new Error(`Row ${index+2}: invalid academic year or class.`);
    const id=(academic_year+'|'+class_name).toLowerCase();
    if(seen.has(id))throw new Error(`Row ${index+2}: year and class repeated.`);seen.add(id);
    const numbers=Object.fromEntries(headings.slice(2).map(k=>[k,Number(obj[k])]));
    for(const k of headings.slice(2)){if(!/^(0|[1-9]\d*)$/.test(String(obj[k]))||!Number.isSafeInteger(numbers[k])||numbers[k]>1000000)throw new Error(`Row ${index+2}: invalid ${k}.`);}
    if(numbers.learners!==numbers.male+numbers.female+numbers.sex_unrecorded)throw new Error(`Row ${index+2}: learners must equal male + female + sex_unrecorded.`);
    return {academic_year,class_name,learners:numbers.learners,male:numbers.male,female:numbers.female,sex_unrecorded:numbers.sex_unrecorded};
  });
}
async function jsonResult(response:Response){if(!(response.headers.get('content-type')||'').includes('application/json'))throw new Error(`Historical records service returned HTTP ${response.status} without JSON.`);const body=await response.json();if(!response.ok)throw new Error(body.error||`Import failed (HTTP ${response.status}).`);return body;}
export const HistoricalCsvArchive:React.FC<{csrfToken:string}>=({csrfToken})=>{
 const [rows,setRows]=useState<HistoricalRow[]>([]),[filename,setFilename]=useState(''),[archive,setArchive]=useState<ArchiveRow[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[confirm,setConfirm]=useState(false);
 const load=async()=>{try{const response=await fetch('/api/operations/reports/emis-archive',{credentials:'same-origin',cache:'no-store'});const body=await jsonResult(response);setArchive(body.rows||[]);}catch(e){setError(e instanceof Error?e.message:'Unable to load historic archive.')}};
 useEffect(()=>{void load()},[]);
 const pick=async(file:File|undefined)=>{setRows([]);setFilename('');setConfirm(false);setError('');setNotice('');if(!file)return;
 if(!file.name.toLowerCase().endsWith('.csv')||file.size>400000){setError('Choose a .csv file up to 400 KB.');return;}
 try{const parsed=validate(await file.text());setRows(parsed);setFilename(file.name);}catch(e){setError(e instanceof Error?e.message:'Invalid CSV.')}};
 const upload=async()=>{if(!confirm||!rows.length)return;setBusy(true);setError('');setNotice('');try{const response=await fetch('/api/operations/reports/emis-archive',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':csrfToken},body:JSON.stringify({filename,rows})});const body=await jsonResult(response);setNotice(`${body.importedRows} historical records archived. Current learner records were not modified.`);setRows([]);setFilename('');setConfirm(false);await load();}catch(e){setError(e instanceof Error?e.message:'Historical upload failed.')}finally{setBusy(false)}};
 const downloadTemplate=()=>{const csv='academic_year,class_name,learners,male,female,sex_unrecorded\r\n2020-2021,Grade 1,40,20,18,2\r\n';const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const el=document.createElement('a');el.href=url;el.download='historical-emis-csv-template.csv';el.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 return <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
 <h4 className="text-lg font-extrabold">Upload old school records (CSV)</h4>
 <p className="mt-1 text-sm text-slate-600">Import historical, class-level totals from previous school years. This is a separate archive: it does not edit students, admissions, live enrollments or ID cards.</p>
 <div className="mt-3 flex flex-wrap items-end gap-3"><button type="button" onClick={downloadTemplate} className="rounded-lg border border-blue-300 px-3 py-2 text-sm font-bold text-blue-800">Download CSV template</button><label className="text-sm font-bold">Choose historical CSV<input className="mt-1 block max-w-full rounded border p-2" type="file" accept=".csv,text/csv" onChange={e=>void pick(e.target.files?.[0])}/></label></div>
 {rows.length>0&&<><p className="mt-3 font-semibold">{filename} · {rows.length} historical class/year entries</p><div className="mt-2 max-h-64 overflow-auto rounded-lg border"><table className="w-full min-w-[600px] text-left text-xs"><thead className="bg-slate-100"><tr>{headings.map(h=><th className="p-2" key={h}>{h.replaceAll('_',' ')}</th>)}</tr></thead><tbody>{rows.slice(0,20).map((row,i)=><tr key={i} className="border-t">{headings.map(h=><td key={h} className="p-2">{row[h as keyof HistoricalRow]}</td>)}</tr>)}</tbody></table></div>{rows.length>20&&<p className="mt-1 text-xs text-slate-500">Showing first 20 rows; all {rows.length} rows will be imported.</p>}
 <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)}/>I verified these historical figures against school source records. I understand this is a separate historical archive and not an official Ministry submission.</label>
 <button type="button" disabled={!confirm||busy} onClick={()=>void upload()} className="mt-3 rounded-lg bg-blue-700 px-4 py-2 font-bold text-white disabled:opacity-50">{busy?'Importing…':'Confirm historical CSV import'}</button></>}
 {error&&<p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
 {notice&&<p role="status" className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
 <h5 className="mt-6 font-extrabold">Imported historical archive</h5>
 <button type="button" onClick={()=>void load()} className="mt-2 rounded-lg border px-3 py-1.5 text-xs font-bold">Refresh archive</button>
 {archive.length?<div className="mt-3 max-h-80 overflow-auto rounded-lg border"><table className="w-full min-w-[700px] text-left text-xs"><thead className="bg-slate-100"><tr>{['Year','Class','Learners','Male','Female','Unrecorded','Source file','Imported'].map(h=><th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{archive.map((row,i)=><tr key={row.batch_id+row.class_name+i} className="border-t">{[row.academic_year,row.class_name,row.learners,row.male,row.female,row.sex_unrecorded,row.source_filename,new Date(row.imported_at).toLocaleDateString()].map((v,j)=><td className="p-2" key={j}>{v}</td>)}</tr>)}</tbody></table></div>:<p className="mt-2 text-sm text-slate-600">No old school records imported yet.</p>}
 </section>;
};
