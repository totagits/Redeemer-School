export function reviewFeedbackPayload(values:Record<string,string>,schoolCode:string,requestId:string,consent:boolean){
  const role=values.role||'Reviewer',workspace=values.workspace||'General',outcome=values.outcome||'Observation';
  const message=[`STAGING SCHOOL REVIEW — ${outcome}`,`Reviewer role (self-described, not an authorization): ${role}`,`Workspace: ${workspace}`,`Expected: ${values.expected||'Not provided'}`,`Observed: ${values.observed||'Not provided'}`,`Proposed school policy / next step: ${values.policy||'Not provided'}`].join('\n');
  if(message.length>2000)throw Error('Please shorten the feedback to fit one review entry.');
  return {schoolCode,requestId,category:'ENQUIRY',contactName:values.contactName,email:values.email,subject:`STAGING REVIEW — ${workspace}`.slice(0,160),message,consent,website:values.website||''};
}
