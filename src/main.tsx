import {PublicWebsiteContentProvider} from './components/PublishedWebsiteContent.tsx';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<PublicWebsiteContentProvider><App /></PublicWebsiteContentProvider>);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' });
  });
}
