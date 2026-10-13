// ESLint plugin `varde` (task 0.2b). Rules live in ./rules, one file per rule.
import { privacyOnlyRelease } from './rules/privacy-only-release.js';

const plugin = {
  meta: { name: 'varde' },
  rules: { 'privacy-only-release': privacyOnlyRelease },
};

export default plugin;
