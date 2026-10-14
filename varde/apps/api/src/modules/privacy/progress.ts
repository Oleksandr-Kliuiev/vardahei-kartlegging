/** Live aggregate class. Session rows stay inside privacy; no snapshots or release history. */
interface Event {
  session_id: string;
  question_no: number;
  finished: boolean;
  at: Date;
}
export type ProgressCell = { suppressed: true } | { suppressed: false; value: number };
const cell = (value: number, k: number): ProgressCell =>
  value < k ? { suppressed: true } : { suppressed: false, value };

/** Secondary suppression stops a visible total from revealing a lone small non-zero cell. */
function partition(counts: Record<string, number>, k: number): Record<string, ProgressCell> {
  const out = Object.fromEntries(Object.entries(counts).map(([key, n]) => [key, cell(n, k)]));
  if (Object.values(counts).filter((n) => n > 0 && n < k).length === 1) {
    const largest = Object.entries(counts)
      .filter(([, n]) => n >= k)
      .sort((a, b) => b[1] - a[1])[0];
    if (largest) out[largest[0]] = { suppressed: true };
  }
  return out;
}

export function progressCells(
  events: Event[],
  durations: number[],
  now: Date,
  k: number,
  questionCount: number,
) {
  const sessions = new Map<string, Event>();
  for (const event of events) {
    const prior = sessions.get(event.session_id);
    const latest = !prior || event.at >= prior.at ? event : prior;
    sessions.set(event.session_id, {
      ...latest,
      finished: event.finished || prior?.finished === true,
    });
  }
  const counts = { in_progress: 0, abandoned: 0, finished: 0, idle: 0 };
  // Fixed cells from the template: even the presence of a small conditional question is hidden.
  const stopped: Record<string, number> = Object.fromEntries(
    Array.from({ length: questionCount + 1 }, (_, i) => [String(i), 0]),
  );
  for (const event of sessions.values()) {
    const age = now.getTime() - event.at.getTime();
    if (event.finished) counts.finished++;
    else if (age < 15 * 60_000) counts.in_progress++;
    else if (age >= 30 * 60_000) {
      counts.abandoned++;
      stopped[event.question_no] = (stopped[event.question_no] ?? 0) + 1;
    } else counts.idle++;
  }
  durations.sort((a, b) => a - b);
  // kartlegging takes the upper middle value when the number of durations is even (§6).
  const median: ProgressCell =
    durations.length < k
      ? { suppressed: true }
      : { suppressed: false, value: durations[Math.floor(durations.length / 2)]! };
  return {
    started: cell(sessions.size, k),
    ...partition(counts, k),
    stopped: partition(stopped, k),
    median_duration_s: median,
  };
}
