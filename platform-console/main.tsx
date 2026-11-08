import React from 'react';
import {createRoot} from 'react-dom/client';
import {ConsoleApp} from './ConsoleApp.tsx';
import './style.css';
createRoot(document.getElementById('root')!).render(<ConsoleApp/>);
