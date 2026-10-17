// «Personvern» (2.17): export, deletion, the yearly check of contacts and the journal in one place
// with four views. Behind them are the same pages and the same endpoints as before.
import { DeletionPage } from './deletion-page.js';
import { ExportPage } from './export-page.js';
import { KontaktSjekk } from './kontaktar.js';
import { Logg } from './logg.js';
import { Faner } from './widgets.js';

export const PERSONVERN = [
  ['eksport', 'Eksport'],
  ['sletting', 'Sletting'],
  ['kontaktar', 'Kontaktar'],
  ['logg', 'Logg'],
] as const;
type Tab = (typeof PERSONVERN)[number][0];
export const personvernTab = (tab: string | undefined): Tab =>
  PERSONVERN.find(([k]) => k === tab)?.[0] ?? 'eksport';

export function PersonvernPage({ tab }: { tab: string | undefined }) {
  const fane = personvernTab(tab);
  return (
    <>
      <Faner
        label="Personvern"
        items={PERSONVERN.map(([k, text]) => [`/admin/personvern/${k}`, text] as const)}
        current={`/admin/personvern/${fane}`}
      />
      {fane === 'eksport' && <ExportPage />}
      {fane === 'sletting' && <DeletionPage />}
      {fane === 'kontaktar' && <KontaktSjekk />}
      {fane === 'logg' && <Logg title="Logg" filter />}
    </>
  );
}
