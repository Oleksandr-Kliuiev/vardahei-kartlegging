import { describe, expect, it } from 'vitest';
import { mount } from '../src/app.js';

describe('runner app', () => {
  it('renders the Varde heading', () => {
    const root = document.createElement('div');
    mount(root);
    expect(root.querySelector('h1')?.textContent).toBe('Varde');
  });
});
