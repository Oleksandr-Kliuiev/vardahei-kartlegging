import { h, render, type VNode } from 'preact';

export function App(): VNode {
  return h('main', null, h('h1', null, 'Varde'));
}

export function mount(root: Element): void {
  render(h(App, null), root);
}
