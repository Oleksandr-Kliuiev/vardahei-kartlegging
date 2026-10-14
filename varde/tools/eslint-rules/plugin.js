// ESLint plugin `varde` (task 0.2b). Rules live in ./rules, one file per rule.
import { privacyInternals } from './rules/privacy-internals.js';
import { privacyOnlyRelease } from './rules/privacy-only-release.js';

const plugin = {
  meta: { name: 'varde' },
  rules: { 'privacy-only-release': privacyOnlyRelease, 'privacy-internals': privacyInternals },
};

export default plugin;
