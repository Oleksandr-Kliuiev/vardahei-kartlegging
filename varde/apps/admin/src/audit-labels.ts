/** Readable text for the journal rows (what happened, to what, when) instead of raw keys and UUIDs. */
const WHAT: Record<string, string> = {
  'rounds.create': 'Runde oppretta',
  'rounds.launch': 'Runde starta',
  'rounds.version': 'Versjon for runden endra',
  'rounds.release': 'Tal frigjevne',
  'rounds.client.sent': 'Merkt som sendt',
  'rounds.client.unsent': 'Merket «sendt» teke bort',
  'rounds.open': 'Runde opna',
  'rounds.close': 'Runde avslutta',
  'rounds.client.add': 'Kunde lagt til i runden',
  'rounds.client.open': 'Kunde opna for svar',
  'rounds.client.close': 'Kunde stengd',
  'rounds.client.deadline': 'Frist endra',
  'rounds.code.issue': 'Lenkje laga',
  'rounds.code.reissue': 'Ny lenkje laga, den gamle sluttar å verke',
  'rounds.code.revoke': 'Lenkje trekt attende',
  'clients.create': 'Kunde oppretta',
  'clients.update': 'Kunde endra',
  'privacy.release.auto': 'Tal frigjevne automatisk',
  'privacy.release.manual': 'Tal frigjevne for hand',
  'privacy.rows': 'Svarrader lesne',
  'privacy.json': 'Samla tal lesne',
  'privacy.participants': 'Deltakarar lesne',
  'leader.read': 'Leiarsvar lesne',
  'report.client': 'Rapport til kunden opna',
  'exports.archive': 'Arkiv lasta ned',
  'exports.master_analyse': 'Master_Analyse eksportert',
  'archive.restore': 'Arkiv lese inn att',
  'retention.forget': 'Svar sletta',
  'retention.forget.preview': 'Førehandsvising av sletting',
  'retention.handover': 'Samla tal levert til kunden',
  'retention.run': 'Automatisk opprydding køyrd',
  'surveys.publish': 'Skjema publisert',
  'surveys.create': 'Skjema oppretta',
  'surveys.draft': 'Nytt utkast',
  'surveys.save': 'Utkast lagra',
  'surveys.editor_metrics': 'Bruk av verkstaden lagra',
  'surveys.frozen_change': 'Fast spørsmål endra',
  'surveys.comment': 'Kommentar skriven',
  'surveys.comment.resolve': 'Kommentar løyst eller opna att',
  'surveys.translation.nn': 'Korrektur på nynorsk godkjend',
  'surveys.translation.en': 'Engelsk omsetjing godkjend',
  'surveys.translation.nb': 'Bokmål godkjend',
  'settings.update': 'Innstillingar endra',
  'findings.rule_action': 'Tiltak kopla til regel',
  'findings.action.create': 'Tiltak oppretta',
  'seminars.contact.update': 'Kontakt endra',
  'seminars.contact.confirm': 'Kontakt stadfesta',
  'seminars.code.reissue': 'Ny lenkje til påmelding',
  'seminars.presenter.issue': 'Lenkje til storskjermen laga',
  'seminars.presenter.revoke': 'Lenkje til storskjermen trekt attende',
  'seminars.live.create': 'Live-spørsmål oppretta',
  'seminars.live.remove': 'Live-spørsmål fjerna',
  'seminars.rounds.before': 'Undersøking før seminaret kopla',
  'break_glass.login': 'Nødtilgang brukt',
  'break_glass.enabled': 'Nødtilgang slått på',
  'break_glass.closed': 'Nødtilgang stengd',
  'break_glass.rejected': 'Nødtilgang avvist',
  'break_glass.login_failed': 'Mislukka nødinnlogging',
  'findings.status': 'Funn endra',
  'findings.rule_version': 'Regel for funn endra',
  'seminars.create': 'Seminar oppretta',
  'seminars.update': 'Seminar endra',
  'seminars.invitation': 'Invitasjon henta',
  'seminars.rounds.after': 'Undersøking etter seminaret oppretta',
  'seminars.registration.remove': 'Påmelding fjerna',
  'seminars.material.add': 'Materiell lagt til',
  'seminars.material.remove': 'Materiell fjerna',
};

export function auditWhat(what: string): string {
  return WHAT[what] ?? what;
}

/** The name people read: the sign-in name from the API, «Systemet» for jobs, the operator for break-glass. */
export function auditWho(who: string, name?: string): string {
  if (who === 'system') return 'Systemet';
  if (who.startsWith('break-glass:')) return `${who.slice(12)} (nødtilgang)`;
  return name ?? who;
}

/** `13.10.2026 08:51`, the same everywhere whatever the browser locale. */
export function auditWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export interface TargetNames {
  rounds: { id: string; name: string; round_clients: { id: string; client: { name: string } }[] }[];
  clients?: { id: string; name: string }[];
}

/** `round:<uuid>` becomes the round name, `round_client:<uuid>` becomes «client · round». */
export function auditTarget(target: string | null, names: TargetNames): string {
  if (!target) return '';
  const [kind, id = ''] = target.split(':');
  if (kind === 'round') {
    const round = names.rounds.find((r) => r.id === id);
    return round ? `Runde ${round.name}` : 'Runde';
  }
  if (kind === 'round_client') {
    for (const round of names.rounds) {
      const rc = round.round_clients.find((c) => c.id === id);
      if (rc) return `${rc.client.name} · ${round.name}`;
    }
    return 'Kunde i runde';
  }
  if (kind === 'client') return names.clients?.find((c) => c.id === id)?.name ?? 'Kunde';
  const plain: Record<string, string> = {
    seminar: 'Seminar',
    template_version: 'Skjema',
    contact: 'Kontakt',
    contacts: 'Kontaktar',
    survey_template: 'Skjema',
    finding: 'Funn',
    finding_rule: 'Regel for funn',
    rule: 'Regel for funn',
    action: 'Tiltak',
    app_setting: 'Innstillingar',
    cutover: 'Arkivet frå kartlegging',
  };
  return plain[kind ?? ''] ?? target.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, '…');
}
