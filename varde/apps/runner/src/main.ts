import '@varde/ui/fonts.css';
import '@varde/ui/tokens.css';
import '@varde/ui/base.css';
import './style.css';
import './controls.css';
import './screens.css';
import './live/live.css';
import { mount } from './app.js';

const root = document.getElementById('app');
if (root) mount(root);
