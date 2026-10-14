// Parse quoted CRLF CSV, including quotes and newlines inside synthetic free text.
export function parseCsv(text: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [],
    value = '',
    quoted = false;
  const data = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < data.length; i++) {
    const c = data[i]!;
    if (c === '"') {
      if (quoted && data[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && c === ';') {
      row.push(value);
      value = '';
    } else if (!quoted && (c === '\n' || c === '\r')) {
      if (c === '\r' && data[i + 1] === '\n') i++;
      row.push(value);
      result.push(row);
      row = [];
      value = '';
    } else value += c;
  }
  if (value || row.length) {
    row.push(value);
    result.push(row);
  }
  return result;
}
