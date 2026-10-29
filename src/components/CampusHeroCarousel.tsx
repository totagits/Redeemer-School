import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Camera } from 'lucide-react';

const slides = [
  {
    src: '/school-photos/featured/01-students-outdoors.webp',
    title: 'A welcoming learning community',
    description: 'Discover the joy of learning and growing together.',
    alt: 'Illustrative school scene with students seated at outdoor desks',
  },
  {
    src: '/school-photos/featured/02-classroom-learning.webp',
    title: 'Learning together',
    description: 'Building knowledge, confidence and curiosity in the classroom.',
    alt: 'Illustrative classroom scene with pupils seated at desks',
  },
  {
    src: '/school-photos/featured/03-campus-courtyard.webp',
    title: 'Room to grow',
    description: 'A welcoming environment for learning and school community.',
    alt: 'Illustrative school courtyard with academic buildings and pavilions',
  },
  {
    src: '/school-photos/featured/04-classroom-interior.webp',
    title: 'Space to achieve',
    description: 'Purposeful spaces that support academic excellence.',
    alt: 'Illustrative classroom interior with student desks and whiteboard',
  },
  {
    src: '/school-photos/featured/05-computer-laboratory.webp',
    title: 'Digital learning',
    description: 'Developing the skills and confidence for tomorrow.',
    alt: 'Illustrative computer laboratory with learners at desktop computers',
  },
  {
    src: '/school-photos/featured/06-science-laboratory.webp',
    title: 'Discover through science',
    description: 'Encouraging exploration, questions and hands-on learning.',
    alt: 'Illustrative science lesson with students and a microscope',
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
          className="h-full w-full object-cover object-center"
          loading={slideIndex === 0 ? 'eager' : 'lazy'}
          onError={() => setErrorSlides(previous => [...previous, slideIndex])} /> :
          <div className="grid h-full place-items-center bg-[#102c4f]"><Camera className="h-14 w-14 text-white/60" aria-label="School photograph unavailable"/></div>}
      </div>)}
    </div>
    <div className="flex flex-col gap-3 border-t border-white/15 bg-[#071d3e] px-4 py-3 text-white sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div aria-live="polite" className="min-w-0 flex-1">
        <h2 className="text-sm font-bold leading-snug sm:text-base">{slides[index].title}</h2>
        <p className="mt-0.5 text-xs leading-snug text-slate-200">{slides[index].description}</p>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-5 sm:justify-end">
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
    </div>
  </section>;
}
