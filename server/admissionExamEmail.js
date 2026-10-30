export async function sendExamEmail({email,token,kind,reference,publicUrl,apiKey,from,staging=true,allowedRecipients=process.env.EMAIL_ALLOWED_RECIPIENTS,idempotencyKey,fetchImpl=fetch}) {
  if(!['verify','access','result'].includes(kind)||!/^\S+@\S+\.\S+$/.test(email)||!apiKey||!from||!/^[-\w]{43}$/.test(token))throw new Error('Examination email is not configured.');
  // Staging must never deliver exam codes to an unintended real applicant.
  // Match whole mailbox addresses; domain suffixes and wildcards grant no access.
  const approved=typeof allowedRecipients==='string'?allowedRecipients.split(/[,;\s]+/).filter(Boolean).map(value=>value.toLowerCase()):[];
  if(staging&&!approved.includes(email.toLowerCase()))throw new Error('Staging examination email requires an approved test recipient.');
  const origin=new URL(publicUrl);
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash)throw new Error('Examination email requires a clean HTTPS application address.');
  const title=kind==='verify'?'Verify guardian email':kind==='result'?'Your private examination result is ready':'Your examination access code';
  const instruction=kind==='result'?'The school has released a private examination result. Enter this code on the private result page within seven days. This is not an admission decision.':kind==='verify'?'Enter this one-time verification code on the guardian email verification page. It expires in 30 minutes.':'Enter this one-time code on the candidate examination sign-in page during the scheduled examination window.';
  const page=new URL(kind==='verify'?'/examination/verify-email':kind==='result'?'/examination/results':'/examination',origin.origin).toString();
  const text=`${staging?'STAGING TEST MESSAGE — not a production examination.\n\n':''}Redeemer’s International Academy\n\n${instruction}\n\nCode: ${token}\n\nReference: ${reference}\n\n${page}\n\nDo not publish or forward this code to anyone outside the intended applicant and guardian. This message contains no examination results.`;
  const response=await fetchImpl('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':idempotencyKey},body:JSON.stringify({from,to:[email],subject:`${staging?'[STAGING] ':''}${title}`,text}),signal:AbortSignal.timeout(10_000)});
  if(!response.ok)throw new Error('Examination email could not be delivered.');
}
