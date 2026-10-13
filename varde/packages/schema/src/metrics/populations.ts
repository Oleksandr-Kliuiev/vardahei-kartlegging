// Populations of aggregate snapshots (ADR-020): `round_client` and `all_clients` carry only the
// common part; `leaders_all` is the only population with `part = leader`.
import { z } from 'zod';

export const PARTS = ['common', 'leader'] as const;
export const Part = z.enum(PARTS);
export type Part = z.infer<typeof Part>;

export const POPULATIONS = ['round_client', 'all_clients', 'leaders_all'] as const;
export const Population = z.enum(POPULATIONS);
export type Population = z.infer<typeof Population>;

const PART_OF: Readonly<Record<Population, Part>> = Object.freeze({
  round_client: 'common',
  all_clients: 'common',
  leaders_all: 'leader',
});

/** The only part a population may carry. */
export function partOf(population: Population): Part {
  return PART_OF[population];
}

/** True if a metric of `part` may be computed for `population`. */
export function populationAllows(population: Population, part: Part): boolean {
  return PART_OF[population] === part;
}
