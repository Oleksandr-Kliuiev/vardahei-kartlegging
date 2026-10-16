// Contact card of Vardahei IT. The finish screen shows the template's intro.contact; the state
// screens (broken, closed or replaced link, no network) have no template, so they show
// VARDAHEI_CONTACT, which equals intro.contact of every seed template (test/contact.test.tsx).
import { useState } from 'preact/hooks';
import type { TemplateContent } from '@varde/schema/template/template';
import type { Lang } from '@varde/schema/template/texts';
import { animate, ease } from '@varde/ui/motion';
import { text, ui } from './i18n/ui.js';

export type Contact = TemplateContent['intro']['contact'];

export const VARDAHEI_CONTACT: Contact = {
  name: 'Vardahei IT',
  phone: '+47 930 94 567',
  email: 'post@vardahei.no',
  hours: { nn: 'Måndag til fredag 08–16', en: 'Monday to Friday 08–16' },
};

function CopyRow({ value, lang }: { value: string; lang: Lang }) {
  const [copied, setCopied] = useState(false);
  return (
    <div class="kontakt-rad">
      <b class="tnum">{value}</b>
      <button
        type="button"
        class="btn sm"
        onClick={(e) => {
          const button = e.currentTarget;
          void navigator.clipboard?.writeText(value).catch(() => undefined);
          setCopied(true);
          void animate(button, [{ transform: 'scale(.92)' }, { transform: 'none' }], {
            duration: 420,
            easing: ease.sprett,
          });
          setTimeout(() => setCopied(false), 1600);
        }}
      >
        {ui(lang, copied ? 'kopiert' : 'kopier')}
      </button>
    </div>
  );
}

export function ContactCard({ contact, lang }: { contact: Contact; lang: Lang }) {
  return (
    <section class="kontakt anim">
      <h2>{ui(lang, 'kontakt')}</h2>
      <div class="kontakt-rad">
        <b>{contact.name}</b>
      </div>
      <CopyRow value={contact.phone} lang={lang} />
      <CopyRow value={contact.email} lang={lang} />
      <small class="muted">{text(contact.hours, lang)}</small>
    </section>
  );
}
