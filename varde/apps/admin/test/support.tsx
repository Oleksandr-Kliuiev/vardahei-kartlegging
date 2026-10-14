import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../src/App.js';

export class TestStream extends EventTarget {
  static streams: TestStream[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(readonly url: string) {
    super();
    TestStream.streams.push(this);
  }
  close() {
    this.closed = true;
  }
  changed(topic: string) {
    this.dispatchEvent(new MessageEvent('changed', { data: JSON.stringify({ topic }) }));
  }
}

export function mount(element: ReactNode, provider = false) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const div = document.createElement('div');
  document.body.appendChild(div);
  let root: Root;
  const client = createQueryClient();
  act(() => {
    root = createRoot(div);
    root.render(
      provider ? <QueryClientProvider client={client}>{element}</QueryClientProvider> : element,
    );
  });
  return {
    div,
    client,
    close: () => {
      act(() => {
        root.unmount();
      });
      client.clear();
      div.remove();
    },
  };
}
export async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
}
export function button(div: HTMLElement, name: string) {
  const b = [...div.querySelectorAll('button')].find((b) => b.textContent === name);
  if (!b) throw new Error(`missing button ${name}`);
  return b;
}
