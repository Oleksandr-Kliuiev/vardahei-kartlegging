// The other stops on the trail (2.15): about the survey, the welcome screen, the invitation and poster,
// the leader part, the advice at the end and a section. Same fields as before, in plain words; the whole
// template stays editable as JSON under «Teknisk» for anything the fields do not cover.
import { useId, useState } from 'react';
import type { TemplateContent } from '../../../packages/schema/src/template/template.js';
import { Icon, type IconName } from './icons.js';
import { Cairn } from './verkstad-sti.js';
import { TekstFelt, issueText, type Issue } from './verkstad-felt.js';
import { expressionWords } from './verkstad-vilkar.js';
import { sectionsOf, setIdentification, whereOf, type Lang, type Text } from './verkstad-model.js';

interface NodeProps {
  content: TemplateContent;
  lang: Lang;
  readOnly: boolean;
  issues: readonly Issue[];
  onChange: (c: TemplateContent) => void;
}

function Problems({ issues, content }: { issues: readonly Issue[]; content: TemplateContent }) {
  if (!issues.length) return null;
  return (
    <ul className="vk-problemliste">
      {issues.map((i, n) => (
        <li key={n} className="vk-problem">
          <Icon name="varsel" small />
          {issueText(i)}
          <span className="vk-dempa"> ({whereOf(content, i.path)})</span>
        </li>
      ))}
    </ul>
  );
}
/** The heading of a stop on the trail, with the same mark as on the trail. */
function Head({ icon, title, note }: { icon: IconName | 'varde'; title: string; note?: string }) {
  return (
    <header className="vk-hovud vk-hovud-node">
      <h2 className="vk-node-tittel">
        <span className="vk-node-merke" aria-hidden="true">
          {icon === 'varde' ? <Cairn /> : <Icon name={icon} small />}
        </span>
        {title}
      </h2>
      {note && <p className="vk-dempa">{note}</p>}
    </header>
  );
}
/** A list of texts (letter paragraphs, facts): edit, add, remove. */
function Tekstliste({
  label,
  items,
  lang,
  languages,
  readOnly,
  onChange,
}: {
  label: string;
  items: Text[];
  lang: Lang;
  languages: readonly Lang[];
  readOnly: boolean;
  onChange: (items: Text[]) => void;
}) {
  return (
    <div className="vk-blokk vk-tekstliste">
      <div className="vk-etikett">{label}</div>
      {items.map((t, i) => (
        <div key={i} className="vk-rad-tekst">
          <span className="vk-nr" aria-hidden="true">
            {i + 1}
          </span>
          <TekstFelt
            label={`${label} ${i + 1}`}
            hideLabel
            text={t}
            lang={lang}
            multiline
            readOnly={readOnly}
            onChange={(next) => onChange(items.map((x, n) => (n === i ? next : x)))}
          />
          {!readOnly && (
            <button
              type="button"
              className="iconbtn"
              aria-label={`Fjern ${label.toLowerCase()} ${i + 1}`}
              onClick={() => onChange(items.filter((_, n) => n !== i))}
            >
              <Icon name="lukk" small />
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <button
          type="button"
          className="vk-lenkje"
          onClick={() =>
            onChange([...items, Object.fromEntries(languages.map((l) => [l, ''])) as Text])
          }
        >
          <Icon name="pluss" small />
          Legg til {label.toLowerCase()}
        </button>
      )}
    </div>
  );
}

export function OmSkjemaet(p: NodeProps & { versionLabel: string }) {
  const c = p.content;
  const [raw, setRaw] = useState<string | null>(null);
  const [error, setError] = useState('');
  const client = c.audience === 'client_survey';
  const setLang = (lang: Lang, on: boolean) =>
    p.onChange({
      ...c,
      required_languages: on
        ? ([...c.required_languages, lang] as TemplateContent['required_languages'])
        : c.required_languages.filter((l) => l !== lang),
    });
  const fixedInitials = c.questions.some((q) => q.identifier && q.frozen);
  const ident = useId();
  return (
    <article className="vk-redigering">
      <Head icon="tannhjul" title="Om skjemaet" note={`Nøkkel «${c.key}» · ${p.versionLabel}`} />
      <Problems issues={p.issues} content={p.content} />
      <div className="vk-to">
        <div className="vk-felt">
          <label htmlFor={ident}>Identifikasjon</label>
          <select
            id={ident}
            aria-describedby={`${ident}-hint`}
            className="input"
            value={c.identification}
            disabled={p.readOnly || fixedInitials}
            onChange={(e) =>
              p.onChange(setIdentification(c, e.target.value as 'initials' | 'none'))
            }
          >
            <option value="initials">Med initialar</option>
            <option value="none">Anonym</option>
          </select>
          <small className="vk-hint" id={`${ident}-hint`}>
            {fixedInitials
              ? 'Initialspørsmålet er fast, så skjemaet held fram med initialar.'
              : c.identification === 'initials'
                ? 'Skjemaet byrjar med spørsmålet om initialane.'
                : 'Svara kan ikkje knytast til éin person.'}
          </small>
        </div>
        <div className="vk-felt">
          <span>Språk</span>
          <div className="vk-sprakval">
            <label className="vk-sjekk">
              <input type="checkbox" checked disabled />
              Nynorsk
            </label>
            <label className="vk-sjekk">
              <input
                type="checkbox"
                checked={c.required_languages.includes('en')}
                disabled={p.readOnly || client}
                onChange={(e) => setLang('en', e.target.checked)}
              />
              English
            </label>
            <label className="vk-sjekk">
              <input
                type="checkbox"
                checked={c.required_languages.includes('nb')}
                disabled={p.readOnly}
                onChange={(e) => setLang('nb', e.target.checked)}
              />
              Bokmål
            </label>
          </div>
          {client && (
            <small className="vk-hint">Kundeskjema er alltid på nynorsk og engelsk.</small>
          )}
        </div>
      </div>
      {c.score_scale && (
        <div className="vk-blokk">
          <div className="vk-etikett">Namn på sonene (berre i admin)</div>
          <div className="vk-fire">
            {c.score_scale.levels.map((l, i) => (
              <label key={l.id} className="vk-felt">
                {['Grøn', 'Gul', 'Oransje', 'Raud'][i]}
                <input
                  className="input"
                  value={l.label.nn}
                  readOnly={p.readOnly}
                  onChange={(e) => {
                    const levels = c.score_scale!.levels.map((x, n) =>
                      n === i ? { ...x, label: { ...x.label, nn: e.target.value } } : x,
                    ) as NonNullable<TemplateContent['score_scale']>['levels'];
                    p.onChange({ ...c, score_scale: { ...c.score_scale!, levels } });
                  }}
                />
              </label>
            ))}
          </div>
        </div>
      )}
      <details className="vk-teknisk">
        <summary>
          <Icon name="chev" small />
          Teknisk: heile skjemaet som JSON
        </summary>
        <div className="vk-teknisk-innhald">
          <p className="vk-hint">
            For det felta ikkje dekkjer, til dømes vilkåra til råda. Nøkkel og målgruppe kan ikkje
            endrast.
          </p>
          <textarea
            className="input vk-json"
            spellCheck={false}
            readOnly={p.readOnly}
            aria-label="Heile skjemaet som JSON"
            value={raw ?? JSON.stringify(c, null, 2)}
            onChange={(e) => {
              setRaw(e.target.value);
              setError('');
            }}
          />
          {raw !== null && !p.readOnly && (
            <div className="vk-knappar">
              <button
                type="button"
                className="btn sm"
                onClick={() => {
                  try {
                    const parsed = JSON.parse(raw) as TemplateContent;
                    if (parsed.key !== c.key || parsed.audience !== c.audience)
                      throw new Error('Nøkkel og målgruppe kan ikkje endrast.');
                    p.onChange(parsed);
                    setRaw(null);
                  } catch (e) {
                    setError(
                      e instanceof SyntaxError
                        ? 'Skriv gyldig JSON.'
                        : e instanceof Error
                          ? e.message
                          : 'Kontroller JSON.',
                    );
                  }
                }}
              >
                Bruk JSON
              </button>
              <button type="button" className="btn sm ghost" onClick={() => setRaw(null)}>
                Avbryt
              </button>
            </div>
          )}
          {error && <p role="alert">{error}</p>}
        </div>
      </details>
    </article>
  );
}

export function Velkomen(p: NodeProps & { languages: readonly Lang[] }) {
  const c = p.content,
    intro = c.intro;
  const set = (next: Partial<TemplateContent['intro']>) =>
    p.onChange({ ...c, intro: { ...intro, ...next } });
  const contact = (key: 'name' | 'phone' | 'email', label: string) => (
    <label className="vk-felt">
      {label}
      <input
        className="input"
        value={intro.contact[key]}
        readOnly={p.readOnly}
        onChange={(e) => set({ contact: { ...intro.contact, [key]: e.target.value } })}
      />
    </label>
  );
  return (
    <article className="vk-redigering">
      <Head icon="flagg" title="Velkomen" note="Det første den som svarar ser." />
      <Problems issues={p.issues} content={p.content} />
      <TekstFelt
        label="Tittel"
        text={intro.title}
        lang={p.lang}
        readOnly={p.readOnly}
        onChange={(title) => set({ title })}
      />
      <TekstFelt
        label="Overskrift over tittelen"
        text={intro.short}
        lang={p.lang}
        readOnly={p.readOnly}
        onChange={(short) => set({ short })}
      />
      <Tekstliste
        label="Avsnitt"
        items={intro.letter}
        lang={p.lang}
        languages={p.languages}
        readOnly={p.readOnly}
        onChange={(letter) => set({ letter })}
      />
      <Tekstliste
        label="Punkt"
        items={intro.facts}
        lang={p.lang}
        languages={p.languages}
        readOnly={p.readOnly}
        onChange={(facts) => set({ facts })}
      />
      <div className="vk-to">
        <TekstFelt
          label="Avsendar under brevet"
          text={intro.sender}
          lang={p.lang}
          readOnly={p.readOnly}
          onChange={(sender) => set({ sender })}
        />
        <label className="vk-felt vk-smal">
          Om lag kor mange minutt
          <input
            className="input"
            type="number"
            min={1}
            value={intro.minutes}
            readOnly={p.readOnly}
            onChange={(e) => set({ minutes: Math.max(1, Number(e.target.value) || 1) })}
          />
        </label>
      </div>
      <div className="vk-blokk">
        <div className="vk-etikett">Kontakt på slutten og ved feil</div>
        <div className="vk-to">
          {contact('name', 'Namn')}
          {contact('phone', 'Telefon')}
          {contact('email', 'E-post')}
          <TekstFelt
            label="Opningstid"
            text={intro.contact.hours}
            lang={p.lang}
            readOnly={p.readOnly}
            onChange={(hours) => set({ contact: { ...intro.contact, hours } })}
          />
        </div>
      </div>
    </article>
  );
}

export function Invitasjon(p: NodeProps) {
  const c = p.content,
    inv = c.invitation;
  if (!inv) return null;
  const set = (next: Partial<NonNullable<TemplateContent['invitation']>>) =>
    p.onChange({ ...c, invitation: { ...inv, ...next } });
  return (
    <article className="vk-redigering">
      <Head
        icon="send"
        title="Invitasjon og plakat"
        note="Teksten leiaren hos kunden sender ut, og plakaten med QR-kode."
      />
      <Problems issues={p.issues} content={p.content} />
      <TekstFelt
        label="Brevet"
        text={inv.letter}
        lang={p.lang}
        multiline
        readOnly={p.readOnly}
        onChange={(letter) => set({ letter })}
      />
      <p className="vk-hint">
        <code>{'{lenkje}'}</code> blir lenkja til kunden, <code>{'{frist}'}</code> fristen,{' '}
        <code>{'{minutt}'}</code> tida og <code>{'{host}'}</code> adressa til Varde.
      </p>
      <TekstFelt
        label="Plakat: tittel"
        text={inv.poster.title}
        lang={p.lang}
        readOnly={p.readOnly}
        onChange={(title) => set({ poster: { ...inv.poster, title } })}
      />
      <TekstFelt
        label="Plakat: tekst"
        text={inv.poster.text}
        lang={p.lang}
        multiline
        readOnly={p.readOnly}
        onChange={(text) => set({ poster: { ...inv.poster, text } })}
      />
      <TekstFelt
        label="Plakat: botntekst"
        text={inv.poster.footer}
        lang={p.lang}
        readOnly={p.readOnly}
        onChange={(footer) => set({ poster: { ...inv.poster, footer } })}
      />
    </article>
  );
}

export function Leiardel(p: NodeProps) {
  const c = p.content;
  const role = c.questions.find((q) => q.role);
  return (
    <article className="vk-redigering">
      <Head
        icon="leiar"
        title="Berre for leiarar"
        note="Ekstra spørsmål etter fellesdelen, for dei som har ansvar."
      />
      <Problems issues={p.issues} content={p.content} />
      <div className="vk-blokk">
        <div className="vk-etikett">Kven får leiardelen?</div>
        {role && (role.type === 'single' || role.type === 'multi') ? (
          <>
            <p className="vk-dempa">
              Avgjort av svaret på {role.id} «{role.texts.text.nn}».
            </p>
            <div className="vk-roller">
              {role.options.map((o) => (
                <label key={o.id} className="vk-sjekk vk-boks">
                  <input
                    type="checkbox"
                    checked={c.leader_roles.includes(o.id)}
                    disabled={p.readOnly}
                    onChange={(e) =>
                      p.onChange({
                        ...c,
                        leader_roles: e.target.checked
                          ? [...c.leader_roles, o.id]
                          : c.leader_roles.filter((r) => r !== o.id),
                      })
                    }
                  />
                  {o.texts.text.nn || o.id}
                </label>
              ))}
            </div>
          </>
        ) : (
          <p>Legg til eit rollespørsmål først.</p>
        )}
      </div>
      <TekstFelt
        label="Tittel på leiarskjermen"
        text={c.leader_intro.title}
        lang={p.lang}
        readOnly={p.readOnly}
        onChange={(title) => p.onChange({ ...c, leader_intro: { ...c.leader_intro, title } })}
      />
      <TekstFelt
        label="Tekst"
        text={c.leader_intro.text}
        lang={p.lang}
        multiline
        readOnly={p.readOnly}
        onChange={(text) => p.onChange({ ...c, leader_intro: { ...c.leader_intro, text } })}
      />
    </article>
  );
}

export function Slutt(p: NodeProps) {
  const c = p.content;
  return (
    <article className="vk-redigering">
      <Head
        icon="topp"
        title="Råd på slutten"
        note="Etter siste svar kan den som svarar få råd ut frå svara sine."
      />
      <Problems issues={p.issues} content={p.content} />
      {c.tips.length === 0 ? (
        <p className="vk-info">
          <Icon name="lyspare" small />
          Dette skjemaet gir ingen råd på slutten. Råd blir lagde med tittel, tekst og eit vilkår
          (under «Om skjemaet», Teknisk).
        </p>
      ) : (
        <>
          <label className="vk-felt vk-smal">
            Høgst tal råd
            <input
              className="input"
              type="number"
              min={0}
              value={c.max_tips}
              readOnly={p.readOnly}
              onChange={(e) =>
                p.onChange({ ...c, max_tips: Math.max(0, Number(e.target.value) || 0) })
              }
            />
          </label>
          {c.tips.map((t, i) => (
            <div key={t.id} className="vk-raad">
              <p className="vk-setning">
                <Icon name="greiner" small />
                <span>{expressionWords(c, t.when)}</span>
              </p>
              <TekstFelt
                label="Tittel"
                text={t.title}
                lang={p.lang}
                readOnly={p.readOnly}
                onChange={(title) =>
                  p.onChange({ ...c, tips: c.tips.map((x, n) => (n === i ? { ...x, title } : x)) })
                }
              />
              <TekstFelt
                label="Tekst"
                text={t.text}
                lang={p.lang}
                multiline
                readOnly={p.readOnly}
                onChange={(text) =>
                  p.onChange({ ...c, tips: c.tips.map((x, n) => (n === i ? { ...x, text } : x)) })
                }
              />
            </div>
          ))}
        </>
      )}
    </article>
  );
}

export function Seksjon(
  p: NodeProps & {
    index: number;
    onMove: (dir: -1 | 1) => void;
    onTitle: (lang: Lang, v: string) => void;
  },
) {
  const sections = sectionsOf(p.content);
  const s = sections[p.index];
  if (!s) return null;
  // Only the first section can be without a title; moved, it would melt into its neighbour.
  const untitled = (i: number) => i >= 0 && i < sections.length && !sections[i]!.title?.nn.trim();
  return (
    <article className="vk-redigering">
      <Head
        icon="varde"
        title={`Seksjon ${p.index + 1} av ${sections.length}`}
        note={`${s.questions.length} spørsmål. Kvar seksjon blir ei varde på stien; tittelen står over det første spørsmålet.`}
      />
      <TekstFelt
        label="Tittel"
        text={s.title ?? { nn: '' }}
        lang={p.lang}
        readOnly={p.readOnly}
        onChange={(t) => p.onTitle(p.lang, t[p.lang] ?? '')}
      />
      {!p.readOnly && (
        <div className="vk-knappar">
          <button
            type="button"
            className="btn sm"
            disabled={p.index === 0 || untitled(p.index) || untitled(p.index - 1)}
            onClick={() => p.onMove(-1)}
          >
            Flytt opp
          </button>
          <button
            type="button"
            className="btn sm"
            disabled={p.index === sections.length - 1 || untitled(p.index) || untitled(p.index + 1)}
            onClick={() => p.onMove(1)}
          >
            Flytt ned
          </button>
          <span className="vk-hint">
            {untitled(p.index)
              ? 'Gi seksjonen ein tittel før du flyttar han.'
              : 'Ein seksjon forsvinn når det siste spørsmålet i han blir flytta eller sletta.'}
          </span>
        </div>
      )}
    </article>
  );
}
