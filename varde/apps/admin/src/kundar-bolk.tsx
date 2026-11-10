// «Legg til fleire kundar» (wave A): a campaign of 48 clients was 48 forms, or a script against the
// API. Here the list is pasted, read back in words before anything is written, and names that are
// already clients are left alone — so running it twice adds nothing twice.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { mutate } from './api.js';
import type { Client } from './models.js';
import { byNorsk } from './norsk.js';
import { ErrorMessage } from './queries.js';
import { useToast } from './shell.js';
import './kundar.css';

export interface BolkLinje {
  name: string;
  employee_count: number | null;
  tags: string[];
}

/** One line: «Daco», «Daco;25» or «Daco;25;IT,BIO». Empty lines and stray spaces are skipped. */
export function parseLinje(line: string): BolkLinje | null {
  const [name, count, tags] = line.split(';').map((p) => p.trim());
  if (!name) return null;
  const n = count ? Number(count) : Number.NaN;
  return {
    name: name.slice(0, 200),
    employee_count: Number.isInteger(n) && n >= 1 && n <= 9999 ? n : null,
    tags: [
      ...new Set(
        (tags ?? '')
          .split(',')
          .map((t) => t.trim().toLocaleLowerCase('nb').slice(0, 24))
          .filter(Boolean),
      ),
    ].slice(0, 6),
  };
}

/** What the pasted text will do: the new clients, and the names that are clients already. */
export function framsyn(text: string, known: readonly Client[]) {
  const seen = new Map(known.map((c) => [c.name.trim().toLocaleLowerCase('nb'), c.name]));
  const nye: BolkLinje[] = [];
  const finst: string[] = [];
  for (const line of text.split('\n')) {
    const parsed = parseLinje(line);
    if (!parsed) continue;
    const key = parsed.name.toLocaleLowerCase('nb');
    if (seen.has(key)) finst.push(parsed.name);
    else {
      seen.set(key, parsed.name);
      nye.push(parsed);
    }
  }
  return { nye, finst: finst.sort(byNorsk) };
}

export function LeggTilFleire({
  known,
  onClose,
}: {
  known: readonly Client[];
  onClose: () => void;
}) {
  const queries = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { nye, finst } = framsyn(text, known);
  async function save() {
    setBusy(true);
    setError(null);
    try {
      const done = await mutate<{ created: { id: string }[]; skipped: string[] }>(
        '/api/admin/clients/batch',
        'POST',
        { clients: nye },
      );
      await queries.invalidateQueries({ queryKey: ['rounds'] });
      toast(
        `${done.created.length} ${done.created.length === 1 ? 'kunde er lagd' : 'kundar er lagde'} til.`,
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Kundane blei ikkje lagde til.'));
      setBusy(false);
    }
  }
  return (
    <section className="del rom-ny bolk" aria-labelledby="bolk-tittel">
      <h2 id="bolk-tittel">Legg til fleire kundar</h2>
      <label className="field">
        <span>Eitt namn per linje</span>
        <textarea
          className="input bolk-felt"
          value={text}
          aria-describedby="bolk-hjelp"
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <p className="forklaring" id="bolk-hjelp">
        Du kan skrive tal på tilsette og merkelappar etter semikolon: <code>Daco;25;it</code>. Namn
        som alt er kundar, blir ikkje rørte.
      </p>
      {text.trim() !== '' && (
        <p className="bolk-framsyn" role="status">
          <span>
            {nye.length === 0
              ? 'Ingen nye kundar i lista.'
              : `${nye.length} ${nye.length === 1 ? 'ny kunde' : 'nye kundar'}: ${nye
                  .slice(0, 5)
                  .map((c) => c.name)
                  .join(', ')}${nye.length > 5 ? ` og ${nye.length - 5} til` : ''}.`}
          </span>
          {finst.length > 0 && (
            <span>
              {finst.length} {finst.length === 1 ? 'finst' : 'finst'} alt og blir ikkje rørt
              {finst.length === 1 ? '' : 'e'}: {finst.slice(0, 5).join(', ')}
              {finst.length > 5 ? ` og ${finst.length - 5} til` : ''}.
            </span>
          )}
        </p>
      )}
      <ErrorMessage error={error} />
      <div className="knappar">
        <button
          type="button"
          className="btn primary"
          disabled={busy || nye.length === 0}
          onClick={() => void save()}
        >
          {nye.length === 1 ? 'Legg til kunden' : `Legg til ${nye.length} kundar`}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={onClose}>
          Avbryt
        </button>
      </div>
    </section>
  );
}
