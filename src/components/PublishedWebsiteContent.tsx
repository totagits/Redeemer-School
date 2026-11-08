import React,{createContext,useContext,useEffect,useState} from 'react';
import defaults from '../../shared/website-content.json';
import {institutionWebsiteDefaults} from '../../shared/institutionDefaults.js';
import {INSTITUTION,IS_CONFIGURED_INSTITUTION,schoolPublicUrl} from '../data/institution.ts';
export type WebsiteImage={id:string;alt:string;caption:string};
export type WebsiteDocument={id:string;label:string};
export type WebsiteProfile={name:string;motto:string;founded:string;address:string;phones:string[]};
export type WebsitePage={eyebrow:string;heading:string;intro:string;sections:{title:string;body:string}[];images:WebsiteImage[];documents:WebsiteDocument[];profile?:WebsiteProfile;blocks?:Record<string,{title:string;body:string}>};
export const WEBSITE_DEFAULTS=(IS_CONFIGURED_INSTITUTION?institutionWebsiteDefaults(defaults,INSTITUTION):defaults) as Record<string,WebsitePage>;
const initial=WEBSITE_DEFAULTS;
const Context=createContext<Record<string,WebsitePage|null>>(initial);
export function PublicWebsiteContentProvider({children}:{children:React.ReactNode}){
 const [pages,setPages]=useState<Record<string,WebsitePage|null>>({});
 useEffect(()=>{const abort=new AbortController();void fetch(schoolPublicUrl('/api/website-pages/public'),{credentials:'omit',cache:'no-store',signal:abort.signal}).then(async response=>{if(!response.ok)throw Error('Website content unavailable');return response.json();}).then(data=>{if(!abort.signal.aborted)setPages(data.pages);}).catch(()=>{if(!abort.signal.aborted)setPages(Object.fromEntries(Object.keys(initial).map(slug=>[slug,null])));});return()=>abort.abort();},[]);
 return <Context.Provider value={pages}>{children}</Context.Provider>;
}
export function usePublishedPage(slug:string){return useContext(Context)[slug];}
export function useWebsiteProfile(){return usePublishedPage('home')?.profile||initial.home.profile!;}
export function websiteAssetUrl(id:string,preview=false){return preview?'/api/website-pages/manage/assets/'+id+'/file':schoolPublicUrl('/api/website-pages/public/assets/'+id);}
export function PublishedPageAssets({page,preview=false}:{page:{images?:WebsiteImage[];documents?:WebsiteDocument[]};preview?:boolean}){
 return <>{Boolean(page.images?.length)&&<section aria-label="School photographs" className="grid gap-5 sm:grid-cols-2">{page.images!.map(photo=><figure key={photo.id} className="overflow-hidden rounded-2xl border bg-white"><img src={websiteAssetUrl(photo.id,preview)} alt={photo.alt} loading="lazy" className="aspect-video w-full object-cover"/>{photo.caption&&<figcaption className="p-4 text-sm">{photo.caption}</figcaption>}</figure>)}</section>}{Boolean(page.documents?.length)&&<section aria-label="School documents" className="rounded-2xl border bg-white p-6"><h2 className="text-xl font-bold">School documents</h2><ul className="mt-3 space-y-3">{page.documents!.map(document=><li key={document.id}><a className="font-semibold text-blue-800 underline" href={websiteAssetUrl(document.id,preview)}>{document.label} (PDF)</a></li>)}</ul></section>}</>;
}
