import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Camera } from 'lucide-react';

const slides = [
  {
    src: '/school-photos/campus-exterior.svg',
    title: 'Discover our campus',
    description: 'Redeemer’s International Academy · Thinker’s Village, Paynesville',
    alt: 'Exterior view of the Redeemer’s International Academy school campus',
  },
  {
    src: '/school-photos/campus-courtyard.svg',
    title: 'A place to grow',
    description: 'A view of Redeemer’s International Academy courtyard',
    alt: 'Courtyard at Redeemer’s International Academy',
  },
];

export function CampusHeroCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [errorSlides, setErrorSlides] = useState<number[]>([]);
  useEffect(() => {
    if (paused || errorSlides.includes(index)) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const interval = window.setInterval(() => setIndex(previous => (previous + 1) % slides.length), 6500);
    return () => window.clearInterval(interval);
  }, [paused, index, errorSlides]);
  const previous = () => setIndex(current => (current - 1 + slides.length) % slides.length);
  const next = () => setIndex(current => (current + 1) % slides.length);

  return <section aria-label="Redeemer campus photo carousel" aria-roledescription="carousel"
    onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
    onFocusCapture={() => setPaused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}
    onKeyDown={event => { if (event.key === 'ArrowLeft') { event.preventDefault(); previous(); } if (event.key === 'ArrowRight') { event.preventDefault(); next(); } }}
    className="relative w-full overflow-hidden rounded-2xl border border-white/20 bg-[#102c4f] shadow-[0_25px_65px_rgba(0,0,0,.28)]">
    <div className="relative aspect-video w-full min-h-[260px] sm:min-h-0">
      {slides.map((slide, slideIndex) => <div key={slide.src} aria-hidden={index !== slideIndex}
        className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${index === slideIndex ? 'z-10 opacity-100' : 'pointer-events-none opacity-0'}`}>
        {!errorSlides.includes(slideIndex) ? <img src={slide.src} alt={slide.alt}
          className="h-full w-full object-cover object-center [filter:contrast(1.06)_saturate(1.08)]"
          loading={slideIndex === 0 ? 'eager' : 'lazy'}
          onError={() => setErrorSlides(previous => [...previous, slideIndex])} /> :
          <div className="grid h-full place-items-center bg-[#102c4f]"><Camera className="h-14 w-14 text-white/60" aria-label="School photograph unavailable"/></div>}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#071d3e]/95 via-[#071d3e]/40 to-transparent"/>
        <div className="absolute inset-x-0 bottom-0 px-5 pb-14 pt-10 text-white sm:px-8 sm:pb-16">
          <span className="text-[10px] font-bold uppercase tracking-[.2em] text-amber-300">Redeemer’s International Academy</span>
          <h2 className="mt-2 text-xl font-extrabold tracking-tight sm:text-3xl">{slide.title}</h2>
          <p className="mt-2 max-w-lg text-xs text-slate-100 sm:text-sm">{slide.description}</p>
        </div>
      </div>)}
    </div>
    <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between px-5 pb-3 sm:px-8 sm:pb-4">
      <div aria-label="Choose a campus photograph" className="flex items-center gap-2">
        {slides.map((slide, slideIndex) => <button type="button" key={slide.src}
          aria-label={`Show photo ${slideIndex + 1}: ${slide.title}`}
          aria-current={index === slideIndex ? 'true' : undefined}
          onClick={() => setIndex(slideIndex)}
          className={`h-2.5 rounded-full border border-white/70 transition-all duration-200 ${index === slideIndex ? 'w-8 bg-amber-400' : 'w-2.5 bg-white/50 hover:bg-white'}`}/>)}
      </div>
      <div className="flex gap-2">
        <button type="button" aria-label="Previous campus photograph" onClick={previous} className="grid h-9 w-9 place-items-center rounded-full border border-white/40 bg-[#071d3e]/70 text-white transition hover:border-white hover:bg-[#071d3e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"><ArrowLeft className="h-4 w-4"/></button>
        <button type="button" aria-label="Next campus photograph" onClick={next} className="grid h-9 w-9 place-items-center rounded-full border border-white/40 bg-[#071d3e]/70 text-white transition hover:border-white hover:bg-[#071d3e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"><ArrowRight className="h-4 w-4"/></button>
      </div>
    </div>
  </section>;
}
