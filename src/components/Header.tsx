import React from 'react';
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
          <button 
            onClick={() => onSelectView('home')}
            className="text-left group cursor-pointer focus:outline-hidden"
          >
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
          </button>
        </div>

        {/* Public landing navigation */}
        {currentView === 'home' ? (
          <nav className="hidden items-center gap-6 md:flex">
            <a href="#about" className="text-sm font-semibold text-slate-600 transition hover:text-slate-950">Our school</a>
            <a href="#academics" className="text-sm font-semibold text-slate-600 transition hover:text-slate-950">Academics</a>
            <a href="#admissions" className="text-sm font-semibold text-slate-600 transition hover:text-slate-950">Admissions</a>
            <a href="#community" className="text-sm font-semibold text-slate-600 transition hover:text-slate-950">News & families</a>
            <a href="#contact" className="text-sm font-semibold text-slate-600 transition hover:text-slate-950">Contact</a>
            {onPortalSignIn && <button onClick={onPortalSignIn} className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800">Student & guardian portal</button>}
          </nav>
        ) : (
        <>
        {/* Zone 2: ERP workspace navigation */}
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

      {/* Mobile Sub-Navigation Bar */}
      {currentView === 'home' ? (
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 md:hidden">
          <span className="text-[11px] font-medium text-slate-500">ERP workspace setup in progress</span>
          <span className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600">ERP setup in progress</span>
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
