// Live preview of a FindingRule draft (2.5): the current version and the draft on the cells the
// dashboard reads for one round and «alle» or one client. Only the fields that decide the outcome go
// to the server, after a short pause in typing; text edits never trigger a new read.
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { animate, ease } from '@varde/ui/motion';
import { api } from './api.js';
import {
  evalPart,
  familyOf,
  levelName,
  numbers,
  type Outcome,
  type Preview,
  type PreviewScope,
  type Rule,
  type RuleDetail,
} from './funn-models.js';
import { ErrorMessage, useRounds, useVersions } from './queries.js';

function useDebounced<T>(value: T, ms: number) {
  const [settled, set] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => set(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/** One version's result; it springs once when the result changes (not on every render). */
function Line({
  label,
  outcome,
  severity,
}: {
  label: string;
  outcome: Outcome;
  severity: Rule['severity'];
}) {
  const el = useRef<HTMLDivElement>(null),
    said = useRef('');
  const text = `${numbers(outcome)}|${outcome.kind === 'finding' ? outcome.level : outcome.kind}`;
  useEffect(() => {
    if (said.current && said.current !== text)
      void animate(
        el.current,
        [
          { transform: 'scale(.97)', opacity: 0.55 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 420, easing: ease.fjor, fill: 'none' },
      );
    said.current = text;
  }, [text]);
  return (
    <div className={`utfall ${outcome.kind}`} ref={el}>
      <span className="utfall-namn">{label}</span>
      <span className="utfall-tal">{numbers(outcome)}</span>
      {outcome.kind === 'finding' ? (
        <span className={`niva ${outcome.level}`}>
          <i aria-hidden="true" />
          {levelName(severity, outcome.level)}
        </span>
      ) : outcome.kind === 'none' ? (
        <span className="niva ingen">Ikkje funn</span>
      ) : null}
    </div>
  );
}

/** Where the share sits between the thresholds; the marks glide with token durations. */
function Scale({ rule, share }: { rule: Rule; share: number | null }) {
  const style = {
    '--m': Math.min(1, Math.max(0, rule.threshold.medium)),
    '--h': Math.min(1, Math.max(0, rule.threshold.high)),
    '--s': Math.min(1, Math.max(0, share ?? 0)),
  } as CSSProperties;
  return (
    <div className="terskel" style={style} aria-hidden="true">
      <span className="terskel-middels" />
      <span className="terskel-hog" />
      {share !== null && <span className="terskel-merke" />}
    </div>
  );
}

export function FindingPreview({
  detail,
  draft,
  dirty,
  scope: picked,
  onScope,
  children,
}: {
  detail: RuleDetail;
  draft: Rule;
  dirty: boolean;
  scope: PreviewScope;
  onScope: (scope: PreviewScope) => void;
  children: ReactNode;
}) {
  const rounds = useRounds(),
    versions = useVersions();
  const family = familyOf(detail.key);
  const template = new Map(
    (Array.isArray(versions.data) ? versions.data : []).map((v) => [v.id, v.template.key]),
  );
  const choices = (Array.isArray(rounds.data) ? rounds.data : []).filter(
    (r) => r.template_version_id && template.get(r.template_version_id) === family,
  );
  const round =
    choices.find((r) => r.id === picked.round) ??
    choices.find((r) => r.status === 'open') ??
    choices[0];
  const clients = round?.round_clients ?? [];
  const scope = clients.some((c) => c.client_id === picked.client) ? picked.client : 'alle';
  const { medium, high } = draft.threshold;
  const ready =
    medium >= 0 &&
    medium <= high &&
    high <= 1 &&
    Number.isInteger(draft.min_count) &&
    draft.min_count >= 1 &&
    (!detail.countsAnswers || detail.locked || draft.options.length > 0) &&
    (draft.minimum_hours === undefined || draft.minimum_hours >= 0);
  const body = JSON.stringify(evalPart(draft));
  const settled = useDebounced(body, 350);
  const result = useQuery({
    queryKey: ['findings', 'preview', detail.key, detail.rule.version, round?.id, scope, settled],
    queryFn: ({ signal }) =>
      api<Preview>(`/api/admin/finding-rules/${encodeURIComponent(detail.key)}/preview`, {
        method: 'POST',
        body: JSON.stringify({
          rule: JSON.parse(settled) as object,
          round: round!.id,
          client: scope,
        }),
        signal,
      }),
    // Only a settled draft is read: no request with a half-typed or just-fixed value.
    enabled: !!round && ready && body === settled,
    placeholderData: keepPreviousData,
  });
  const data = result.data;
  const waiting = body !== settled || result.isFetching;
  const share =
    data?.draft.outcome.kind === 'finding' || data?.draft.outcome.kind === 'none'
      ? data.draft.outcome.share
      : null;
  return (
    <aside className="kort funn-forhand" aria-labelledby="forhand-tittel">
      <div className="kort-hovud">
        <h2 id="forhand-tittel">Førehandsvising</h2>
        <span className={waiting ? 'reknar synleg' : 'reknar'} aria-hidden={!waiting}>
          Reknar …
        </span>
      </div>
      <div className="kort-innhald forhand-innhald">
        <div className="forhand-val" hidden={!round}>
          <label className="field">
            <span>Runde</span>
            <select
              className="input"
              value={round?.id ?? ''}
              onChange={(e) => onScope({ round: e.target.value, client: 'alle' })}
            >
              {choices.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Kunde</span>
            <select
              className="input"
              value={scope}
              onChange={(e) => onScope({ round: round?.id ?? '', client: e.target.value })}
            >
              <option value="alle">Alle</option>
              {clients.map((c) => (
                <option key={c.client_id} value={c.client_id}>
                  {c.client.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!round && <p className="muted">Ingen rundar med dette skjemaet enno.</p>}
        <ErrorMessage error={result.error} />
        {!ready && <p className="muted">Rett felta for å sjå kva endringa gjer.</p>}
        {data && (
          <>
            <div className="samanlikning" aria-live="polite" aria-busy={waiting}>
              <Line
                label={`Versjon ${data.current.version}`}
                outcome={data.current.outcome}
                severity={detail.rule.severity}
              />
              <Line
                label={dirty ? 'Med endringa' : 'Utan endringar'}
                outcome={data.draft.outcome}
                severity={draft.severity}
              />
            </div>
            {!draft.computed && draft.channel === 'aggregate' && (
              <Scale rule={draft} share={share} />
            )}
            <p className="forklaring">
              {data.source === 'released'
                ? 'Publiserte tal frå den avslutta runden.'
                : 'Levande tal frå den opne runden.'}{' '}
              {data.source === 'released' && data.fixed_version !== null
                ? `Dashbordet for denne runden viser versjon ${data.fixed_version} og endrar seg ikkje når du lagrar. `
                : ''}
              {data.audited
                ? 'Leiarsvar blir lesne og logga på same måte som i dashbordet. '
                : 'Grupper med færre enn 3 svar blir ikkje viste.'}
            </p>
          </>
        )}
        {children}
      </div>
    </aside>
  );
}
