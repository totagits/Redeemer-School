// Versioned public intake contract; keep the corporate bridge copy identical.
export const schoolRequestAreas=['Website','Admissions','Academics','Finance','HR','Inventory','Communications','TVET'];
export function validateSchoolRequest(input){
  const fail=()=>{throw new Error('Check the school request fields and contact consent.');};
  if(!input||typeof input!=='object'||Array.isArray(input))fail();
  const keys=['schemaVersion','requestId','schoolName','contactName','email','phone','schoolLocation','estimatedLearners','requestedAreas','programNotes','message','brandingPreference','consent'];
  if(Object.keys(input).some(k=>!keys.includes(k))||input.schemaVersion!==1||input.consent!==true||!/^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(input.requestId))fail();
  const text=(key,max,min=0)=>{const v=input[key]??'';if(typeof v!=='string'||v.trim().length<min||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v))fail();return v.trim();};
  const result={schemaVersion:1,requestId:input.requestId.toLowerCase(),schoolName:text('schoolName',160,2),contactName:text('contactName',120,2),email:text('email',254,5).toLowerCase(),phone:text('phone',40),schoolLocation:text('schoolLocation',300,2),estimatedLearners:input.estimatedLearners??null,requestedAreas:input.requestedAreas,programNotes:text('programNotes',1000),message:text('message',2000,20),brandingPreference:input.brandingPreference??{},consent:true};
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)||result.estimatedLearners!==null&&(!Number.isSafeInteger(result.estimatedLearners)||result.estimatedLearners<1||result.estimatedLearners>1000000))fail();
  if(!Array.isArray(result.requestedAreas)||!result.requestedAreas.length||result.requestedAreas.length>schoolRequestAreas.length||new Set(result.requestedAreas).size!==result.requestedAreas.length||result.requestedAreas.some(a=>!schoolRequestAreas.includes(a)))fail();
  result.requestedAreas=[...result.requestedAreas].sort();
  const palette=result.brandingPreference;
  if(!palette||typeof palette!=='object'||Array.isArray(palette)||Object.entries(palette).some(([k,v])=>!['primaryColor','secondaryColor','accentColor'].includes(k)||typeof v!=='string'||!/^#[0-9a-f]{6}$/i.test(v)))fail();
  result.brandingPreference=Object.fromEntries(Object.entries(palette).sort().map(([k,v])=>[k,v.toUpperCase()]));
  return result;
}
