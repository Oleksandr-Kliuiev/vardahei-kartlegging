import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { setTheme } from '@varde/ui/motion';
import '@varde/ui/fonts.css';
import '@varde/ui/tokens.css';
import '@varde/ui/base.css';
import './style.css';
import './shell.css';
import { App } from './App.js';
import { storedTheme } from './shell.js';

// The chosen theme applies before the first paint, so a dark-mode user never sees a light flash.
setTheme(storedTheme());
const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
