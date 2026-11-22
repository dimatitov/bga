// SWR-009 §1.6: PT Mono 400 (all subsets incl. Cyrillic via unicode-range), bundled locally — no external font requests.
import '@fontsource/pt-mono/400.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';

const root = document.getElementById('root');
if (!root) throw new Error('#root element not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
