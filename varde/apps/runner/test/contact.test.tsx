// The state screens show the contact of the finish screen (decision of Oleksandr 16.10): the
// default must stay equal to intro.contact of every seed template.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from 'preact';
import { describe, expect, it } from 'vitest';
import { VARDAHEI_CONTACT } from '../src/contact.js';
import { StateScreen } from '../src/screens.js';

const templates = resolve(import.meta.dirname, '../../../config/seed/templates');

describe('contact on the state screens', () => {
  it('equals intro.contact of every seed template', () => {
    const files = readdirSync(templates).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const t = JSON.parse(readFileSync(resolve(templates, f), 'utf8')) as {
        content: { intro: { contact: unknown } };
      };
      expect(t.content.intro.contact, f).toEqual(VARDAHEI_CONTACT);
    }
  });
  it('is shown on every state screen but not while loading', () => {
    const root = document.createElement('div');
    for (const kind of ['invalid', 'closed', 'revoked', 'offline'] as const) {
      render(<StateScreen kind={kind} lang="nn" />, root);
      expect(root.querySelector('.kontakt'), kind).not.toBeNull();
      expect(root.textContent).toContain('Vardahei IT');
      expect(root.textContent).toContain('+47 930 94 567');
      expect(root.textContent).toContain('post@vardahei.no');
      expect(root.textContent).toContain('Måndag til fredag 08–16');
    }
    render(<StateScreen kind="invalid" lang="en" />, root);
    expect(root.textContent).toContain('Monday to Friday 08–16');
    render(<StateScreen kind="loading" lang="nn" />, root);
    expect(root.querySelector('.kontakt')).toBeNull();
    render(null, root);
  });
});
