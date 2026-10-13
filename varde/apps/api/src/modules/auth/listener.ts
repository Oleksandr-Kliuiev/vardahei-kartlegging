// Which listener an app instance serves (0.7/0.8): the public one accepts only Entra sessions,
// the break-glass Unix socket only break-glass sessions.
import type { SessionVia } from './session.store.js';

export const LISTENER = Symbol('LISTENER');
export type Listener = 'main' | 'break_glass';

export const VIA_FOR_LISTENER: Record<Listener, SessionVia> = {
  main: 'entra',
  break_glass: 'break_glass',
};
