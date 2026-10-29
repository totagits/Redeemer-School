import { publicSchoolNavigation } from './PublicSchoolPages.tsx';
import React, { useEffect, useRef, useState } from 'react';
import { 
  Home,
  Building2, 
  Layers, 
  DollarSign, 
  Users, 
  Package, 
  FileCode, 
  BarChart3, 
  ShieldCheck,
  GraduationCap,
  ChevronDown,
  ArrowUpRight,
  Menu,
  X,
} from 'lucide-react';
import { THE_REDEEMER_SCHOOL_INFO } from '../data/schoolProfile.ts';
import { SCHOOL_CONTACT } from '../data/schoolContact.ts';

export type ERPView = 
  | 'home'
  | 'dashboard' 
  | 'students'
  | 'finance' 
  | 'hr' 
  | 'inventory' 
  | 'reports' 
  | 'users' 
  | 'architecture';

interface HeaderProps {
  currentView: ERPView;
  onSelectView: (view: ERPView) => void;
  lowStockCount: number;
  onSignIn: () => void;
  onPortalSignIn?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onSelectView,
  lowStockCount,
  onSignIn,
  onPortalSignIn,
}) => {
  const [openMenu,setOpenMenu]=useState<string|null>(null);
  const [mobileMenuOpen,setMobileMenuOpen]=useState(false);
  const desktopNavRef=useRef<HTMLElement|null>(null);
  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpenMenu(null);setMobileMenuOpen(false);}};
    const onPointer=(event:PointerEvent)=>{if(desktopNavRef.current&&!desktopNavRef.current.contains(event.target as Node))setOpenMenu(null);};
    document.addEventListener('keydown',onKey);document.addEventListener('pointerdown',onPointer);
    return ()=>{document.removeEventListener('keydown',onKey);document.removeEventListener('pointerdown',onPointer);};
  },[]);

  const navItems: Array<{ id: ERPView; label: string; icon: React.ReactNode; badge?: number }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <Layers className="w-3.5 h-3.5" /> },
    { id: 'students', label: 'Students & Admissions', icon: <GraduationCap className="w-3.5 h-3.5 text-blue-600" /> },
    { id: 'finance', label: 'Finance & Bursar', icon: <DollarSign className="w-3.5 h-3.5" /> },
    { id: 'hr', label: 'Faculty & HR', icon: <Users className="w-3.5 h-3.5" /> },
    { id: 'inventory', label: 'School Store', icon: <Package className="w-3.5 h-3.5" />, badge: lowStockCount },
    { id: 'reports', label: 'Reports & MoE', icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { id: 'users', label: 'User Access', icon: <ShieldCheck className="w-3.5 h-3.5" /> },
    { id: 'architecture', label: 'Architecture', icon: <FileCode className="w-3.5 h-3.5" /> }
  ];

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        
        {/* Zone 1: Single Brand element */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-white ring-1 ring-amber-400/50 shadow-sm overflow-hidden shrink-0">
            <img src="/redeemer-seal.svg?v=2" alt="Redeemer's International Academy seal" className="w-full h-full object-contain" />
          </div>
          <a href="/" className="text-left group cursor-pointer focus:outline-hidden">
            <div className="flex items-center gap-2">
              <span className="text-base font-extrabold text-slate-900 tracking-tight whitespace-nowrap block group-hover:text-blue-900 transition-colors">
                {THE_REDEEMER_SCHOOL_INFO.name}
              </span>
              <span className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-200/80 rounded-md">
                Est. {THE_REDEEMER_SCHOOL_INFO.founded}
              </span>
            </div>
            <span className="text-[11px] text-slate-500 font-medium whitespace-nowrap block">
              Academic and Moral Excellence · Paynesville
            </span>
          </a>
        </div>

        {currentView === 'home' ? null : (
        <>
        {/* Internal workspace navigation is not rendered for signed-out visitors. */}
        <nav className="hidden lg:flex items-center gap-1">
          <button onClick={() => onSelectView('home')} className="px-2.5 py-1.5 text-xs font-semibold rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5">
            <Home className="w-3.5 h-3.5" /> Home
          </button>
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onSelectView(item.id)}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                currentView === item.id
                  ? 'bg-slate-100 text-slate-900 font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              {item.icon}
              {item.label}
              {item.badge !== undefined && item.badge > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 text-[10px] bg-amber-100 text-amber-800 rounded-sm font-bold">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
          <details className="relative shrink-0">
            <summary className="list-none px-2.5 py-1.5 text-xs font-semibold rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> Contact
            </summary>
            <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-700 shadow-xl z-50">
              <p className="font-bold text-slate-900">Redeemer's International Academy</p>
              <p className="mt-2 leading-relaxed">{SCHOOL_CONTACT.address}</p>
              <div className="mt-3 flex flex-col gap-1.5">
                {SCHOOL_CONTACT.phones.map((phone) => (
                  <a key={phone} href={`tel:${phone}`} className="font-semibold text-blue-700 hover:text-blue-900">{phone}</a>
                ))}
              </div>
            </div>
          </details>
        </nav>
        </>)}

      </div>

      {currentView==='home'&&<div className="hidden border-t border-slate-200 bg-white xl:block"><div className="mx-auto max-w-7xl">          <nav ref={desktopNavRef} aria-label="School website navigation" className="mx-auto flex max-w-7xl items-center justify-between gap-1 px-4">
            <a href="/" className="rounded-md px-2.5 py-3 text-sm font-bold text-slate-800 hover:bg-blue-50">Home</a>
            {publicSchoolNavigation.map((group,index)=><div key={group.label} className="relative"
              onMouseEnter={()=>setOpenMenu(group.label)}
              onMouseLeave={()=>setOpenMenu(current=>current===group.label?null:current)}>
              <button type="button" aria-controls={`school-menu-${index}`} aria-expanded={openMenu===group.label}
                onClick={()=>setOpenMenu(current=>current===group.label?null:group.label)}
                className={`flex items-center gap-1 rounded-md border-b-[3px] px-2 py-3 text-sm font-bold transition-all duration-200 ${openMenu===group.label?'border-amber-400 bg-blue-950 text-white':'border-transparent text-slate-800 hover:border-amber-400 hover:bg-blue-50'}`}>
                {group.label}<ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform duration-200 ${openMenu===group.label?'rotate-180':''}`}/>
              </button>
              <div id={`school-menu-${index}`} aria-label={`${group.label} submenu`} aria-hidden={openMenu!==group.label}
                className={`absolute top-full z-[100] w-[min(34rem,90vw)] origin-top rounded-b-xl border-t-4 border-amber-400 bg-white p-5 shadow-[0_25px_60px_rgba(4,20,52,.25)] ring-1 ring-slate-200 transition-all duration-200 ease-out ${index>3?'right-0':'left-0'} ${openMenu===group.label?'visible translate-y-0 scale-100 opacity-100':'invisible pointer-events-none -translate-y-2 scale-[.98] opacity-0'}`}>
                <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3"><span className="text-xs font-extrabold uppercase tracking-[.16em] text-blue-900">{group.label}</span><span className="text-xs text-slate-500">Explore Redeemer</span></div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {group.items.map(item=><a key={item.slug} tabIndex={openMenu===group.label?0:-1} onClick={()=>setOpenMenu(null)}
                    href={item.slug==='apply-online'?'/apply':item.slug==='student-portal'||item.slug==='guardian-portal'?'/portal':`/school/${item.slug}`}
                    className="group flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-blue-50 hover:text-blue-900 focus-visible:bg-blue-50 focus-visible:outline-blue-600">
                    <span>{item.label}</span><ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"/>
                  </a>)}
                </div>
              </div>
            </div>)}
            <a href="/portal" className="ml-1 shrink-0 rounded-md bg-blue-800 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-blue-950">Family Portal</a>
          </nav>
</div></div>}
      
      {/* Responsive school menu with expandable page groups. */}
      {currentView === 'home' ? (
        <div className="border-t border-slate-100 bg-white xl:hidden">
          <button type="button" aria-label={mobileMenuOpen?'Close school menu':'Open school menu'} aria-expanded={mobileMenuOpen}
            onClick={()=>setMobileMenuOpen(current=>!current)}
            className="flex w-full items-center justify-between px-5 py-3 text-sm font-extrabold text-blue-950">
            Explore Redeemer {mobileMenuOpen?<X className="h-5 w-5"/>:<Menu className="h-5 w-5"/>}
          </button>
          {mobileMenuOpen&&<nav aria-label="Mobile school navigation" className="max-h-[70vh] overflow-y-auto border-t border-slate-100 px-4 pb-4">
            <a href="/" className="block border-b border-slate-100 px-3 py-3 text-sm font-bold">Home</a>
            {publicSchoolNavigation.map(group=><details key={group.label} className="group border-b border-slate-100">
              <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3 text-sm font-extrabold text-slate-800">{group.label}<ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180"/></summary>
              <div className="grid grid-cols-1 gap-1 rounded-lg bg-blue-50/60 p-2 sm:grid-cols-2">
                {group.items.map(item=><a key={item.slug} className="rounded-md px-3 py-2.5 text-sm text-slate-700 hover:bg-white"
                  href={item.slug==='apply-online'?'/apply':item.slug==='student-portal'||item.slug==='guardian-portal'?'/portal':`/school/${item.slug}`}>{item.label}</a>)}
              </div>
            </details>)}
            <a href="/portal" className="mt-3 block rounded-lg bg-blue-800 px-4 py-3 text-center text-sm font-extrabold text-white">Student & Guardian Portal</a>
          </nav>}
        </div>
      ) : <div className="lg:hidden flex items-center gap-1 px-4 py-2 border-t border-slate-100 overflow-x-auto bg-slate-50">
        <button onClick={() => onSelectView('home')} className="px-2.5 py-1 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 flex items-center gap-1 text-slate-600 bg-white border border-slate-200 cursor-pointer"><Home className="w-3.5 h-3.5" /> Home</button>
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelectView(item.id)}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer ${
              currentView === item.id
                ? 'bg-slate-900 text-white font-bold'
                : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
        <details className="relative shrink-0">
            <summary className="list-none px-2.5 py-1.5 text-xs font-semibold rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> Contact
            </summary>
            <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-700 shadow-xl z-50">
              <p className="font-bold text-slate-900">Redeemer's International Academy</p>
              <p className="mt-2 leading-relaxed">{SCHOOL_CONTACT.address}</p>
              <div className="mt-3 flex flex-col gap-1.5">
                {SCHOOL_CONTACT.phones.map((phone) => (
                  <a key={phone} href={`tel:${phone}`} className="font-semibold text-blue-700 hover:text-blue-900">{phone}</a>
                ))}
              </div>
            </div>
          </details>
      </div>}
    </header>
  );
};
