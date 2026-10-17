// The survey workshop «Skjemaverkstaden» (2.15, concept 17.10): the trail of the survey on the left,
// the chosen question in the middle, the phone on the chosen question on the right. Drafts save
// themselves; published versions are read-only with a way to a new draft.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { TemplateContent } from '../../../packages/schema/src/template/template.js';
import type { Question } from '../../../packages/schema/src/template/question.js';
import { api, mutate } from './api.js';
import { Icon } from './icons.js';
import { goTo } from './nav.js';
import { PhonePreview } from './phone-preview.js';
import { ErrorMessage } from './queries.js';
import { useToast } from './shell.js';
import type { EditorVersion, SurveySummary } from './survey-models.js';
import { LANG_NAME, type Issue } from './verkstad-felt.js';
import { useHistory } from './verkstad-historikk.js';
import { dropBackup, readBackup, savesOf, useAutosave } from './verkstad-lagring.js';
import {
  NODE,
  addSection,
  canonical,
  frozenChanges,
  insertQuestion,
  issueNode,
  leaderOf,
  markFrozen,
  missingIn,
  moveBy,
  moveQuestion,
  moveSection,
  newQuestion,
  nextId,
  ordered,
  removeQuestion,
  restoreQuestion,
  revertFrozen,
  sectionOfKey,
  sectionsOf,
  setSectionTitle,
  nodeOfOwner,
  type Lang,
  type Place,
} from './verkstad-model.js';
import { Invitasjon, Leiardel, OmSkjemaet, Seksjon, Slutt, Velkomen } from './verkstad-nodar.js';
import { Publiser } from './verkstad-publiser.js';
import { useSpelling } from './verkstad-merke.js';
import { lastNode, useHaldFram } from './hald-fram.js';
import { Omsetjing } from './verkstad-omsetjing.js';
import { diffQuestions, withText } from './verkstad-tekst.js';
import { Versjonar } from './verkstad-versjonar.js';
import { useModal } from './widgets.js';
import { emptyTexts } from '../../../packages/schema/src/template/respondent-texts.js';
import { Meldingar, Topp } from './verkstad-topp.js';
import { Sporsmal } from './verkstad-sporsmal.js';
import { Sti } from './verkstad-sti.js';
import { expressionWords } from './verkstad-vilkar.js';
import './verkstad.css';

const nodeOf = nodeOfOwner;

export function VerkstadPage({ id }: { id: string }) {
  // The workshop starts from what the server has now (never a cached copy), after any save of this
  // version that is still on its way.
  const version = useQuery({
    queryKey: ['surveys', 'version', id],
    queryFn: async () => {
      await savesOf(id);
      return api<EditorVersion>(`/api/admin/surveys/versions/${id}`);
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const list = useQuery({
    queryKey: ['surveys'],
    queryFn: () => api<SurveySummary[]>('/api/admin/surveys'),
  });
  if (!version.data || !version.isFetchedAfterMount || !list.data)
    return (
      <section className="del">
        <ErrorMessage error={version.error ?? list.error} />
        {!version.error && !list.error && <p role="status">Hentar skjemaet …</p>}
      </section>
    );
  return <Verkstad key={version.data.id} initial={version.data} surveys={list.data} />;
}

function Verkstad({ initial, surveys }: { initial: EditorVersion; surveys: SurveySummary[] }) {
  const queries = useQueryClient();
  const toast = useToast();
  const template = surveys.find((s) => s.id === initial.template_id);
  const versions = template?.versions ?? [];
  const baseRef = versions.find(
    (v) => v.status === 'published' && v.version_no < initial.version_no,
  );
  const draftRef = versions.find((v) => v.status === 'draft' && v.id !== initial.id);
  const base = useQuery({
    queryKey: ['surveys', 'version', baseRef?.id],
    queryFn: () => api<EditorVersion>(`/api/admin/surveys/versions/${baseRef!.id}`),
    enabled: !!baseRef,
  });
  const [saved, setSaved] = useState(initial);
  const history = useHistory<TemplateContent>(initial.content);
  const content = history.present;
  const readOnly = saved.status !== 'draft';
  const languages = content.required_languages as Lang[];
  const [lang, setLang] = useState<Lang>('nn');
  const [sel, setSel] = useState<string>(
    () => lastNode(initial.id, content) ?? content.questions[0]?.id ?? NODE.intro,
  );
  useHaldFram(saved.id, content.intro.title.nn || content.key, sel);
  const [ask, setAsk] = useState(0);
  const [unlocked, setUnlocked] = useState<ReadonlySet<string>>(new Set());
  const [issues, setIssues] = useState<Issue[]>([]);
  // One side panel at a time: publishing or the versions; «Omsetjing» replaces the three panes.
  const [panel, setPanel] = useState<'publiser' | 'versjonar' | null>(null);
  const [view, setView] = useState<'verkstad' | 'omsetjing'>('verkstad');
  const [phone, setPhone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmReload, setConfirmReload] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const [backup, setBackup] = useState(() => {
    const b = readBackup(initial.id);
    return b && !readOnly && canonical(b.content) !== canonical(initial.content) ? b : null;
  });
  // A saved version is what this page and the next visit start from.
  const keep = useCallback(
    (v: EditorVersion) => {
      setSaved(v);
      queries.setQueryData(['surveys', 'version', v.id], v);
    },
    [queries],
  );
  const onSaved = keep;
  const save = useAutosave(saved, content, onSaved, !readOnly);

  useEffect(() => {
    document.title = `${content.intro.title.nn || content.key} – Skjema – Varde`;
  }, [content.intro.title.nn]);
  // The side panels are modal: the rest of the page is inert, and focus goes back when they close.
  useModal(panel !== null, opener, '.vk > :not(.vk-skuff, .vk-slor)');
  // The shared validator; issues that block a save come back marked as blocking.
  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(() => {
      api<{ issues: Issue[] }>('/api/admin/surveys/validate', {
        method: 'POST',
        body: JSON.stringify(content),
        signal: abort.signal,
      })
        .then((r) => !abort.signal.aborted && setIssues(r.issues))
        .catch(() => undefined);
    }, 300);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [content]);

  const baseContent = base.data?.content ?? null;
  const frozen = useMemo(() => frozenChanges(baseContent, content), [baseContent, content]);
  const { marks, spelling, mark, forget } = useSpelling(initial.id, frozen);
  // Texts a respondent would meet empty (2.16): the shared validator lets them pass, publishing does not.
  const empty = useMemo(() => emptyTexts(content), [content]);
  const problems = useMemo(() => {
    const m = new Map<string, number>();
    const add = (node: string) => m.set(node, (m.get(node) ?? 0) + 1);
    for (const i of issues) add(issueNode(content, i.path));
    for (const t of empty) add(nodeOf(t.owner));
    for (const f of frozen) if (!f.semantic && !spelling[f.id]) add(f.id);
    return m;
  }, [issues, empty, frozen, spelling, content]);
  const pendingFrozen = frozen.filter((f) => !f.semantic && !spelling[f.id]).length;
  const languagesLeft = languages.filter(
    (l) => missingIn(content, l).length || save.dirty() || !saved.translation_acceptance[l],
  ).length;
  const left = issues.length + empty.length + pendingFrozen + languagesLeft;
  const blocking = issues.find((i) => i.blocking);

  // Every question id this visit has seen, with the published base: new ids never reuse them.
  const seen = useRef(new Set<string>());
  useEffect(() => {
    for (const x of content.questions) seen.current.add(x.id);
  }, [content]);
  const used = () => [...seen.current, ...(baseContent?.questions.map((x) => x.id) ?? [])];
  const change = (fn: (c: TemplateContent) => TemplateContent, key = '') => {
    if (!readOnly) history.change(fn, key);
  };
  // Stable writers for the translation view, so typing in one row redraws only that row.
  const changing = useRef(change);
  changing.current = change;
  const onText = useCallback(
    (key: string, l: Lang, value: string) =>
      changing.current((c) => withText(c, key, l, value), `tekst:${key}:${l}`),
    [],
  );
  const onGotoText = useCallback((owner: string) => {
    setView('verkstad');
    setSel(nodeOf(owner));
    setAsk((n) => n + 1);
  }, []);
  const setQuestion = (q: Question, key = '') =>
    change((c) => ({ ...c, questions: c.questions.map((x) => (x.id === q.id ? q : x)) }), key);
  const select = (key: string) => {
    setSel(key);
    setAsk((n) => n + 1);
    document.querySelector('.vk-redigering-flate')?.scrollTo({ top: 0 });
  };
  const add = (where: number | 'leader') => {
    const id = nextId(content, used());
    const q = newQuestion('single', id, languages);
    const current = content.questions.find((x) => x.id === sel);
    const list =
      where === 'leader' ? leaderOf(content) : (sectionsOf(content)[where]?.questions ?? []);
    const after = current && list.includes(current) ? list[list.indexOf(current) + 1] : undefined;
    const place: Place = { in: where, ...(after ? { before: after.id } : {}) };
    change((c) => insertQuestion(c, q, current && list.includes(current) ? place : { in: where }));
    setSel(id);
  };
  const addSectionAfter = () => {
    const sections = sectionsOf(content);
    const current = content.questions.find((x) => x.id === sel);
    const at =
      sectionOfKey(sel) ??
      (current ? sections.findIndex((s) => s.questions.includes(current)) : -1);
    const id = nextId(content, used());
    change((c) =>
      addSection(
        c,
        at < 0 ? sections.length - 1 : at,
        { ...Object.fromEntries(languages.map((l) => [l, ''])), nn: 'Ny seksjon' },
        newQuestion('single', id, languages),
      ),
    );
    setSel(`:seksjon:${(at < 0 ? sections.length - 1 : at) + 1}`);
  };
  const remove = (q: Question) => {
    const order = ordered(content);
    const i = order.findIndex((x) => x.id === q.id);
    const next = order[i + 1] ?? order[i - 1];
    const before = content;
    const after = removeQuestion(content, q.id);
    change(() => after);
    select(next?.id ?? NODE.intro);
    const ref = new RegExp(`"var":"${q.id}(\\.|")`);
    const used = content.questions.filter(
      (x) => x.visible_if !== undefined && ref.test(JSON.stringify(x.visible_if)),
    );
    toast(
      used.length
        ? `${q.id} er sletta. Vilkåret til ${used.map((u) => u.id).join(', ')} viser no til eit spørsmål som ikkje finst.`
        : `${q.id} er sletta.`,
      {
        label: 'Angre',
        run: () => {
          change((c) => (c === after ? before : restoreQuestion(c, before, q.id)));
          select(q.id);
        },
      },
    );
  };
  const duplicate = (q: Question) => {
    const id = nextId(content, used());
    const copy = JSON.parse(JSON.stringify(q)) as Question & Record<string, unknown>;
    delete copy.frozen;
    delete copy.anchor_key;
    delete copy.role;
    delete copy.identifier;
    const where =
      q.part === 'leader'
        ? 'leader'
        : sectionsOf(content).findIndex((s) => s.questions.includes(q));
    const list = where === 'leader' ? leaderOf(content) : sectionsOf(content)[where]!.questions;
    const after = list[list.indexOf(q) + 1];
    change((c) =>
      insertQuestion(
        c,
        { ...copy, id },
        {
          in: where,
          ...(after ? { before: after.id } : {}),
        },
      ),
    );
    setSel(id);
  };
  const move = (id: string, place: Place) => change((c) => moveQuestion(c, id, place));

  const accept = async (l: Lang) => {
    setBusy(true);
    setError('');
    try {
      const current = await save.flush();
      if (!current) throw new Error('Utkastet må vere lagra før du godkjenner.');
      await mutate(`/api/admin/surveys/versions/${current.id}/accept`, 'POST', {
        content_hash: current.content_hash,
        lang: l,
      });
      keep(await api<EditorVersion>(`/api/admin/surveys/versions/${current.id}`));
      toast(
        l === 'nn'
          ? 'Korrekturen på nynorsk er merkt som gjort.'
          : `Teksten på ${LANG_NAME[l]} er godkjend.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunne ikkje godkjenne.');
    } finally {
      setBusy(false);
    }
  };
  const publish = async () => {
    setBusy(true);
    setError('');
    try {
      const current = await save.flush();
      if (!current) throw new Error('Utkastet må vere lagra før du publiserer.');
      // Only what was chosen: an unchosen change is refused by the server as well.
      const changes = Object.fromEntries(
        frozen
          .filter((f) => f.semantic || spelling[f.id])
          .map((f) => [f.id, f.semantic ? 'semantic' : 'orthographic']),
      );
      await mutate(`/api/admin/surveys/versions/${current.id}/publish`, 'POST', {
        content_hash: current.content_hash,
        confirmed: true,
        frozen_changes: changes,
      });
      const next = await api<EditorVersion>(`/api/admin/surveys/versions/${current.id}`);
      keep(next);
      history.reset(next.content);
      void queries.invalidateQueries({ queryKey: ['surveys'] });
      void queries.invalidateQueries({ queryKey: ['rounds'] });
      forget();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunne ikkje publisere.');
    } finally {
      setBusy(false);
    }
  };
  const newDraft = async () => {
    if (draftRef) return goTo(`/admin/surveys/${draftRef.id}`);
    setBusy(true);
    try {
      const max = Math.max(...versions.map((v) => v.version_no), saved.version_no);
      const draft = await mutate<EditorVersion>(
        `/api/admin/surveys/${saved.template_id}/drafts`,
        'POST',
        {
          label: `v${max + 1}`,
          copy_from: saved.id,
        },
      );
      void queries.invalidateQueries({ queryKey: ['surveys'] });
      goTo(`/admin/surveys/${draft.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunne ikkje lage utkast.');
    } finally {
      setBusy(false);
    }
  };

  // ⌘Z / ⇧⌘Z everywhere in the workshop; Alt+↑/↓ moves the chosen question when no field has focus.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      const field = target?.closest('input, textarea, select');
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === 'z' &&
        !target?.classList.contains('vk-json')
      ) {
        if (readOnly) return;
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
      } else if (
        e.altKey &&
        (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
        !field &&
        !readOnly
      ) {
        if (!content.questions.some((q) => q.id === sel)) return;
        e.preventDefault();
        change((c) => moveBy(c, sel, e.key === 'ArrowUp' ? -1 : 1));
      } else if (e.key === 'Escape') {
        if (panel) setPanel(null);
        else if (phone) setPhone(false);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const q = content.questions.find((x) => x.id === sel);
  const section = sectionOfKey(sel);
  const spot =
    q?.id ??
    (sel === NODE.leader
      ? ':leiar'
      : sel === NODE.end
        ? ':slutt'
        : section !== null
          ? (sectionsOf(content)[section]?.questions[0]?.id ?? ':intro')
          : ':intro');
  const onHere = useCallback((at: string) => {
    if (at === ':intro')
      setSel((s) =>
        ([NODE.intro, NODE.settings, NODE.invitation] as string[]).includes(s) ? s : NODE.intro,
      );
    else if (at === ':leiar') setSel(NODE.leader);
    else if (at === ':slutt') setSel(NODE.end);
    else if (!at.startsWith(':')) setSel(at);
  }, []);
  const baseLabel = baseRef ? `v${baseRef.version_no}` : 'førre versjon';
  const nodeProps = {
    content,
    lang,
    readOnly,
    issues: issues.filter((i) => issueNode(content, i.path) === sel),
    onChange: (c: TemplateContent) => change(() => c, `node:${sel}`),
  };
  const editor = q ? (
    <Sporsmal
      key={q.id}
      content={content}
      q={q}
      lang={lang}
      languages={languages}
      readOnly={readOnly}
      issues={issues.filter((i) => issueNode(content, i.path) === q.id)}
      frozen={frozen.find((f) => f.id === q.id)}
      unlocked={unlocked.has(q.id)}
      mark={frozen.find((f) => f.id === q.id)?.semantic ? 'semantic' : spelling[q.id]}
      markStale={!!marks[q.id] && !spelling[q.id]}
      baseLabel={baseLabel}
      scored={!!content.score_scale}
      onChange={(next) => setQuestion(next, `q:${q.id}`)}
      onLang={setLang}
      onUnlock={() => setUnlocked(new Set([...unlocked, q.id]))}
      onMark={(kind) => markQuestion(q.id, kind)}
      onRevert={() => baseContent && change((c) => revertFrozen(c, baseContent, q.id))}
      onDelete={() => remove(q)}
      onDuplicate={() => duplicate(q)}
      onMove={(to) => move(q.id, { in: to })}
    />
  ) : sel === NODE.settings ? (
    <OmSkjemaet
      {...nodeProps}
      versionLabel={`${readOnly ? 'Publisert' : 'Utkast'} v${saved.version_no}`}
    />
  ) : sel === NODE.intro ? (
    <Velkomen {...nodeProps} languages={languages} />
  ) : sel === NODE.invitation ? (
    <Invitasjon {...nodeProps} />
  ) : sel === NODE.leader ? (
    <Leiardel {...nodeProps} />
  ) : sel === NODE.end ? (
    <Slutt {...nodeProps} />
  ) : section !== null ? (
    <Seksjon
      {...nodeProps}
      index={section}
      onMove={(dir) => {
        change((c) => moveSection(c, section, dir));
        setSel(`:seksjon:${section + dir}`);
      }}
      onTitle={(l, v) => change((c) => setSectionTitle(c, section, l, v), `seksjon:${section}`)}
    />
  ) : null;
  function markQuestion(id: string, kind: 'orthographic' | 'semantic') {
    if (!baseContent) return;
    change((c) => markFrozen(c, baseContent, id, kind, saved.version_no));
    mark(
      id,
      kind,
      content.questions.find((x) => x.id === id),
    );
  }
  const openPanel = (which: 'publiser' | 'versjonar') => {
    opener.current = document.activeElement as HTMLElement | null;
    setPanel(which);
  };

  return (
    <div className={`vk${phone ? ' med-telefon' : ''}`}>
      <Topp
        title={content.intro.title.nn || content.key}
        saved={saved}
        readOnly={readOnly}
        base={base.data ?? null}
        save={save.state}
        onRetry={() => void save.flush()}
        onFix={blocking ? () => select(issueNode(content, blocking.path)) : undefined}
        history={history}
        lang={lang}
        languages={languages}
        missing={(l) => missingIn(content, l).length}
        onLang={setLang}
        phone={phone}
        onPhone={() => setPhone(!phone)}
        busy={busy}
        draftNo={draftRef?.version_no ?? null}
        nextNo={Math.max(...versions.map((v) => v.version_no), saved.version_no) + 1}
        left={left}
        onNewDraft={() => void newDraft()}
        onPanel={() => openPanel('publiser')}
        view={view}
        onView={setView}
        onVersions={() => openPanel('versjonar')}
      />
      <Meldingar
        readOnly={readOnly}
        versionNo={saved.version_no}
        backup={backup}
        backupOutdated={!!backup && backup.hash !== saved.content_hash}
        onRestore={() => {
          if (backup) {
            save.restore(backup.hash);
            change(() => backup.content);
          }
          setBackup(null);
        }}
        onDiscard={() => {
          dropBackup(initial.id);
          setBackup(null);
        }}
        conflict={save.state.kind === 'conflict'}
        confirmReload={confirmReload}
        onReload={() => {
          if (!confirmReload) return setConfirmReload(true);
          void save.fetchLatest().then((fresh) => {
            save.resolved(fresh);
            keep(fresh);
            history.reset(fresh.content);
            setConfirmReload(false);
          });
        }}
        onOverwrite={() => void save.overwrite()}
      />
      {view === 'omsetjing' ? (
        <Omsetjing
          content={content}
          saved={saved}
          languages={languages}
          readOnly={readOnly}
          onText={onText}
          onGoto={onGotoText}
        />
      ) : (
        <div className="vk-flate">
          <div className="vk-rute vk-sti-rute">
            <Sti
              content={content}
              base={baseContent}
              selected={sel}
              lang={lang}
              readOnly={readOnly}
              problems={problems}
              changedFrozen={new Set(frozen.map((f) => f.id))}
              onSelect={select}
              onMove={move}
              onAdd={add}
              onAddSection={addSectionAfter}
            />
          </div>
          <section className="vk-rute vk-redigering-flate" aria-label="Redigering">
            {editor}
          </section>
          <div className="vk-telefon">
            {phone && (
              <button
                type="button"
                className="iconbtn vk-telefon-lukk"
                aria-label="Lukk telefonen"
                onClick={() => setPhone(false)}
              >
                <Icon name="lukk" small />
              </button>
            )}
            <PhonePreview
              id={saved.id}
              content={content}
              at={spot}
              ask={ask}
              {...(q?.visible_if !== undefined
                ? { note: expressionWords(content, q.visible_if) }
                : {})}
              onHere={onHere}
            />
          </div>
        </div>
      )}
      {panel && <div className="vk-slor" onClick={() => setPanel(null)} />}
      {panel === 'publiser' && (
        <Publiser
          saved={saved}
          content={content}
          dirty={save.dirty()}
          issues={issues}
          empty={empty}
          frozen={frozen}
          marks={spelling}
          diff={diffQuestions(baseContent, content)}
          baseLabel={baseLabel}
          languages={languages}
          busy={busy}
          error={error}
          onGoto={(key) => {
            setPanel(null);
            setView('verkstad');
            select(key);
          }}
          onLang={(l) => {
            setPanel(null);
            setLang(l);
          }}
          onTranslations={() => {
            setPanel(null);
            setView('omsetjing');
          }}
          onMark={markQuestion}
          onAccept={(l) => void accept(l)}
          onPublish={() => void publish()}
          onRound={() => {
            // The new version must be in the wizard's list: read the published versions again.
            void queries.invalidateQueries({ queryKey: ['rounds', 'versions'] });
            goTo(`/admin/rounds?ny=${saved.id}`);
          }}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'versjonar' && (
        <Versjonar
          versions={versions}
          current={saved.id}
          onOpen={(id) => goTo(`/admin/surveys/${id}`)}
          onClose={() => setPanel(null)}
        />
      )}
    </div>
  );
}
