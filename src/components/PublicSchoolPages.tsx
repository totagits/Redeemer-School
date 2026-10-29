import React from 'react';
import { ArrowRight, BookOpen, CalendarDays, Camera, GraduationCap, HeartHandshake, MapPin, Phone, Users } from 'lucide-react';
import { SCHOOL_CONTACT } from '../data/schoolContact.ts';

export type SchoolNavItem={label:string;slug:string};
export const publicSchoolNavigation:{label:string;items:SchoolNavItem[]}[]=[
 {label:'School Info',items:[
  {label:'About Us',slug:'about-us'},{label:'Mission & Values',slug:'mission-values'},
  {label:'Faculty & Staff',slug:'faculty-staff'},{label:'School Leadership',slug:'leadership'},
  {label:"Principal's Message",slug:'principal-message'},{label:'Records Requests',slug:'records-requests'},
  {label:'School & Office Hours',slug:'school-hours'},{label:'School Calendar',slug:'school-calendar'},
  {label:'Careers',slug:'careers'},{label:'Photo Albums',slug:'photo-albums'}]},
 {label:'Enroll',items:[
  {label:'Enrollment Process',slug:'enrollment-process'},{label:'Admission Requirements',slug:'admission-requirements'},
  {label:'Admissions & Fees',slug:'admissions-fees'},{label:'School Visit & Inquiries',slug:'school-visits'}]},
 {label:'Academics',items:[
  {label:'Academic Programs',slug:'academic-programs'},{label:'Curriculum & Learning',slug:'curriculum'},
  {label:'Assessment & Progress',slug:'assessment-progress'},{label:'Learning Resources',slug:'learning-resources'}]},
 {label:'Student Life',items:[
  {label:'School Events',slug:'school-events'},{label:'Activities & Enrichment',slug:'activities'},
  {label:'Sports & Wellness',slug:'sports'},{label:'School Supplies',slug:'school-supplies'},
  {label:'School Uniform',slug:'school-uniform'},{label:'Student Achievements',slug:'achievements'}]},
 {label:'Parents',items:[
  {label:'Parent Resources',slug:'parent-resources'},{label:'Parent Handbook',slug:'parent-handbook'},
  {label:'Parent FAQs',slug:'parent-faq'},{label:'Attendance & Absences',slug:'attendance-absence'},
  {label:'Meals & School Services',slug:'school-services'},{label:'Family Involvement',slug:'family-involvement'}]},
 {label:'Contact',items:[
  {label:'Contact Us',slug:'contact-us'},{label:'Directions & Location',slug:'directions'},
  {label:'Request Information',slug:'request-information'}]},
 {label:'Quick Links',items:[
  {label:'Apply Online',slug:'apply-online'},{label:'Student Portal',slug:'student-portal'},
  {label:'Guardian Portal',slug:'guardian-portal'},{label:'News & Events',slug:'news-events'}]}
];

type PageData={eyebrow:string;heading:string;intro:string;sections:{title:string;body:string}[]};
const pages:Record<string,PageData>={
 'about-us':{eyebrow:'School Info',heading:'About Redeemer’s International Academy',intro:'Redeemer’s International Academy, established in 2022, serves its school community in Thinker’s Village, Paynesville, Liberia.',sections:[{title:'Our school community',body:'The school brings learners, families, educators and community members together around academic and moral excellence.'},{title:'Visit our campus',body:'Families who wish to learn more about our school can contact the school office to arrange a visit.'}]},
 'mission-values':{eyebrow:'School Info',heading:'Our Mission & Values',intro:'Academic and Moral Excellence is the guiding motto of Redeemer’s International Academy.',sections:[{title:'Learning',body:'We seek to support curiosity, discipline and strong foundational learning.'},{title:'Character',body:'Respect, responsibility and service are central to our school community.'},{title:'Family partnership',body:'Parents and guardians are essential partners in each child’s education.'}]},
 'faculty-staff':{eyebrow:'School Info',heading:'Faculty & Staff',intro:'Meet the teachers and staff who support learning and school life at Redeemer.',sections:[{title:'Staff directory',body:'An approved staff directory with names, roles and photographs will appear here once authorized by the school administration.'},{title:'Contact a teacher',body:'Enrolled families can communicate using their secure Student and Guardian portals.'}]},
 'leadership':{eyebrow:'School Info',heading:'School Leadership',intro:'School leadership guides educational quality, student welfare and responsible school operations.',sections:[{title:'Leadership profiles',body:'Approved names, photographs and official messages will appear here once supplied by the school.'}]},
 'principal-message':{eyebrow:'School Info',heading:'A Message from the Principal',intro:'Welcome to Redeemer’s International Academy.',sections:[{title:'Official message',body:'The Principal’s approved welcome message will be published here. We will not attribute a statement or photograph without school confirmation.'}]},
 'records-requests':{eyebrow:'School Info',heading:'Student Records Requests',intro:'Parents, guardians and former students can contact the school about official records and academic documents.',sections:[{title:'Privacy first',body:'To protect students, records are only released after identity and authorization checks by the school office.'},{title:'Request a record',body:'Contact the Registrar through the school office. Do not send sensitive identification documents through a public website inquiry.'}]},
 'school-hours':{eyebrow:'School Info',heading:'School & Office Hours',intro:'For current teaching schedules, visiting times and office opening hours, contact the school directly.',sections:[{title:'Visiting',body:'Appointments help ensure that staff are available to assist families.'},{title:'Confirmed hours',body:'Official hours will be listed here once verified by the administration.'}]},
 'school-calendar':{eyebrow:'School Info',heading:'School Calendar',intro:'School terms, breaks, examinations and special events will be published on the approved school calendar.',sections:[{title:'Upcoming dates',body:'Only administration-approved dates will be displayed. Contact the school office for the current academic calendar.'}]},
 'careers':{eyebrow:'School Info',heading:'Careers at Redeemer',intro:'Help shape a positive learning environment at Redeemer’s International Academy.',sections:[{title:'Open positions',body:'Current vacancies and application instructions will appear here when officially announced.'},{title:'Recruitment',body:'The school reviews applications through its authorized recruitment process. Unsolicited sensitive documents should not be sent through a public form.'}]},
 'photo-albums':{eyebrow:'School Info',heading:'School Photo Albums',intro:'A visual record of learning, celebrations and achievements across the Redeemer school community.',sections:[{title:'School photographs',body:'Campus, classroom, student life and achievement photographs selected from the school’s own collection will be organized here once approved for publication.'},{title:'Student privacy',body:'Images of identifiable students will be published only after the school verifies appropriate permissions.'}]},
 'enrollment-process':{eyebrow:'Enroll',heading:'Enrollment Process',intro:'Learn how to begin an application to Redeemer’s International Academy.',sections:[{title:'Step 1 — Inquiry',body:'Contact the school to confirm grade availability, requirements and important dates.'},{title:'Step 2 — Apply online',body:'Complete the official online admission application and provide the requested guardian contact information.'},{title:'Step 3 — School review',body:'The Registrar reviews each application and contacts the family about the next steps.'}]},
 'admission-requirements':{eyebrow:'Enroll',heading:'Admission Requirements',intro:'Admission requirements vary according to the learner’s grade and educational history.',sections:[{title:'Before applying',body:'Contact the Registrar for current eligibility, documents, admission assessment requirements and available places.'},{title:'Official application',body:'The online application provides the current fields requested by the school.'}]},
 'admissions-fees':{eyebrow:'Enroll',heading:'Admissions & Fees',intro:'Tuition schedules and school fees are maintained by the authorized Finance team.',sections:[{title:'Fee information',body:'Request the current approved fee schedule from the school. No unapproved rates are advertised on this website.'},{title:'Existing families',body:'Students and guardians can review their authorized invoices and balances in the secure portal.'}]},
 'school-visits':{eyebrow:'Enroll',heading:'School Visits & Inquiries',intro:'Families are welcome to contact the school to ask questions about the learning environment.',sections:[{title:'Schedule a visit',body:'Call the school office to confirm available visiting times and arrangements.'},{title:'Explore online',body:'Browse the school information and photo gallery for an introduction to the campus.'}]},
 'academic-programs':{eyebrow:'Academics',heading:'Academic Programs',intro:'Redeemer’s academic experience focuses on knowledge, confidence and character.',sections:[{title:'Grade offerings',body:'Contact the school office for the current approved grade levels and enrollment availability.'},{title:'Learning support',body:'Teachers and families work together to monitor and support learner progress.'}]},
 'curriculum':{eyebrow:'Academics',heading:'Curriculum & Learning',intro:'The school’s teaching and learning programs are coordinated through the academic administration.',sections:[{title:'Subjects and schedules',body:'Specific subjects and class timetables are available to authorized enrolled learners and guardians through their respective portals.'},{title:'Curriculum information',body:'The school office can provide current curriculum and instructional details.'}]},
 'assessment-progress':{eyebrow:'Academics',heading:'Assessment & Progress',intro:'Assessment supports teaching decisions and keeps families informed about learning.',sections:[{title:'Grades and reports',body:'Published individual grades and reports are only available to authorized users within secure student and guardian portals.'},{title:'School performance',body:'Approved, aggregated achievements may be shared publicly when authorized.'}]},
 'learning-resources':{eyebrow:'Academics',heading:'Learning Resources',intro:'Classroom materials support study at school and at home.',sections:[{title:'Student materials',body:'Registered students and guardians can find assigned resources and learning materials inside their secure portal.'}]},
 'school-events':{eyebrow:'Student Life',heading:'School Events',intro:'School activities help strengthen relationships, celebrate achievements and build community.',sections:[{title:'Upcoming events',body:'Public event dates are posted in the school news and events section after approval.'},{title:'School memories',body:'Photos of approved events will be featured in the school gallery.'}]},
 'activities':{eyebrow:'Student Life',heading:'Activities & Enrichment',intro:'Learning beyond the classroom can develop creativity, teamwork and confidence.',sections:[{title:'Programs',body:'Information about current clubs, community activities and enrichment opportunities will be published when confirmed by the school.'}]},
 'sports':{eyebrow:'Student Life',heading:'Sports & Wellness',intro:'Physical activity and wellbeing contribute to a balanced student experience.',sections:[{title:'Activities',body:'Details about approved school sports, physical education and wellness opportunities will be shared as they become available.'}]},
 'school-supplies':{eyebrow:'Student Life',heading:'School Supplies',intro:'Prepare for the school year with the supplies recommended for your learner’s grade.',sections:[{title:'Supply lists',body:'Approved grade-specific supply lists will be provided by the school before the academic year begins.'}]},
 'school-uniform':{eyebrow:'Student Life',heading:'School Uniform',intro:'School uniforms help create a shared school identity.',sections:[{title:'Official guidance',body:'Contact the administration for the latest authorized uniform requirements, approved colors and purchase guidance.'}]},
 'achievements':{eyebrow:'Student Life',heading:'Student Achievements',intro:'We celebrate the effort, growth and achievements of the Redeemer school community.',sections:[{title:'Recognition and awards',body:'School-approved achievements and award presentations will be featured here with appropriate publication permission.'}]},
 'parent-resources':{eyebrow:'Parents',heading:'Resources for Parents & Guardians',intro:'Families are vital partners in helping children succeed at school.',sections:[{title:'Stay informed',body:'Use the secure guardian portal for learner-specific notices, attendance, published results, fees and messages.'},{title:'Need assistance?',body:'Contact the school office for help with family account access.'}]},
 'parent-handbook':{eyebrow:'Parents',heading:'Parent Handbook',intro:'The school handbook provides official policies and expectations for families.',sections:[{title:'Approved handbook',body:'The school’s current handbook will be published here when the administration supplies an approved copy.'}]},
 'parent-faq':{eyebrow:'Parents',heading:'Parent Questions & Answers',intro:'Answers to frequently asked questions about school life and family access.',sections:[{title:'How do I apply?',body:'Use the Apply Online link or contact the Registrar.'},{title:'How do I check grades and fees?',body:'Sign in to the appropriate authorized student or guardian portal.'},{title:'How do I request a school visit?',body:'Call the school office to arrange a suitable time.'}]},
 'attendance-absence':{eyebrow:'Parents',heading:'Attendance & Absences',intro:'Regular school attendance supports learning and student wellbeing.',sections:[{title:'Report an absence',body:'Contact the school office to follow the approved absence notification process.'},{title:'Review attendance',body:'Authorized students and guardians may view recorded attendance through their portal.'}]},
 'school-services':{eyebrow:'Parents',heading:'Meals & School Services',intro:'Contact the administration for confirmed information about school meals and additional services.',sections:[{title:'Current availability',body:'Details about meals, transport and any additional services will only be shown here after confirmation by school management.'}]},
 'family-involvement':{eyebrow:'Parents',heading:'Family Involvement',intro:'A connected school community starts with engaged families.',sections:[{title:'Participate',body:'Contact the school to learn about officially organized meetings, volunteering and family involvement opportunities.'}]},
 'contact-us':{eyebrow:'Contact',heading:'Contact the School',intro:'We welcome inquiries about admissions, school life and family services.',sections:[{title:'Campus location',body:SCHOOL_CONTACT.address},{title:'Phone',body:SCHOOL_CONTACT.phones.join(' / ')}]},
 'directions':{eyebrow:'Contact',heading:'Directions & Location',intro:'Find Redeemer’s International Academy in Thinker’s Village, Paynesville.',sections:[{title:'School address',body:SCHOOL_CONTACT.address},{title:'Visiting guidance',body:'Call the school office before traveling for an appointment.'}]},
 'request-information':{eyebrow:'Contact',heading:'Request Information',intro:'Interested in learning more about Redeemer’s International Academy?',sections:[{title:'Contact admissions',body:'Call the school using the numbers below for current admissions and school information.'}]},
 'news-events':{eyebrow:'Quick Links',heading:'News & School Events',intro:'Find news and events officially published by the school administration.',sections:[{title:'Official announcements',body:'Publicly approved news and events are displayed on the school homepage. Private classroom notices remain available only through the secure portals.'}]}
};

export function PublicSchoolPages({slug,onApply,onPortalSignIn}:{slug:string;onApply:()=>void;onPortalSignIn:()=>void}){
 const data=pages[slug];
 if(!data)return <div className="mx-auto max-w-5xl px-5 py-20"><h1 className="text-3xl font-bold">Page not found</h1><a className="mt-4 inline-block text-blue-800 underline" href="/">Return to school homepage</a></div>;
 const group=publicSchoolNavigation.find(g=>g.items.some(item=>item.slug===slug));
 return <div className="min-h-[65vh] bg-slate-50 text-slate-900">
  <div className="bg-[#081b3c] px-5 py-12 text-white sm:py-16">
   <div className="mx-auto max-w-6xl"><p className="text-xs font-bold uppercase tracking-[.18em] text-sky-300">{data.eyebrow}</p>
    <h1 className="mt-3 max-w-4xl text-3xl font-extrabold sm:text-5xl">{data.heading}</h1><p className="mt-4 max-w-3xl text-base leading-7 text-slate-200">{data.intro}</p></div>
  </div>
  <div className="mx-auto grid max-w-6xl gap-8 px-5 py-9 md:grid-cols-[minmax(0,1fr)_250px]">
   <main className="space-y-5">{data.sections.map(section=><section key={section.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
     <h2 className="text-xl font-bold">{section.title}</h2><p className="mt-3 whitespace-pre-wrap leading-7 text-slate-600">{section.body}</p>
   </section>)}
   {['enrollment-process','admission-requirements','admissions-fees','school-visits'].includes(slug)&&<button onClick={onApply} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-5 py-3 text-sm font-bold text-white">Apply for admission <ArrowRight className="h-4 w-4"/></button>}
   {['parent-resources','parent-faq','attendance-absence','assessment-progress','learning-resources'].includes(slug)&&<button onClick={onPortalSignIn} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-5 py-3 text-sm font-bold text-white">Student & Guardian Portal <ArrowRight className="h-4 w-4"/></button>}
   {slug==='photo-albums'&&<div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">The school photo collection is being prepared for web publication; original photographs and student-image consent will be verified before release.</div>}
   </main>
   <aside className="self-start rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold">{group?.label||'Explore Redeemer'}</h2>
    <nav aria-label="Related pages" className="mt-3 space-y-1">{group?.items.map(item=><a key={item.slug} href={`/school/${item.slug}`} aria-current={slug===item.slug?'page':undefined} className={`block rounded-lg px-3 py-2 text-sm ${slug===item.slug?'bg-blue-50 font-bold text-blue-800':'text-slate-600 hover:bg-slate-50'}`}>{item.label}</a>)}</nav>
    <div className="mt-5 border-t pt-4"><p className="text-xs font-semibold text-slate-500">CONTACT THE SCHOOL</p>{SCHOOL_CONTACT.phones.map(phone=><a className="mt-2 flex items-center gap-2 text-sm text-blue-800" key={phone} href={`tel:${phone}`}><Phone className="h-4 w-4"/>{phone}</a>)}</div>
   </aside>
  </div>
 </div>;
}
