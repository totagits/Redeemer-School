import {PublicWebsiteContentProvider} from './components/PublishedWebsiteContent.tsx';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {INSTITUTION,IS_CONFIGURED_INSTITUTION} from './data/institution.ts';

if(IS_CONFIGURED_INSTITUTION){
  document.body.classList.add('institution-themed');
  document.documentElement.style.setProperty('--school-primary',INSTITUTION.primaryColor);
  document.documentElement.style.setProperty('--school-secondary',INSTITUTION.secondaryColor||INSTITUTION.primaryColor);
  document.documentElement.style.setProperty('--school-accent',INSTITUTION.accentColor);
}

createRoot(document.getElementById('root')!).render(<PublicWebsiteContentProvider><App /></PublicWebsiteContentProvider>);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' });
  });
}
