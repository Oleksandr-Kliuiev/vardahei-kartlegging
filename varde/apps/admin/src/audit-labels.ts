/** Readable text for the journal rows (what happened, to what, when) instead of raw keys and UUIDs. */
const WHAT: Record<string, string> = {
  'rounds.create': 'Runde oppretta',
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

export function auditWho(who: string): string {
  return who === 'system' ? 'Systemet' : who;
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
  if (kind === 'seminar') return 'Seminar';
  if (kind === 'client') return 'Kunde';
  return target.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, '…');
}
