interface ActorSession {
  sid: string;
  oid: string | null;
  name: string | null;
  via: string;
}

/** Preserve the channel's Entra spelling; break-glass always names the operator. */
export function auditWho(session: ActorSession | undefined, prefix = false): string {
  if (!session) throw new Error('guard did not attach a session');
  if (session.via === 'break_glass' && session.name) return session.name;
  const actor = session.oid ?? session.sid;
  return prefix ? `${session.via}:${actor}` : actor;
}
