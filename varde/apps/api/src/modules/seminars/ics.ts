// Calendar file of a seminar (3.2, RFC 5545): one VEVENT, times in UTC (no VTIMEZONE needed;
// Outlook and phones show them in local time), CRLF line ends, lines folded at 75 octets without
// splitting a UTF-8 character, TEXT values escaped. The UID is stable per seminar and SEQUENCE
// grows when time, place or topic change, so a calendar replaces the event instead of adding one.

export interface CalendarEvent {
  uid: string;
  sequence: number;
  stamp: Date;
  start: Date;
  end: Date;
  summary: string;
  location: string;
  description: string;
  url?: string | null;
}

/** 20261106T080000Z */
export const icsTime = (d: Date) =>
  d
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/[-:]/g, '');

/** TEXT value (RFC 5545 §3.3.11): backslash, semicolon, comma and line breaks escaped. */
export const icsText = (s: string) =>
  s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');

/** Folds a content line (RFC 5545 §3.1): at most 75 octets per line, continuation lines start
 * with one space (which counts), and a UTF-8 character is never split. */
export function foldLine(line: string): string {
  if (Buffer.byteLength(line, 'utf8') <= 75) return line;
  const parts: string[] = [];
  let current = '',
    size = 0,
    limit = 75;
  for (const ch of line) {
    const n = Buffer.byteLength(ch, 'utf8');
    if (size + n > limit) {
      parts.push(current);
      current = '';
      size = 0;
      limit = 74;
    }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

export function calendarFile(e: CalendarEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Vardahei IT//Varde//NO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${icsText(e.uid)}`,
    `DTSTAMP:${icsTime(e.stamp)}`,
    `DTSTART:${icsTime(e.start)}`,
    `DTEND:${icsTime(e.end)}`,
    `SEQUENCE:${e.sequence}`,
    `SUMMARY:${icsText(e.summary)}`,
    `LOCATION:${icsText(e.location)}`,
    `DESCRIPTION:${icsText(e.description)}`,
    ...(e.url ? [`URL:${e.url}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
