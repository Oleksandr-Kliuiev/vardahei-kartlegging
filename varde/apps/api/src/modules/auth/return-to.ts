// Where to go after signing in (concept of Samtalar: when the session has run out, you come back to the
// same question). Only a page of the admin on this site: letters, digits, `-` and `_` between its
// slashes and a plain query. Anything else is ignored, so a login link can never send anyone elsewhere:
// no other host (`//x`, `/\x`), no way out of the admin (`/admin/../x`), no line breaks for the header.
const ADMIN_PAGE = /^\/admin(?:\/[A-Za-z0-9_-]+)*\/?(?:\?[A-Za-z0-9_.~=&%,:+-]*)?$/;
const LONGEST = 512;

export const returnTo = (value: unknown): string | null =>
  typeof value === 'string' && value.length <= LONGEST && ADMIN_PAGE.test(value) ? value : null;
