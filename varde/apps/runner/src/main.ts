import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import './style.css';
import { mount } from './app.js';

const root = document.getElementById('app');
if (root) mount(root);
