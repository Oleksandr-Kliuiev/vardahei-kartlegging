/** Random per-tab session, independent of drafts and submissions. No answers/initials. */
export function progressSession(storageKey: string): string {
  let storage: Storage | undefined;
  try {
    storage = sessionStorage;
    const existing = storage.getItem(storageKey);
    if (existing && /^[a-f0-9]{16,32}$/.test(existing)) return existing;
  } catch {
    /* In-memory progress still works with blocked storage. */
  }
  const id = [...crypto.getRandomValues(new Uint8Array(12))]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
  try {
    storage?.setItem(storageKey, id);
  } catch {
    /* Optional telemetry cannot block the survey. */
  }
  return id;
}
export function sendProgress(code: string, session: string, question: number, finished: boolean) {
  void fetch('/api/runner/progress', {
    method: 'POST',
    keepalive: true,
    headers: { Authorization: `Bearer ${code}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: session,
      question_no: question,
      ...(finished ? { finished: true } : {}),
    }),
  }).catch(() => {});
}
