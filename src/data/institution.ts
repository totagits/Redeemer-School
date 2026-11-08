export type InstitutionIdentity={code:string;name:string;motto:string;founded?:string;address:string;phones:string[];email:string;timezone:string;currency:string;logoUrl:string;primaryColor:string;secondaryColor?:string;accentColor:string;environment:string;buildId?:string};
declare const __SCHOOL_PUBLIC_CONFIG__: InstitutionIdentity|null;
export const IS_CONFIGURED_INSTITUTION=typeof __SCHOOL_PUBLIC_CONFIG__!=='undefined'&&Boolean(__SCHOOL_PUBLIC_CONFIG__);
export const INSTITUTION:InstitutionIdentity=(typeof __SCHOOL_PUBLIC_CONFIG__!=='undefined'&&__SCHOOL_PUBLIC_CONFIG__)||{
  code:'RIA',name:"Redeemer's International Academy",motto:'Academic and Moral Excellence',founded:'2022',
  address:"RIA Highway, Thinker's Village, Guest House Road, Paynesville, Montserrado, Liberia",phones:['0778786116','0555664239'],email:'',
  timezone:'Africa/Monrovia',currency:'LRD',logoUrl:'/redeemer-seal.svg?v=3',primaryColor:'#071d3e',accentColor:'#fbbf24',environment:'STAGING'
};
export const SCHOOL_LOGO_URL=INSTITUTION.logoUrl;
export const SCHOOL_LOGO_ALT=INSTITUTION.name+' seal';
export const SCHOOL_PORTAL_NAME=IS_CONFIGURED_INSTITUTION?INSTITUTION.name+' ERP':'Redeemer ERP';
export function schoolPublicUrl(path:string){return path+(path.includes('?')?'&':'?')+'schoolCode='+encodeURIComponent(INSTITUTION.code);}
