import { h, render } from 'preact';
import { App } from './app-view.js';

/** Runner entry point remains stable for main.ts and the repository context map. */
export function mount(root: Element): void {
  render(h(App, null), root);
}
