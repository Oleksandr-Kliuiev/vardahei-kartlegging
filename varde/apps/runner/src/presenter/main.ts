// Entry of the big screen `/p` (3.5): a third page of the runner build, same tokens, fonts and CSP.
import '@varde/ui/fonts.css';
import '@varde/ui/tokens.css';
import '@varde/ui/base.css';
import './presenter.css';
import { h, render } from 'preact';
import { PresenterApp } from './app.js';

const root = document.getElementById('app');
if (root) render(h(PresenterApp, null), root);
