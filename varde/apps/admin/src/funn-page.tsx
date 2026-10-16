// Funn (2.5): the rules behind the findings in the dashboard. Choose the questionnaire and the part,
// then a rule; edit it beside a live preview and save it as a new version.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reduced } from '@varde/ui/motion';
import { api } from './api.js';
import { RuleEditor } from './funn-editor.js';
import {
  type Channel,
  type Family,
  type PreviewScope,
  type RuleSummary,
  familyOf,
  plain,
  summary,
} from './funn-models.js';
import { ErrorMessage } from './queries.js';
import { Seg } from './widgets.js';
import './funn.css';

const FAMILIES = [
  ['tryggleik', 'Tryggleik'],
  ['ki', 'KI'],
] as const;
const CHANNELS = [
  ['aggregate', 'Felles del'],
  ['leader', 'Leiar'],
] as const;
const LEAVE = 'Du har endringar som ikkje er lagra. Vil du gå vidare utan å lagre?';

export function FindingsPage() {
  // «Regelen har ein nyare versjon» in the dashboard links here with ?rule=<key>.
  const asked = useRef(new URLSearchParams(window.location.search).get('rule'));
  const [family, setFamily] = useState<Family>(
    asked.current ? familyOf(asked.current) : 'tryggleik',
  );
  const [channel, setChannel] = useState<Channel>('aggregate');
  const [selected, setSelected] = useState<string | null>(asked.current);
  const [scopes, setScopes] = useState<Partial<Record<Family, PreviewScope>>>({});
  const onScope = useCallback(
    (scope: PreviewScope) => setScopes((all) => ({ ...all, [family]: scope })),
    [family],
  );
  const dirty = useRef(false);
  const onDirty = useCallback((d: boolean) => {
    dirty.current = d;
  }, []);
  const list = useQuery({
    queryKey: ['findings', 'rules', family, channel],
    queryFn: () =>
      api<RuleSummary[]>(`/api/admin/finding-rules?family=${family}&channel=${channel}`),
  });
  const rules = Array.isArray(list.data) ? list.data : [];
  useEffect(() => {
    if (!list.data || (selected && rules.some((r) => r.key === selected))) return;
    // A linked rule of the leader channel is not in the first list: look there once.
    if (selected && selected === asked.current && channel === 'aggregate') {
      setChannel('leader');
      return;
    }
    asked.current = null;
    setSelected(rules[0]?.key ?? null);
  }, [list.data]);
  const leave = () => !dirty.current || window.confirm(LEAVE);
  function choose(key: string) {
    if (key === selected || !leave()) return;
    setSelected(key);
    if (window.matchMedia?.('(max-width: 860px)').matches)
      requestAnimationFrame(() =>
        document
          .getElementById('funn-redigering')
          ?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }),
      );
  }
  return (
    <>
      <p className="ingress funn-ingress">
        Reglane bak funna i dashbordet. Ei endring blir lagra som ein ny versjon, og du ser med ein
        gong kva ho gjer med tala i ein runde.
      </p>
      <div className="funn-filter">
        <Seg
          label="Skjema"
          value={family}
          options={FAMILIES}
          onChange={(v) => {
            if (v !== family && leave()) {
              asked.current = null;
              setFamily(v);
              setSelected(null);
            }
          }}
        />
        <Seg
          label="Del"
          value={channel}
          options={CHANNELS}
          onChange={(v) => {
            if (v !== channel && leave()) {
              asked.current = null;
              setChannel(v);
              setSelected(null);
            }
          }}
        />
      </div>
      <ErrorMessage error={list.error} />
      <div className="funn-flate">
        <section className="kort funn-liste" aria-labelledby="reglar-tittel">
          <div className="kort-hovud">
            <h2 id="reglar-tittel">Reglar</h2>
            <span className="muted">{list.data ? `${rules.length} i alt` : 'Hentar …'}</span>
          </div>
          <ul className="regel-liste">
            {rules.map((s) => (
              <li key={s.key}>
                <button
                  type="button"
                  className="regel-rad"
                  aria-current={s.key === selected ? 'true' : undefined}
                  onClick={() => choose(s.key)}
                >
                  <span className="regel-topp">
                    <span className="kjeldebrikke">
                      {s.questions.map((q) => q.id).join(' × ') || s.key}
                    </span>
                    <span className={s.versions > 1 ? 'chip accent' : 'chip'}>v{s.version}</span>
                  </span>
                  <span className="regel-tekst">{plain(s.rule.text.nn)}</span>
                  <span className="regel-meta">{summary(s.rule)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <div className="funn-arbeid">
          {selected ? (
            <RuleEditor
              key={selected}
              ruleKey={selected}
              onDirty={onDirty}
              scope={scopes[family] ?? { round: '', client: 'alle' }}
              onScope={onScope}
            />
          ) : (
            <section className="kort funn-redigering">
              <p className="tom">{list.data ? 'Vel ein regel i lista.' : 'Hentar reglane …'}</p>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
