import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App.js';

describe('admin app', () => {
  it('renders the Varde heading', () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const root = document.createElement('div');
    act(() => createRoot(root).render(<App />));
    expect(root.querySelector('h1')?.textContent).toBe('Varde');
  });
});
