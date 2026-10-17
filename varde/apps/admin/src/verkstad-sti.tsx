// The trail (2.15): the survey as the respondent walks it — welcome, sections as cairns, the leader
// branch, the end. Questions can be dragged, moved with Alt+↑/↓ (handled by the page) and searched.
import { useEffect, useRef, useState, type DragEvent } from 'react';
import type { TemplateContent } from '../../../packages/schema/src/template/template.js';
import type { Question } from '../../../packages/schema/src/template/question.js';
import { Icon, type IconName } from './icons.js';
import { NODE, leaderOf, sectionKey, sectionsOf, type Lang, type Place } from './verkstad-model.js';

/** The cairn of a section, as on the respondent's trail. */
export function Cairn() {
  return (
    <svg className="vk-varde" viewBox="0 0 22 24" aria-hidden="true">
      <ellipse cx="11" cy="21" rx="8.5" ry="2.6" fill="var(--stein-mork)" />
      <ellipse cx="11" cy="16.6" rx="6.8" ry="2.5" fill="var(--stein)" />
      <ellipse cx="11" cy="12.4" rx="5.3" ry="2.3" fill="var(--stein-lys)" />
      <ellipse cx="11" cy="8.6" rx="3.9" ry="2.1" fill="var(--stein)" />
      <ellipse cx="11" cy="5.2" rx="2.4" ry="1.7" fill="var(--stein-mork)" />
    </svg>
  );
}

export interface StiProps {
  content: TemplateContent;
  base: TemplateContent | null;
  selected: string;
  lang: Lang;
  readOnly: boolean;
  /** Issues per trail node (question id or node key). */
  problems: ReadonlyMap<string, number>;
  changedFrozen: ReadonlySet<string>;
  onSelect: (key: string) => void;
  onMove: (id: string, place: Place) => void;
  onAdd: (where: number | 'leader') => void;
  onAddSection: () => void;
  /** «Hent spørsmål» (2.18): a ready question or one from another survey. */
  onBank?: (where: number | 'leader') => void;
  /** Open notes per question (2.18). */
  notes?: ReadonlyMap<string, number>;
}

export function Sti(p: StiProps) {
  const [query, setQuery] = useState('');
  const [drag, setDrag] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ key: string; after: boolean } | null>(null);
  const sections = sectionsOf(p.content),
    leader = leaderOf(p.content);
  const q = query.trim().toLowerCase();
  const match = (x: Question) =>
    !q || `${x.id} ${x.texts.text.nn} ${x.texts.text[p.lang] ?? ''}`.toLowerCase().includes(q);
  const holder = (key: string) =>
    key === p.selected || (key.startsWith(':seksjon:') && p.selected === key);
  const activeSection = (i: number) =>
    p.selected === sectionKey(i) || sections[i]?.questions.some((x) => x.id === p.selected);
  const inLeader = p.selected === NODE.leader || leader.some((x) => x.id === p.selected);
  // The chosen stop stays in sight (chosen in the phone, by «Gå til» or on the keyboard). Only the
  // trail scrolls, never the page, and the row never hides under the search at the top.
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const box = nav.current?.parentElement;
    const row = nav.current?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!box || !row || box.scrollHeight <= box.clientHeight) return;
    const head = nav.current?.querySelector<HTMLElement>('.vk-sti-topp')?.offsetHeight ?? 0;
    const b = box.getBoundingClientRect(),
      r = row.getBoundingClientRect();
    if (r.top < b.top + head + 8) box.scrollTop -= b.top + head + 8 - r.top;
    else if (r.bottom > b.bottom - 8) box.scrollTop += r.bottom - b.bottom + 8;
  }, [p.selected]);

  const place = (target: Question, after: boolean): Place => {
    const where: number | 'leader' =
      target.part === 'leader' ? 'leader' : sections.findIndex((s) => s.questions.includes(target));
    const list = where === 'leader' ? leader : sections[where]!.questions;
    const next = list[list.indexOf(target) + 1];
    return after
      ? { in: where, ...(next ? { before: next.id } : {}) }
      : { in: where, before: target.id };
  };
  const over = (e: DragEvent, key: string, after: boolean) => {
    if (!drag) return;
    e.preventDefault();
    if (drop?.key !== key || drop.after !== after) setDrop({ key, after });
  };
  const end = () => {
    setDrag(null);
    setDrop(null);
  };

  const row = (key: string, icon: IconName | 'varde', label: string, count?: number) => (
    <button
      type="button"
      className="vk-rad vk-node"
      aria-current={holder(key) ? 'true' : undefined}
      onClick={() => p.onSelect(key)}
      {...(p.problems.get(key) ? { 'data-problem': '' } : {})}
    >
      <span className="vk-ikon">{icon === 'varde' ? <Cairn /> : <Icon name={icon} small />}</span>
      <span className="vk-tekst">{label}</span>
      {count !== undefined && <span className="vk-tal">{count}</span>}
      {p.problems.get(key) ? <span className="vk-feil" title="Må fiksast" /> : null}
    </button>
  );
  const question = (x: Question) => {
    if (!match(x)) return null;
    const isNew = p.base !== null && !p.base.questions.some((b) => b.id === x.id);
    const text = x.texts.text[p.lang] || x.texts.text.nn;
    const dropHere = drop?.key === x.id;
    return (
      <li
        key={x.id}
        className={dropHere ? (drop.after ? 'vk-slipp-etter' : 'vk-slipp-foer') : undefined}
      >
        <button
          type="button"
          className={`vk-rad${x.part === 'leader' ? ' vk-leiarrad' : ''}${drag === x.id ? ' vk-dreg' : ''}`}
          data-sel={x.id}
          aria-current={x.id === p.selected ? 'true' : undefined}
          draggable={!p.readOnly && !q}
          onClick={() => p.onSelect(x.id)}
          onDragStart={(e) => {
            setDrag(x.id);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', x.id);
          }}
          onDragEnd={end}
          onDragOver={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            over(e, x.id, e.clientY > r.top + r.height / 2);
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (drag && drop) p.onMove(drag, place(x, drop.after));
            end();
          }}
        >
          <span className="vk-ikon">
            <span className="vk-prikk" />
          </span>
          <span className="vk-tekst">
            <span className="vk-id">{x.id}</span>
            <span className={text ? 'vk-ord' : 'vk-ord tom'}>{text || 'Nytt spørsmål'}</span>
          </span>
          <span className="vk-flagg">
            {x.role && (
              <span title="Rollespørsmål">
                <Icon name="leiar" small />
              </span>
            )}
            {x.visible_if !== undefined && (
              <span title="Blir vist med vilkår">
                <Icon name="greiner" small />
              </span>
            )}
            {x.frozen && (
              <span title="Fast spørsmål">
                <Icon name="las" small />
              </span>
            )}
            {p.changedFrozen.has(x.id) ? (
              <span className="vk-merke">endra</span>
            ) : isNew ? (
              <span className="vk-merke">ny</span>
            ) : null}
            {p.notes?.get(x.id) ? (
              <span
                className="vk-notat"
                title={
                  p.notes.get(x.id) === 1
                    ? 'Éin open kommentar'
                    : `${p.notes.get(x.id)} opne kommentarar`
                }
              >
                <Icon name="prat" small />
                {p.notes.get(x.id)}
              </span>
            ) : null}
            {p.problems.get(x.id) ? <span className="vk-feil" title="Må fiksast" /> : null}
          </span>
        </button>
      </li>
    );
  };
  const header = (key: string, i: number | 'leader', label: string, count: number) => (
    <div
      onDragOver={(e) => over(e, key, true)}
      onDrop={(e) => {
        e.preventDefault();
        const list = i === 'leader' ? leader : sections[i]!.questions;
        if (drag) p.onMove(drag, { in: i, ...(list[0] ? { before: list[0].id } : {}) });
        end();
      }}
      className={drop?.key === key ? 'vk-slipp-etter' : undefined}
    >
      {row(key, i === 'leader' ? 'leiar' : 'varde', label, count)}
    </div>
  );
  return (
    <nav className="vk-sti" aria-label="Innhaldet i skjemaet" ref={nav}>
      <div className="vk-sti-topp">
        <input
          type="search"
          className="input"
          placeholder="Finn spørsmål"
          aria-label="Finn spørsmål"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <p className="vk-sti-tal">
          {p.content.questions.length - leader.length} felles · {leader.length} for leiarar ·{' '}
          {sections.length} {sections.length === 1 ? 'seksjon' : 'seksjonar'}
        </p>
      </div>
      <ul className="vk-liste">
        {!q && (
          <>
            <li>{row(NODE.settings, 'tannhjul', 'Om skjemaet')}</li>
            <li>{row(NODE.intro, 'flagg', 'Velkomen')}</li>
            {p.content.invitation && (
              <li>{row(NODE.invitation, 'send', 'Invitasjon og plakat')}</li>
            )}
          </>
        )}
        {!sections.length && !p.readOnly && !q && (
          <li className="vk-tom">
            <button type="button" className="vk-legg" onClick={() => p.onAdd(0)}>
              <Icon name="pluss" small />
              Første spørsmål
            </button>
          </li>
        )}
        {sections.map((s, i) => {
          const rows = s.questions.map(question).filter(Boolean);
          if (q && !rows.length) return null;
          return (
            <li
              key={`s${i}:${s.questions[0]?.id ?? ''}`}
              className={activeSection(i) ? 'vk-seksjon aktiv' : 'vk-seksjon'}
            >
              {header(
                sectionKey(i),
                i,
                s.title?.[p.lang] || s.title?.nn || 'Seksjon utan namn',
                s.questions.length,
              )}
              <ul>{rows}</ul>
              {!p.readOnly && !q && (
                <div className="vk-legg-rad">
                  <button type="button" className="vk-legg" onClick={() => p.onAdd(i)}>
                    <Icon name="pluss" small />
                    Spørsmål
                  </button>
                  {p.onBank && (
                    <button type="button" className="vk-legg" onClick={() => p.onBank?.(i)}>
                      <Icon name="kopi" small />
                      Hent
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
        {(leader.length > 0 || p.content.leader_roles.length > 0) && (
          <li className={inLeader ? 'vk-seksjon vk-leiardel aktiv' : 'vk-seksjon vk-leiardel'}>
            {header(NODE.leader, 'leader', 'Berre for leiarar', leader.length)}
            <ul>{leader.map(question)}</ul>
            {!p.readOnly && !q && (
              <button type="button" className="vk-legg" onClick={() => p.onAdd('leader')}>
                <Icon name="pluss" small />
                Leiarspørsmål
              </button>
            )}
          </li>
        )}
        {!q && <li>{row(NODE.end, 'topp', 'Råd på slutten')}</li>}
      </ul>
      {!p.readOnly && (
        <div className="vk-sti-fot">
          <button type="button" className="btn sm" onClick={p.onAddSection}>
            <Icon name="pluss" small />
            Ny seksjon
          </button>
        </div>
      )}
    </nav>
  );
}
