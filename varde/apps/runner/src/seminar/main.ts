// Entry of the seminar page `/s` (3.2): a second page of the runner build, same tokens and CSP.
import '@varde/ui/fonts.css';
import '@varde/ui/tokens.css';
import '@varde/ui/base.css';
// The shared stylesheets in the order of the survey's main.ts, so the survey's cascade stays as it was.
import '../style.css';
import '../controls.css';
import '../screens.css';
import './seminar.css';
import { h, render } from 'preact';
import { SeminarPage } from './page.js';

const root = document.getElementById('app');
if (root) render(h(SeminarPage, null), root);
