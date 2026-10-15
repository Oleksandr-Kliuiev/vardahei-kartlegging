// Editor of one FindingRule (2.5): texts, thresholds and answers on the left, the live preview with
// «Lagre som versjon N+1» beside it, the versions below. Saving never changes a version: it adds one.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ease, reduced, stagger } from '@varde/ui/motion';
import { api, ApiError, mutate } from './api.js';
import { Answers, Limits, TextPair } from './funn-fields.js';
import {
  FIELD_NAMES,
  problems,
  type Rule,
  type RuleDetail,
  example,
  summary,
} from './funn-models.js';
import { FindingPreview } from './funn-preview.js';
import { longDate } from './overview.js';
import { ErrorMessage } from './queries.js';
import { useToast } from './shell.js';
import { Seg } from './widgets.js';

const sorted = (r: Rule) => JSON.stringify({ ...r, options: [...r.options].sort() });
const time = (iso: string) => {
  const d = new Date(iso);
  return `${longDate(d)}, kl. ${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
};

export function RuleEditor({
  ruleKey,
  onDirty,
}: {
  ruleKey: string;
  onDirty: (dirty: boolean) => void;
}) {
  const detail = useQuery({
    queryKey: ['findings', 'rule', ruleKey],
    queryFn: () => api<RuleDetail>(`/api/admin/finding-rules/${encodeURIComponent(ruleKey)}`),
  });
  const data = detail.data;
  if (!data?.rule)
    return (
      <section className="kort funn-redigering" id="funn-redigering">
        <div className="kort-innhald">
          <ErrorMessage error={detail.error} />
          {!detail.error && <p className="muted">Hentar regelen …</p>}
        </div>
      </section>
    );
  return <EditorForm key={data.key} detail={data} onDirty={onDirty} />;
}

function EditorForm({ detail, onDirty }: { detail: RuleDetail; onDirty: (d: boolean) => void }) {
  const client = useQueryClient(),
    toast = useToast();
  const [draft, setDraft] = useState<Rule>(detail.rule);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<Error | null>(null);
  const fields = useRef<HTMLDivElement>(null);
  const rule = detail.rule;
  const dirty = sorted(draft) !== sorted(rule);
  const issues = problems(draft, detail);
  const set = (change: Partial<Rule>) => setDraft((d) => ({ ...d, ...change }));
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  // A new version (saved here, or fetched after a conflict) becomes the base; the form stays put,
  // so the preview keeps its round and client and nothing enters again.
  const seen = useRef(rule.version);
  useEffect(() => {
    if (seen.current === rule.version) return;
    seen.current = rule.version;
    setDraft(rule);
    setError(null);
  }, [rule]);
  // A newly chosen rule enters field by field; with reduced motion it is simply there.
  useLayoutEffect(() => {
    if (!fields.current || reduced()) return;
    void stagger(
      fields.current.children,
      [
        { opacity: 0, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 380, step: 35, max: 6, easing: ease.inn, fill: 'backwards' },
    );
  }, []);
  async function save() {
    setBusy(true);
    setError(null);
    try {
      const body: Partial<Rule> = { ...draft };
      delete body.version;
      const saved = await mutate<{ version: number }>(
        `/api/admin/finding-rules/${encodeURIComponent(rule.key)}/versions`,
        'POST',
        { base_version: rule.version, rule: body },
      );
      toast(`Lagra som versjon ${saved.version}.`);
      await client.invalidateQueries({ queryKey: ['findings'] });
      void client.invalidateQueries({ queryKey: ['responses'] });
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Kunne ikkje lagre.'));
    } finally {
      setBusy(false);
    }
  }
  const ids = detail.questions.map((q) => q.id).join(' × ');
  const about = detail.questions.find((q) => q.id === (rule.question ?? q.id))?.label ?? '';
  return (
    <>
      <section className="kort funn-redigering" id="funn-redigering" aria-labelledby="funn-tittel">
        <div className="kort-hovud">
          <h2 id="funn-tittel">
            <span className="kjeldebrikke">{ids || rule.key}</span> {about}
          </h2>
          <span className="merkelappar">
            <span className="chip">Versjon {rule.version}</span>
            {dirty && <span className="chip warn">Ikkje lagra</span>}
          </span>
        </div>
        <div className="kort-innhald felt-grid" ref={fields}>
          <TextPair
            legend="Funnet"
            hint={`Slik står det i dashbordet: «${example(draft)}».${detail.placeholders.length ? ` Plasshaldarar: ${detail.placeholders.map((p) => `{${p}}`).join(', ')}.` : ''}`}
            value={draft.text}
            onChange={(text) => set({ text })}
          />
          <TextPair
            legend="Kva vi gjer"
            hint="Står som «Forslag» under funnet."
            value={draft.action_text}
            onChange={(action_text) => set({ action_text })}
          />
          <Limits draft={draft} set={set} />
          <Answers detail={detail} draft={draft} set={set} />
          <div className="field">
            <span>Type funn</span>
            <Seg
              label="Type funn"
              value={draft.severity}
              options={[
                ['risk', 'Risiko'],
                ['opportunity', 'Moglegheit'],
              ]}
              onChange={(severity) => set({ severity })}
            />
          </div>
        </div>
      </section>
      <FindingPreview detail={detail} draft={draft} dirty={dirty}>
        <div className="lagring">
          {dirty &&
            issues.map((p) => (
              <p role="alert" key={p}>
                {p}
              </p>
            ))}
          <ErrorMessage error={error} />
          {error instanceof ApiError && error.status === 409 && (
            <button
              type="button"
              className="linkbtn"
              onClick={() => void client.invalidateQueries({ queryKey: ['findings'] })}
            >
              Hent nyaste versjon
            </button>
          )}
          <div className="handlingar">
            <button
              type="button"
              className="btn primary"
              disabled={!dirty || issues.length > 0 || busy}
              onClick={() => void save()}
            >
              Lagre som versjon {rule.version + 1}
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={!dirty || busy}
              onClick={() => setDraft(rule)}
            >
              Forkast endringane
            </button>
          </div>
          <p className="forklaring">
            Opne rundar får den nye versjonen med ein gong. Avslutta rundar held fram med funna dei
            fekk då dei vart avslutta.
          </p>
        </div>
      </FindingPreview>
      <section className="kort funn-historikk" aria-labelledby="versjonar-tittel">
        <div className="kort-hovud">
          <h2 id="versjonar-tittel">Versjonar</h2>
          <span className="muted">{detail.versions.length} i alt</span>
        </div>
        <ol className="versjonar kort-innhald">
          {detail.versions.map((v) => (
            <li key={v.version} aria-current={v.version === rule.version ? 'true' : undefined}>
              <span className="versjon-nr">v{v.version}</span>
              <span className="versjon-tekst">
                <b>{time(v.created_at)}</b>
                <small>
                  {v.version === 1 && !v.changed.length
                    ? 'Første versjon'
                    : `Endra: ${v.changed.map((f) => FIELD_NAMES[f] ?? f).join(', ')}`}
                  {' · '}
                  {summary(v.rule)}
                </small>
              </span>
              {v.version !== rule.version && (
                <button
                  type="button"
                  className="linkbtn"
                  onClick={() => setDraft({ ...v.rule, version: rule.version })}
                >
                  Hent inn i redigeringa
                </button>
              )}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
