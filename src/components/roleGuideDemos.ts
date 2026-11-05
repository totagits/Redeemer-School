export type DemoControl = {
  label: string;
  kind: 'text' | 'select' | 'button' | 'read' | 'file';
  value?: string;
  options?: string[];
};
export type DemoScreen = {
  title: string;
  controls: DemoControl[];
  notice?: string;
  table?: { headings: string[]; rows: string[][] };
};
export type DemoAction = {
  target: string;
  narration: string;
  value?: string;
  screen?: DemoScreen;
  permissions?: string[];
};
export type WorkspaceDemo = { screen: DemoScreen; actions: DemoAction[] };
const read = (label: string, value: string): DemoControl => ({ label, value, kind: 'read' });
const text = (label: string, value = ''): DemoControl => ({ label, value, kind: 'text' });
const select = (label: string, ...options: string[]): DemoControl => ({ label, options, value: '', kind: 'select' });
const button = (label: string): DemoControl => ({ label, kind: 'button' });
const table = (headings: string[], ...rows: string[][]) => ({ headings, rows });
const learner = read('Selected learner', 'Example Learner · PRACTICE-001 · Grade 4');
const exampleInvoice = table(['Invoice', 'Currency', 'Total', 'Paid', 'Balance'], ['PRACTICE-INV-001', 'USD', '100.00', '75.00', '25.00']);
const familySchool = [select('Select learner', 'Example Learner · PRACTICE-001', 'Example Sibling · PRACTICE-002')];

export function roleGuideDemos(permissions: string[], parent: boolean, roles: string[] = []): Record<string, WorkspaceDemo> {
  const can = (permission: string) => permissions.includes(permission);
  const demos: Record<string, WorkspaceDemo> = {
    overview: {
      screen: { title: parent ? 'Your family dashboard' : 'Your school at a glance', controls: parent ? [learner, read('Attendance', '1 recorded entry'), read('Published grades', '1 assessment available when results access is enabled')] : [read('Active students', 'Example school · 3 learners'), read('Quick access', 'Open workspaces from your assigned menu')] },
      actions: [{ target: parent ? 'Selected learner' : 'Active students', narration: parent ? 'Review the selected learner on your family dashboard. Your account shows only learners linked by the school.' : 'The overview displays school counts and quick links within your assigned access. These practice figures are fictional.' }],
    },
    academics: {
      screen: { title: 'Academic setup', controls: [text('Year name'), text('Starts'), text('Ends'), button('Add year')] },
      actions: [
        { target: 'Year name', narration: 'Enter the approved academic year name. This practice year is twenty twenty seven to twenty twenty eight.', value: '2027–2028' },
        { target: 'Starts', narration: 'Set the start date for the practice year.', value: '2027-09-01' },
        { target: 'Ends', narration: 'Set the end date. Check that it follows the start date.', value: '2028-06-30' },
        { target: 'Add year', narration: 'Click Add year. Confirm the saved academic year before setting up its classes.', screen: { title: 'Academic setup', notice: 'Practice academic year saved.', controls: [read('Academic year', '2027–2028 · 1 September 2027 to 30 June 2028')] } },
      ],
    },
    curriculum: {
      screen: { title: 'Curriculum, books & timetable', controls: [read('Teaching assignment', 'Grade 4 · Mathematics'), read('Curriculum', '300 minutes · 5 lessons weekly')], table: table(['Day', 'Time', 'Subject', 'Room'], ['Monday', '08:00', 'Mathematics', 'Room 4']) },
      actions: [
        { target: 'Teaching assignment', narration: 'Check the class and subject. This example displays the Grade four Mathematics assignment.' },
        { target: 'Curriculum', narration: 'Review the weekly minutes, lesson count and objectives. The timetable below shows the scheduled lesson.' },
      ],
    },
    people: {
      screen: { title: 'Student & guardian portal accounts', controls: [select('Create account for', 'Student', 'Parent / guardian'), select('Link to student', 'Example Learner · PRACTICE-001'), text('Full name'), text('Login email'), button('Create / resend portal login')] },
      actions: [
        { target: 'Create account for', narration: 'Choose Student or Parent and guardian for the invitation. This example creates a student invitation.', value: 'Student' },
        { target: 'Link to student', narration: 'Link the account to the correct learner. Verify the school ID.', value: 'Example Learner · PRACTICE-001' },
        { target: 'Full name', narration: 'Enter the account holder name.', value: 'Example Learner' },
        { target: 'Login email', narration: 'Enter and verify the account holder email. The address here is a fictional example.', value: 'learner@example.invalid' },
        { target: 'Create / resend portal login', narration: 'Click Create or resend portal login after checking the details. The recipient uses their setup link to choose a private password.', screen: { title: 'Portal account invitation', notice: 'Practice invitation prepared. No email was sent.', controls: [read('Invitation', 'Example Learner · learner@example.invalid · Linked to PRACTICE-001')] } },
      ],
    },
    teaching: {
      screen: { title: 'Assessments & gradebook', controls: [read('Assessment', 'Practice Mathematics · Maximum 10'), read('Learner', 'Example Learner · PRACTICE-001'), text('Mark for Example Learner'), button('Save marks'), button('Submit all marks for review'), button('Approve marks awaiting review'), button('Publish approved marks')] },
      actions: [
        { target: 'Assessment', narration: 'Check the selected assessment, maximum mark and learner before working in the gradebook.' },
        { target: 'Mark for Example Learner', narration: 'Enter eight out of ten for the fictional learner.', value: '8', permissions: ['grades.enter'] },
        { target: 'Save marks', narration: 'Save the mark before submitting the assessment for review.', permissions: ['grades.enter'], screen: { title: 'Assessments & gradebook', notice: 'Practice mark saved · 8/10', controls: [read('Assessment', 'Practice Mathematics · OPEN'), read('Mark', 'Example Learner · 8/10'), button('Submit all marks for review')] } },
        { target: 'Submit all marks for review', narration: 'Submit the completed marks for review. An authorized reviewer handles approval.', permissions: ['grades.enter'], screen: { title: 'Assessments & gradebook', notice: 'Practice assessment submitted for review.', controls: [read('Review status', '1 awaiting review · Example Learner · 8/10'), button('Approve marks awaiting review'), button('Publish approved marks')] } },
        { target: 'Approve marks awaiting review', narration: 'Review the submitted mark. Click Approve marks awaiting review when the result is ready. This practice result is eight out of ten.', permissions: ['grades.moderate'], screen: { title: 'Assessments & gradebook', notice: 'Practice mark approved.', controls: [read('Review status', '1 approved · Example Learner · 8/10'), button('Publish approved marks')] } },
        { target: 'Publish approved marks', narration: 'Check the approved roster, then publish. The learner and guardians with results access can now see the published grade.', permissions: ['grades.publish'], screen: { title: 'Assessments & gradebook', notice: 'Practice result published.', controls: [read('Published result', 'Example Learner · Mathematics · 8/10 · PUBLISHED')] } },
      ],
    },
    'year-end': {
      screen: { title: 'Year-end report cards', controls: [select('Academic year', '2027–2028'), select('Class', 'Grade 4'), read('Report completeness', 'Example Learner · All required marks present'), button('Approve report card')] },
      actions: [
        { target: 'Academic year', narration: 'Choose the academic year for the reports.', value: '2027–2028' },
        { target: 'Class', narration: 'Choose the class. Check all required categories and marks before approving a report card.', value: 'Grade 4' },
        { target: 'Report completeness', narration: 'Review the learner and complete annual results. Resolve missing marks before approval. Placement decisions follow the school policy.' },
        { target: 'Approve report card', narration: 'Approve the reviewed report card only when authorized. This example creates a practice approved report.', screen: { title: 'Year-end report cards', notice: 'Practice report approved.', controls: [read('Approved report', 'Example Learner · Grade 4 · 2027–2028'), button('Print / save PDF')] } },
      ],
    },
    'website-requests': {
      screen: { title: 'Website requests', controls: [button('PRACTICE-REQ-001 · School visit enquiry')] },
      actions: [
        { target: 'PRACTICE-REQ-001 · School visit enquiry', narration: 'Open the request by its reference to read the enquiry and history.', screen: { title: 'School visit enquiry', controls: [read('Request', 'Example Guardian asks about a school visit.'), select('Next status', 'In progress', 'Waiting', 'Resolved'), text('Internal follow-up note'), button('Record follow-up')] } },
        { target: 'Next status', narration: 'Choose the appropriate next status. This practice request is in progress.', value: 'In progress' },
        { target: 'Internal follow-up note', narration: 'Record what you did and who is responsible for the next action.', value: 'School office will confirm a suitable visit time.' },
        { target: 'Record follow-up', narration: 'Save the follow-up. Check the request history for the recorded action.', screen: { title: 'Request history', notice: 'Practice follow-up recorded.', controls: [read('History', 'In progress · School office will confirm a suitable visit time.')] } },
      ],
    },
    admissions: {
      screen: { title: 'Admissions', controls: [button('PRACTICE-APP-001 · Example Applicant')] },
      actions: [
        { target: 'PRACTICE-APP-001 · Example Applicant', narration: 'Open the application and verify the applicant and reference.', screen: { title: 'Application review', controls: [read('Applicant', 'Example Applicant · Grade 4'), read('Review history', 'Application received · Registrar review pending'), read('Entrance examination', 'Use verified guardian access and examination eligibility checks.'), read('Admission decision', 'An authorized school decision is required before enrollment.')] } },
        { target: 'Review history', narration: 'Check the review history and required information before routing the application to its next authorized stage.' },
        { target: 'Entrance examination', narration: 'Where required, use the entrance examination process, including fee verification and private result approval. An examination result is separate from the admission decision.' },
        { target: 'Admission decision', narration: 'Verify an approved admission decision before enrolling the learner in the correct class. Retain the application history.' },
      ],
    },
    students: {
      screen: { title: 'Learner directory', controls: [text('Search learners'), button('Open profile')] },
      actions: [
        { target: 'Search learners', narration: 'Search for the learner by school ID, name or class. This example uses a fictional school ID.', value: 'PRACTICE-001' },
        { target: 'Open profile', narration: 'Check the learner ID and open the profile.', screen: { title: 'Example Learner · PRACTICE-001', controls: [read('Enrollment history', 'Grade 4 · 2027–2028 · ACTIVE'), read('Guardians', 'Example Guardian · Results access enabled · Finance access disabled'), read('Documents and photograph', 'Private learner records require authorized access.')] } },
        { target: 'Enrollment history', narration: 'Review the class and enrollment history before making an authorized correction.' },
        { target: 'Guardians', narration: 'Check the guardian relationship and its individual access permissions.' },
      ],
    },
    finance: {
      screen: { title: 'Finance & billing', controls: [read('Invoices', 'PRACTICE-INV-001 · Example Learner · USD 25.00 outstanding'), read('MTN MoMo Collections', 'Activation pending'), select('Invoice', 'PRACTICE-INV-001 · USD 25.00'), text('Amount'), select('Channel', 'Cash', 'Bank'), button('Record payment & issue receipt')], table: exampleInvoice },
      actions: [
        { target: 'Invoices', narration: 'Confirm the learner, invoice number, currency and balance before handling payment.' },
        { target: 'MTN MoMo Collections', narration: 'MTN Mobile Money completion depends on provider activation. Follow school procedures for any manually verified payment.' },
        { target: 'Invoice', narration: 'After verifying the actual payment through the school process, choose its invoice. This example is fictional.', value: 'PRACTICE-INV-001 · USD 25.00', permissions: ['finance.write'] },
        { target: 'Amount', narration: 'Enter the verified amount in the invoice currency.', value: '25.00', permissions: ['finance.write'] },
        { target: 'Channel', narration: 'Select the channel through which the school received the verified payment.', value: 'Cash', permissions: ['finance.write'] },
        { target: 'Record payment & issue receipt', narration: 'Record the verified payment and check its receipt and remaining balance.', permissions: ['finance.write'], screen: { title: 'Payment receipt', notice: 'Practice payment recorded. No money moved.', controls: [read('Receipt', 'PRACTICE-RCPT-001 · USD 25.00 · Cash'), read('Invoice balance', 'PRACTICE-INV-001 · USD 0.00')] } },
      ],
    },
    'expense-approvals': {
      screen: { title: 'Expense approvals', controls: [read('Pending expense', 'Example stationery · USD 10.00 · Submitted by Example Requester'), text('Decision note'), button('Approve')] },
      actions: [
        { target: 'Pending expense', narration: 'Review the expense purpose, amount and submitter. Follow independent approval requirements.' },
        { target: 'Decision note', narration: 'Record the basis for the authorized decision.', value: 'Practice request reviewed against supporting details.' },
        { target: 'Approve', narration: 'Approve only after checking the school requirements. Posting and payment follow the authorized finance process.', screen: { title: 'Expense approvals', notice: 'Practice decision saved.', controls: [read('Expense status', 'Example stationery · APPROVED · Awaiting authorized posting')] } },
      ],
    },
    staff: {
      screen: { title: 'Staff & HR', controls: [read('Staff record', 'Example Employee · PRACTICE-EMP-001'), read('Leave request', 'Example Employee · 1 day · Pending review'), read('Personnel privacy', 'Use personnel information only for your authorized school task.')] },
      actions: [
        { target: 'Staff record', narration: 'Verify the employee name and staff ID before working with personnel records.' },
        { target: 'Leave request', narration: 'Check the requested dates and leave status. Attendance, leave and payroll actions depend on your assigned responsibilities.' },
      ],
    },
    recruitment: {
      screen: { title: 'Recruitment & onboarding', controls: [read('Hiring responsibilities', 'HR manages vacancies, applications, interviews and onboarding. A Principal or School Administrator authorizes hiring.'),read('Employee account', 'An administrator can link the onboarded employee through People & accounts.')] },
      actions: [
        { target: 'Hiring responsibilities', narration: 'Follow the school hiring responsibilities. HR records each stage and school leadership authorizes the decision.' },
        { target: 'Employee account', narration: 'After onboarding, an authorized administrator uses People and accounts to link an individual login. Recruitment retains the employee record and history.' },
      ],
    },
    inventory: {
      screen: { title: 'Inventory & procurement', controls: [read('Stock balance', 'Exercise books · Main store · 20 units'), select('Item', 'Exercise books'), select('Location', 'Main store'), text('Quantity'), button('Save stock movement')] },
      actions: [
        { target: 'Stock balance', narration: 'Check the item, location and available quantity before entering a stock movement.' },
        { target: 'Item', narration: 'Select the item for the practice movement.', value: 'Exercise books', permissions: ['inventory.write'] },
        { target: 'Location', narration: 'Select the correct store or stock location.', value: 'Main store', permissions: ['inventory.write'] },
        { target: 'Quantity', narration: 'Enter the verified quantity. This practice example records five units.', value: '5', permissions: ['inventory.write'] },
        { target: 'Save stock movement', narration: 'Save the authorized movement and reconcile it with the stock ledger. Purchase requests and orders use their own independent approvals.', permissions: ['inventory.write'], screen: { title: 'Stock ledger', notice: 'Practice movement recorded.', controls: [read('Stock movement', 'Exercise books · Main store · 5 units · Example movement')] } },
      ],
    },
    communications: {
      screen: { title: 'School announcements', controls: [read('Published announcements', 'Example class reading activity · Published'), text('Title'), text('Message'), button('Save announcement'), read('SMS availability', 'MTN SMS activation pending')] },
      actions: [
        { target: 'Published announcements', narration: 'Review the announcements available to your account. School office conversations and student teacher conversations have different audiences.' },
        { target: 'Title', narration: 'Enter a clear announcement title.', value: 'Practice reading activity', permissions: ['communications.write'] },
        { target: 'Message', narration: 'Write the approved message and check the intended audience.', value: 'Example class reading activity on Monday.', permissions: ['communications.write'] },
        { target: 'Save announcement', narration: 'Save the announcement using the school publishing process. External SMS delivery depends on its provider activation.', permissions: ['communications.write'], screen: { title: 'School announcements', notice: 'Practice announcement saved.', controls: [read('Announcement', 'Practice reading activity · Example class reading activity on Monday.'), read('SMS availability', 'MTN SMS activation pending')] } },
      ],
    },
    'public-content': {
      screen: { title: 'School website content', controls: [select('Page', 'About Us', 'Principal’s Message'), text('Page content'), button('Save draft'), button('Preview'), button('Publish')] },
      actions: [
        { target: 'Page', narration: 'Choose the school page to update.', value: 'About Us' },
        { target: 'Page content', narration: 'Edit the approved text. Any photograph also needs appropriate publication permission, alternative text and a caption.', value: 'Practice school introduction for editorial review.' },
        { target: 'Save draft', narration: 'Save the draft before reviewing it. A saved draft is separate from the published page.' },
        { target: 'Preview', narration: 'Open the saved preview and check the wording and media.', screen: { title: 'Saved page preview', controls: [read('About Us', 'Practice school introduction for editorial review.'), button('Publish')] } },
        { target: 'Publish', narration: 'Publish the reviewed version, then check the public page.', screen: { title: 'Published page', notice: 'Practice page published.', controls: [read('About Us', 'Practice school introduction for editorial review.')] } },
      ],
    },
    reports: {
      screen: { title: 'Reports & EMIS', controls: [read('Enrollment report', 'Grade 4 · 3 active learners'), read('Export scope', 'Verify academic year, campus, class and permitted fields before downloading.')] },
      actions: [
        { target: 'Enrollment report', narration: 'Read the report and confirm its scope. This example shows a fictional enrollment count.' },
        { target: 'Export scope', narration: 'Check your school authorization before using exports. Keep downloaded school records in approved storage.' },
      ],
    },
    accounts: {
      screen: { title: 'User access', controls: [read('Account', 'Example Staff · staff@example.invalid · ACTIVE'), read('Roles', 'Teacher'), read('Access review', 'Use an individual account and grant only school-authorized responsibilities.')] },
      actions: [
        { target: 'Account', narration: 'Verify the person and account status before reviewing access.' },
        { target: 'Roles', narration: 'Check the current roles and compare them with the responsibilities approved by the school.' },
        { target: 'Access review', narration: 'Access changes require school authorization. Keep individual staff accounts for an attributable action history.' },
      ],
    },
    'parent-children': {
      screen: { title: 'My children', controls: [...familySchool, learner, read('Access', 'Results and finance visibility are granted separately for each learner.')] },
      actions: [
        { target: 'Select learner', narration: 'If more than one child is linked, select the learner whose records you need.', value: 'Example Learner · PRACTICE-001' },
        { target: 'Selected learner', narration: 'Verify the learner name, school ID and class before using the family workspaces.' },
        { target: 'Access', narration: 'Each guardian relationship has its own school-approved access. Contact the school office if a section is restricted.' },
      ],
    },
    'parent-classes': {
      screen: { title: 'Subjects & timetable', controls: [learner, read('Subjects', 'Mathematics · 300 minutes / 5 lessons weekly')], table: table(['Day', 'Time', 'Subject', 'Room'], ['Monday', '08:00', 'Mathematics', 'Room 4']) },
      actions: [
        { target: 'Selected learner', narration: 'Confirm the linked learner before reviewing their lessons.' },
        { target: 'Subjects', narration: 'Read the subjects and weekly lesson allocation. The timetable below shows the example lesson day, time and room.' },
      ],
    },
    'parent-grades': {
      screen: { title: 'Grades & report cards', controls: [learner, read('Published result', 'Mathematics · Practice assignment · 8/10'), read('Results permission', 'This example shows enabled results access. Restricted accounts receive no grades.')] },
      actions: [
        { target: 'Selected learner', narration: 'Confirm the learner selected in your family portal.' },
        { target: 'Published result', narration: 'With results access, read published marks and teacher feedback. This practice grade is eight out of ten.' },
        { target: 'Results permission', narration: 'If your account shows a restriction, ask the school office to review the guardian relationship. School approval controls your access.' },
      ],
    },
    'parent-attendance': {
      screen: { title: 'Class attendance', controls: [learner, read('Attendance entry', 'Monday · Mathematics · 08:00 · PRESENT')] },
      actions: [
        { target: 'Selected learner', narration: 'Confirm whose attendance you are reviewing.' },
        { target: 'Attendance entry', narration: 'Check the lesson date, subject and recorded status. Contact the school if you believe an entry needs correction.' },
      ],
    },
    'parent-materials': {
      screen: { title: 'Books & learning materials', controls: [learner, read('Resource', 'Adding whole numbers · Mathematics'), button('Open resource')] },
      actions: [
        { target: 'Resource', narration: 'Find the published resource for your linked learner.' },
        { target: 'Open resource', narration: 'Open the school resource. This practice screen displays an example lesson.', screen: { title: 'Resource preview', controls: [read('Adding whole numbers', '7 + 3 = 10. Then 10 + 2 = 12.')] } },
      ],
    },
    'parent-fees': {
      screen: { title: 'Tuition balance & payment history', controls: [learner, read('Finance access', 'Example account has finance access. Other guardian relationships may be restricted.'), button('Print / Save PDF'), read('Mobile Money', 'Activation pending')], table: exampleInvoice },
      actions: [
        { target: 'Finance access', narration: 'Finance details appear only with school-approved access for the selected learner. Check the invoice number, currency and balance.' },
        { target: 'Print / Save PDF', narration: 'Open the invoice copy to review or save it. This demonstration displays the fictional invoice without downloading a file.', screen: { title: 'Invoice copy', controls: [learner, read('Invoice', 'PRACTICE-INV-001 · USD 25.00 balance'), read('Mobile Money', 'Activation pending')] } },
        { target: 'Mobile Money', narration: 'Use the school payment methods currently available. MTN Mobile Money is awaiting activation.' },
      ],
    },
    'parent-notices': {
      screen: { title: 'Notices & notifications', controls: [learner, read('School notice', 'Example library activity · Please bring a favourite story.'), button('Mark as read')] },
      actions: [
        { target: 'School notice', narration: 'Read the school notice title, date and full message.' },
        { target: 'Mark as read', narration: 'Mark the example notification as read after reviewing it.', screen: { title: 'Notices & notifications', notice: 'Practice notification marked as read.', controls: [learner, read('School notice', 'Example library activity · READ')] } },
      ],
    },
    'parent-messages': {
      screen: { title: 'Message the school', controls: [learner, text('Subject'), text('Message'), button('Send message')] },
      actions: [
        { target: 'Selected learner', narration: 'Check the learner connected to your school office enquiry.' },
        { target: 'Subject', narration: 'Enter a brief subject for the enquiry.', value: 'Practice visit enquiry' },
        { target: 'Message', narration: 'Write your message to the school office.', value: 'Please let me know how to arrange a school visit.' },
        { target: 'Send message', narration: 'Send the enquiry, then check the conversation for the school response.', screen: { title: 'School office conversation', notice: 'Practice message sent. No external message was transmitted.', controls: [learner, read('Your message', 'Please let me know how to arrange a school visit.')] } },
      ],
    },
    'family-photos': {
      screen: { title: 'Family photographs', controls: [learner, select('Photograph of', 'My child (student)', 'Myself (parent / guardian)'), { label: 'Photo JPG/PNG up to 3 MB', kind: 'file' }, button('Submit for school approval')] },
      actions: [
        { target: 'Photograph of', narration: 'Choose whether the image is of your linked child or yourself.', value: 'My child (student)' },
        { target: 'Photo JPG/PNG up to 3 MB', narration: 'Choose a clear JPG or PNG within the size limit. This demonstration selects a fictional example file.', value: 'practice-portrait.png' },
        { target: 'Submit for school approval', narration: 'Submit the photograph for school review. A pending photo does not replace the official identification photograph.', screen: { title: 'Your photo submissions', notice: 'Practice photograph awaiting school review.', controls: [learner, read('Photo submission', 'practice-portrait.png · PENDING')] } },
      ],
    },
  };

  if(roles.some(role=>['HR_MANAGER','SCHOOL_ADMIN'].includes(role))&&can('staff.write')){
    demos.recruitment={screen:{title:'Create vacancy',controls:[text('Vacancy code'),text('Job title'),read('Vacancy details','Example school department · Approved requirements · One position · Future closing date'),button('Save vacancy draft')]},actions:[
      {target:'Vacancy code',narration:'Enter a unique vacancy code for the hiring request.',value:'PRACTICE-HIRE-001'},
      {target:'Job title',narration:'Enter the job title and complete the department, description, requirements, approved number of positions and closing date.',value:'Example Teacher'},
      {target:'Save vacancy draft',narration:'Save the vacancy draft for another authorized school leader to approve.',screen:{title:'Vacancy approval handoff',controls:[read('Leadership approval','Example vacancy approved by another authorized Principal'),button('Open vacancy')]}},
      {target:'Leadership approval',narration:'School leadership must approve the vacancy before HR opens intake. This example continues after that separate approval.'},
      {target:'Open vacancy',narration:'Open the approved vacancy. Publish its approved application instructions through the website editor.',screen:{title:'Record application',controls:[text('Applicant name'),text('Applicant email'),read('Qualifications','Example teaching qualifications reviewed from the application'),button('Save application')]}},
      {target:'Applicant name',narration:'Record the applicant name from their application.',value:'Example Applicant'},
      {target:'Applicant email',narration:'Check and enter the applicant contact email.',value:'applicant@example.invalid'},
      {target:'Save application',narration:'Save the application against this vacancy, then review it for shortlisting.',screen:{title:'Applicant pipeline',controls:[read('Candidate','Example Applicant · APPLIED'),button('Shortlist for interview')]}},
      {target:'Shortlist for interview',narration:'Record the shortlisting action with a reason. HR can now schedule an interview.',screen:{title:'Schedule interview',controls:[read('Interview appointment','Example panel · School office · Scheduled future appointment'),button('Schedule interview')]}},
      {target:'Schedule interview',narration:'Save the future date, time, interview panel and venue. Complete feedback after the interview takes place.',screen:{title:'Interview feedback',controls:[text('Interview feedback'),button('Complete interview')]}},
      {target:'Interview feedback',narration:'After the interview, record the panel feedback and evidence.',value:'Practice interview completed and qualifications reviewed.'},
      {target:'Complete interview',narration:'Save the completed interview feedback. A recommendation is available after this stage.',screen:{title:'Hiring recommendation',controls:[button('Recommend hiring')]}},
      {target:'Recommend hiring',narration:'Submit the hiring recommendation with its evidence. A separate authorized leader must decide.',screen:{title:'Hiring authorization handoff',controls:[read('Hiring approval','Example recommendation authorized by a separate Principal'),button('Record offer issued')]}},
      {target:'Hiring approval',narration:'Continue only after a separate Principal or School Administrator authorizes the hire.'},
      {target:'Record offer issued',narration:'Record the approved offer reference and retain the evidence of issuance.',screen:{title:'Candidate response',controls:[read('Offer reference','PRACTICE-OFFER-001'),button('Record candidate acceptance')]}},
      {target:'Record candidate acceptance',narration:'Record the candidate acceptance before starting onboarding.',screen:{title:'Complete onboarding',controls:[text('Employee number'),read('Onboarding checks','Identity, references, signed contract, safeguarding and school orientation completed'),button('Complete onboarding')]}},
      {target:'Employee number',narration:'Enter the employee number and employment start date.',value:'PRACTICE-EMP-001'},
      {target:'Onboarding checks',narration:'Verify each required onboarding check and record the completion evidence.'},
      {target:'Complete onboarding',narration:'Complete onboarding to create one employee record. The school administrator can then separately link an authorized login.',screen:{title:'Employee onboarded',notice:'Practice employee record created.',controls:[read('Employee','Example Applicant · PRACTICE-EMP-001 · ACTIVE')]}},
    ]};
  }else if(roles.some(role=>['PRINCIPAL','SCHOOL_ADMIN'].includes(role))){
    demos.recruitment={screen:{title:'Vacancy review',controls:[read('Draft vacancy','Example Teacher · One position · Created by HR'),button('Approve vacancy')]},actions:[
      {target:'Draft vacancy',narration:'Review the HR vacancy request, responsibilities, requirements, number of positions and closing date. Another authorized leader must approve a vacancy you created yourself.'},
      {target:'Approve vacancy',narration:'Approve the reviewed vacancy so HR can open intake.',screen:{title:'Hiring recommendation review',controls:[read('Recommendation evidence','Example Applicant · Completed interview feedback · HR recommendation'),button('Authorize hire')]}},
      {target:'Recommendation evidence',narration:'For a hiring decision, review the candidate application, completed interview and HR recommendation. You must be a different user from the recommender.'},
      {target:'Authorize hire',narration:'Record the authorized decision and its evidence. HR can issue the approved offer and complete onboarding after candidate acceptance.',screen:{title:'Hiring decision recorded',notice:'Practice hire authorized.',controls:[read('Next responsibility','HR records offer acceptance, verifies onboarding checks and creates the employee record.')]}},
    ]};
  }
  if (can('attendance.write')) {
    const gradebook = demos.teaching.screen;
    demos.teaching = {
      screen: { title: 'Teacher class roll call', controls: [select('Assigned class & subject', 'Grade 4 · Mathematics'), text('Lesson date'), select('Lesson time', '08:00'), text('Topic taught'), select('Example Learner attendance', 'PRESENT', 'ABSENT', 'LATE'), button('Save roll call')] },
      actions: [
        { target: 'Assigned class & subject', narration: 'Select your assigned class and subject to load the lesson roster.', value: 'Grade 4 · Mathematics' },
        { target: 'Lesson date', narration: 'Choose the date of the scheduled lesson.', value: '2027-09-06' },
        { target: 'Lesson time', narration: 'Choose the scheduled lesson time.', value: '08:00' },
        { target: 'Topic taught', narration: 'Enter the topic covered in the lesson.', value: 'Adding whole numbers' },
        { target: 'Example Learner attendance', narration: 'Record each learner attendance status. This fictional learner was present.', value: 'PRESENT' },
        { target: 'Save roll call', narration: 'Save the checked roll call. Continue below to the practice gradebook.', screen: { ...gradebook, notice: 'Practice roll call saved.' } },
        ...demos.teaching.actions,
      ],
    };
  }
  // Controls used by a permission-gated action follow the same visibility rule as that action.
  for (const demo of Object.values(demos)) {
    const hidden = new Set(demo.actions.filter(action => action.permissions && !action.permissions.some(can)).map(action => action.target));
    demo.actions = demo.actions.filter(action => !action.permissions || action.permissions.some(can));
    demo.screen.controls = demo.screen.controls.filter(control => !hidden.has(control.label));
    for (const action of demo.actions) {
      if (action.screen) action.screen = { ...action.screen, controls: action.screen.controls.filter(control => !hidden.has(control.label)) };
    }
  }
  if (!can('students.write') && !can('staff.write') && !can('users.manage')) {
    demos.people = { screen: { title: 'People & accounts', controls: [read('Directory', 'Example Staff · Active'), read('Account invitations', 'Invitations require an authorized administrator.')] }, actions: [{ target: 'Directory', narration: 'Review the directory within your assigned access. Ask an authorized school administrator to handle invitation or account changes.' }] };
  }
  return demos;
}
