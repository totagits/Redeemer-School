// A new school gets neutral, unpublished copy rather than Redeemer's approved
// facts, photographs or policies. The catalog supplies structure, not approval.
export function institutionWebsiteDefaults(catalog,school) {
  const pages=Object.fromEntries(Object.entries(catalog).map(([slug,page])=>[slug,{
    eyebrow:page.eyebrow,heading:slug==='home'?school.name:slug==='about-us'?`About ${school.name}`:slug==='careers'?'Careers':page.heading,
    intro:`Contact ${school.name} for current school information.`,sections:[],images:[],documents:[]
  }]));
  pages.home={...pages.home,profile:{name:school.name,motto:school.motto,founded:school.founded||'',address:school.address,phones:[...school.phones]},
    blocks:Object.fromEntries(['about','academics','admissions','families'].map(key=>[key,{title:{about:'Our school',academics:'Academic programs',admissions:'Admissions',families:'Students and families'}[key],body:'School-approved information will be published here. Contact the school office for assistance.'}]))};
  return pages;
}
