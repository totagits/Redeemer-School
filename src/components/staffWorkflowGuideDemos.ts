import type {DemoControl,WorkspaceDemo} from './roleGuideDemos';
const read=(label:string,value:string):DemoControl=>({kind:'read',label,value});
const text=(label:string):DemoControl=>({kind:'text',label});
const button=(label:string):DemoControl=>({kind:'button',label});
export function staffWorkflowGuideDemos(roles:string[],permissions:string[]):Record<string,WorkspaceDemo>{
 const leader=roles.some(r=>['PRINCIPAL','SCHOOL_ADMIN'].includes(r));
 const hr=roles.some(r=>['HR_MANAGER','SCHOOL_ADMIN'].includes(r))&&permissions.includes('staff.write');
 const finance=roles.some(r=>['FINANCE','SCHOOL_ADMIN'].includes(r))&&permissions.includes('finance.write');
 const demos:Record<string,WorkspaceDemo>={
  leave:{screen:{title:'Request leave',controls:[text('Leave type'),text('Start date'),text('End date'),text('Handover note'),button('Submit leave request')]},actions:[
   {target:'Leave type',value:'Practice annual leave',narration:'Choose the leave type approved by the school. This is a fictional request; it does not establish a leave entitlement.'},
   {target:'Start date',value:'2027-02-01',narration:'Enter the first calendar date of leave.'},
   {target:'End date',value:'2027-02-02',narration:'Enter the final calendar date. The server prevents overlapping active requests.'},
   {target:'Handover note',value:'Practice handover arranged.',narration:'Add a short handover note if needed. Keep medical diagnoses and identity documents out of this field.'},
   {target:'Submit leave request',narration:'Submit the request. HR reviews it, then a different authorized leader decides.',screen:{title:'Leave request submitted',notice:'Fictional request submitted.',controls:[read('Leave status','Requested · Awaiting HR review'),read('Approval handoff','HR review and a separate leadership decision are required')]}},
   {target:'Approval handoff',narration:'Follow the request status here. Pending leave can be cancelled by its employee; approved leave needs an independent leader to cancel it.'}
  ]},
  payslips:{screen:{title:'My payslips',controls:[read('Employee','PRACTICE-EMPLOYEE · Your linked employee only'),read('Paid payroll','Example period · USD gross 100.00 · additions 10.00 · deductions 5.00 · net 105.00'),read('Calculation notes','Manually reviewed school schedule; no automatic statutory calculation')]},actions:[
   {target:'Employee',narration:'Confirm that the payslip belongs to your linked employee record. Other employees pay is private.'},
   {target:'Paid payroll',narration:'Review the period, currency, gross amount, additions, deductions and net amount. Only paid payroll runs appear here.'},
   {target:'Calculation notes',narration:'Read the calculation explanation and contact Finance if you need a correction.'}
  ]},
  payroll:{screen:{title:'Payroll review',controls:[read('Payroll responsibility','Only Finance prepares payroll and school leadership approves it')]},actions:[{target:'Payroll responsibility',narration:'Your available actions depend on the school-assigned payroll role. Payslips remain private to each employee.'}]},
  integrations:{screen:{title:'External service readiness',controls:[read('MTN MoMo','Partial · Configuration and provider acceptance are separate'),read('SMS service','Partial · Approved sender, consent, charges and delivery evidence required'),read('Account email','Configuration check · Verify authorized delivery separately')]},actions:[
   {target:'MTN MoMo',narration:'Check whether collections are configured for sandbox or production. A ready configuration does not prove a real collection or settlement.'},
   {target:'SMS service',narration:'Confirm provider approval and consent before a live SMS test. This readiness page sends no messages.'},
   {target:'Account email',narration:'Configuration is checked without displaying secrets or sending email. Keep delivery evidence from an authorized test.'}
  ]}
 };
 if(hr)demos.leave={screen:{title:'HR leave review',controls:[read('Request','Example Employee · Two calendar dates · Requested'),text('HR review note'),button('Record HR review')]},actions:[
  {target:'Request',narration:'Open another employee leave request. Check dates, coverage and the applicable school policy.'},
  {target:'HR review note',value:'Practice coverage and policy checked.',narration:'Record the HR review and handover evidence. You cannot review your own request.'},
  {target:'Record HR review',narration:'Save the HR review. Another Principal or School Administrator must approve or reject it.',screen:{title:'Leadership handoff',notice:'Fictional HR review recorded.',controls:[read('Leave status','Reviewed · Awaiting independent leadership decision')]}},
  {target:'Leave status',narration:'The reviewed request remains pending until the independent leader records a decision.'}
 ]};
 else if(leader)demos.leave={screen:{title:'Leadership leave decision',controls:[read('HR-reviewed request','Example Employee · Coverage and policy checked by another HR reviewer'),text('Decision note'),button('Approve leave')]},actions:[
  {target:'HR-reviewed request',narration:'Review the employee request and the separate HR review. You cannot decide your own leave or a request you reviewed as HR.'},
  {target:'Decision note',value:'Practice leave approved following school policy.',narration:'Record the reason for approval or rejection.'},
  {target:'Approve leave',narration:'Save the decision. The employee sees the updated status and decision note.',screen:{title:'Leave approved',notice:'Fictional leave approved.',controls:[read('Leave status','Approved · Decision retained in history')]}}
 ]};
 if(finance)demos.payroll={screen:{title:'Manual payroll preparation',controls:[read('Period and currency','Example approved period · USD'),text('Manual schedule reference'),button('Create payroll draft')]},actions:[
  {target:'Period and currency',narration:'Choose the payroll period and one currency. Prepare amounts from the school-approved manual schedule.'},
  {target:'Manual schedule reference',value:'PRACTICE-SCHEDULE-001',narration:'Record the source schedule or policy reference. Statutory deductions are not calculated automatically.'},
  {target:'Create payroll draft',narration:'Create the draft, then select the employee and enter their reviewed amounts.',screen:{title:'Employee amounts',controls:[read('Employee','Example Employee · PRACTICE-EMPLOYEE'),text('Gross amount'),text('Total additions'),text('Total deductions'),text('Calculation explanation'),button('Save employee amounts')]}},
  {target:'Employee',narration:'Verify the employee number before entering compensation.'},
  {target:'Gross amount',value:'100.00',narration:'Enter the reviewed gross amount.'},
  {target:'Total additions',value:'10.00',narration:'Enter approved additions.'},
  {target:'Total deductions',value:'5.00',narration:'Enter the reviewed deduction total from the approved schedule.'},
  {target:'Calculation explanation',value:'Fictional manual calculation only.',narration:'Explain the amounts and deductions so the leader can review them.'},
  {target:'Save employee amounts',narration:'Save the line. This fictional net amount is one hundred and five dollars.',screen:{title:'Payroll review handoff',controls:[read('Net total','USD 105.00'),button('Submit payroll for review')]}},
  {target:'Submit payroll for review',narration:'Submit the complete run. Editing is locked while a separate leader reviews it.',screen:{title:'Independent approval',controls:[read('Leadership decision','Example Principal approved the run'),text('Payment evidence reference'),button('Record completed payment')]}},
  {target:'Leadership decision',narration:'Continue only after another authorized leader approves. Complete payment outside this workspace through the school-approved process.'},
  {target:'Payment evidence reference',value:'PRACTICE-PAYMENT-001',narration:'After payment, enter its actual date and evidence reference. This demonstration transfers no money.'},
  {target:'Record completed payment',narration:'Record the completed payment once. The paid payslip becomes visible only to its linked employee.',screen:{title:'Payroll paid',notice:'Fictional payment record saved. No money transferred.',controls:[read('Payroll status','Paid · History retained · Employee payslip available')]}}
 ]};
 else if(leader)demos.payroll={screen:{title:'Independent payroll approval',controls:[read('Submitted payroll','Example Employee · USD gross 100.00 · additions 10.00 · deductions 5.00 · net 105.00'),text('Review note'),button('Approve payroll')]},actions:[
  {target:'Submitted payroll',narration:'Check the period, employee lines, currency, manual schedule and calculation notes. The payroll preparer cannot approve their own run.'},
  {target:'Review note',value:'Practice manual schedule and totals reviewed.',narration:'Record your review evidence. Return the run to its preparer if changes are needed.'},
  {target:'Approve payroll',narration:'Approve the reviewed run. Finance records payment only after completing it through the separate school payment process.',screen:{title:'Finance payment handoff',notice:'Fictional payroll approved.',controls:[read('Payroll status','Approved · Amounts locked · Awaiting Finance payment record')]}}
 ]};
 return demos;
}
