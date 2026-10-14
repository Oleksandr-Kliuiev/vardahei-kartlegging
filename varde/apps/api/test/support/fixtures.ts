// Synthetic parity fixtures of 1.2b (tools/parity/fixtures) for the api integration tests.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Kundar, SeedClient, Tilgang } from '../../src/modules/rounds/seed.service.js';
import { FIXTURES_DIR, SEED_DIR } from './seed-dir.js';

export const fixturePath = (name: string): string => join(FIXTURES_DIR, name);
export const fixtureText = (name: string): string => readFileSync(fixturePath(name), 'utf8');
export const kundar = (): Kundar => JSON.parse(fixtureText('kundar.json')) as Kundar;
export const tilgang = (): Tilgang => JSON.parse(fixtureText('tilgang.json')) as Tilgang;
export const clients = (): SeedClient[] =>
  JSON.parse(readFileSync(join(SEED_DIR, 'clients.json'), 'utf8')) as SeedClient[];
