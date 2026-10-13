// Selfcheck fixture (1.10b): a module outside privacy forges a released snapshot by assertion.
// The type is declared by name here; the rule matches the name of the asserted type.
interface ReleasedSnapshot {
  readonly status: 'released';
}

export const forged = { status: 'released' } as unknown as ReleasedSnapshot;
