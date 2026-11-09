// Norwegian order and dates in one place. No browser carries data for `nn`, so `localeCompare(…,
// 'nn')` and `toLocaleDateString('nn-NO')` quietly fall back to the language of the browser: in a
// Russian Chrome «Åsen» then sorts before «Bergen» and a date reads «9 нояб. 2026 г.». `nb` has the
// same alphabet (… x, y, z, æ, ø, å) and every browser knows it; dates are built from fixed parts,
// so they read the same wherever the admin is opened. Never pass `nn` to Intl — `norsk.test.ts`
// guards that.
const ORDER = new Intl.Collator('nb');

/** Names and titles in Norwegian order; `æ`, `ø` and `å` come last, as they should. */
export const byNorsk = (a: string, b: string) => ORDER.compare(a, b);

/** The same word in one case, so «Kari» and «kari» are one name. */
export const flatNorsk = (s: string) => s.toLocaleLowerCase('nb');

const ONE_DECIMAL = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 1 });
/** «12,5» the way Norwegian writes it, at most one decimal. */
export const talNorsk = (n: number) => ONE_DECIMAL.format(n);

const DATE = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Oslo',
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
});
/** «16.10.2026», Oslo time, for lists and logs. */
export const shortDate = (iso: string) =>
  DATE.formatToParts(new Date(iso))
    .filter((p) => p.type !== 'literal')
    .map((p) => p.value)
    .join('.');
