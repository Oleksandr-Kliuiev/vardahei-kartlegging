// Fields of the FindingRule editor (2.5): text pairs, thresholds in per cent, answers that count.
import type { Choice, Rule, RuleDetail, Texts } from './funn-models.js';
import { levelName } from './funn-models.js';
import { Seg } from './widgets.js';

export function TextPair({
  legend,
  hint,
  value,
  onChange,
}: {
  legend: string;
  hint?: string;
  value: Texts;
  onChange: (value: Texts) => void;
}) {
  return (
    <fieldset className="felt-gruppe">
      <legend>{legend}</legend>
      {hint && <p className="forklaring">{hint}</p>}
      <div className="tekstpar">
        {(['nn', 'en'] as const).map((lang) => (
          <label className="field" key={lang}>
            <span>{lang === 'nn' ? 'Nynorsk' : 'Engelsk'}</span>
            <textarea
              className="input"
              rows={3}
              aria-label={`${legend}, ${lang === 'nn' ? 'nynorsk' : 'engelsk'}`}
              aria-invalid={!value[lang].trim()}
              value={value[lang]}
              onChange={(e) => onChange({ ...value, [lang]: e.target.value })}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function NumberField({
  label,
  unit,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field tal-felt">
      <span>{label}</span>
      <span className="med-eining">
        <input
          className="input"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          value={Number.isFinite(value) ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
        />
        <span aria-hidden="true">{unit}</span>
      </span>
    </label>
  );
}
const pct = (share: number) => Math.round(share * 1000) / 10;

/** Thresholds and minimum count, in the words of the rule kind. */
export function Limits({ draft, set }: { draft: Rule; set: (change: Partial<Rule>) => void }) {
  const t = draft.threshold;
  if (draft.computed === 'routine')
    return (
      <p className="forklaring">
        Funnet kjem når nokon har svart på kor mykje tid rutinane tek. Det har ingen tersklar.
      </p>
    );
  if (draft.computed === 'heaviest')
    return (
      <div className="tal-rad">
        <NumberField
          label="Minst timar i veka"
          unit="t"
          min={0}
          value={draft.minimum_hours ?? 1}
          onChange={(v) => set({ minimum_hours: v })}
        />
      </div>
    );
  if (draft.channel === 'leader' && draft.computed !== 'f12_b13')
    return (
      <div className="field">
        <span>Nivå når leiaren svarar slik</span>
        <Seg
          label="Nivå"
          value={draft.level ?? 'medium'}
          options={[
            ['medium', levelName(draft.severity, 'medium')],
            ['high', levelName(draft.severity, 'high')],
          ]}
          onChange={(level) => set({ level })}
        />
      </div>
    );
  if (draft.computed === 'f12_b13')
    return (
      <div className="tal-rad">
        <NumberField
          label="Minst del som veit kor dei skal melde frå (F12)"
          unit="%"
          min={0}
          max={100}
          value={pct(t.medium)}
          onChange={(v) => set({ threshold: { ...t, medium: v / 100 } })}
        />
        <NumberField
          label="Minst svar på F12"
          unit="svar"
          min={1}
          value={draft.min_count}
          onChange={(v) => set({ min_count: v })}
        />
      </div>
    );
  return (
    <div className="tal-rad">
      <NumberField
        label="Middels frå"
        unit="%"
        min={0}
        max={100}
        value={pct(t.medium)}
        onChange={(v) => set({ threshold: { ...t, medium: v / 100 } })}
      />
      <NumberField
        label="Høg frå"
        unit="%"
        min={0}
        max={100}
        value={pct(t.high)}
        onChange={(v) => set({ threshold: { ...t, high: v / 100 } })}
      />
      <NumberField
        label="Minst"
        unit="personar"
        min={1}
        value={draft.min_count}
        onChange={(v) => set({ min_count: v })}
      />
    </div>
  );
}

/** The answers that count: checkboxes in the question's order, fixed chips for leader rules. */
export function Answers({
  detail,
  draft,
  set,
}: {
  detail: RuleDetail;
  draft: Rule;
  set: (change: Partial<Rule>) => void;
}) {
  if (!detail.countsAnswers) return null;
  if (detail.locked)
    return (
      <div className="field">
        <span>Svar som tel</span>
        <ul className="faste-val">
          {detail.choices
            .filter((c) => draft.options.includes(c.id))
            .map((c) => (
              <li key={c.id} className="chip">
                {c.label}
              </li>
            ))}
        </ul>
        <p className="forklaring">
          Svara i ein leiarregel ligg fast: dei gjeld både kvar leiar og samla tal for alle kundar.
        </p>
      </div>
    );
  const groups = new Map<string, Choice[]>();
  for (const c of detail.choices)
    groups.set(c.group ?? '', [...(groups.get(c.group ?? '') ?? []), c]);
  const toggle = (id: string, on: boolean) => {
    const chosen = new Set(draft.options);
    if (on) chosen.add(id);
    else chosen.delete(id);
    set({ options: detail.choices.filter((c) => chosen.has(c.id)).map((c) => c.id) });
  };
  return (
    <fieldset className="felt-gruppe">
      <legend>{draft.computed === 'f12_b13' ? 'Leiarsvar som tel (B13)' : 'Svar som tel'}</legend>
      {[...groups].map(([group, choices]) => (
        <div
          className={group ? 'val-gruppe tett' : 'val-gruppe'}
          key={group}
          role={group ? 'group' : undefined}
          aria-label={group || undefined}
        >
          {group && <span className="val-overskrift">{group}</span>}
          {choices.map((c) => (
            <label className="val-rad" key={c.id}>
              <input
                type="checkbox"
                checked={draft.options.includes(c.id)}
                onChange={(e) => toggle(c.id, e.target.checked)}
              />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      ))}
    </fieldset>
  );
}
