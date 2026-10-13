import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { REPO_DIR, VARDE_DIR } from './paths.js';

interface Step {
  uses?: string;
  with?: Record<string, unknown>;
}
interface Workflow {
  permissions?: Record<string, string>;
  defaults?: { run?: { 'working-directory'?: string } };
  jobs: Record<string, { steps: Step[]; 'timeout-minutes'?: number }>;
}

const text = readFileSync(join(REPO_DIR, '.github/workflows/varde.yml'), 'utf8');
const workflow = parse(text) as Workflow;

describe('.github/workflows/varde.yml', () => {
  it('grants only contents: read', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' });
  });

  it('never references secrets.', () => {
    expect(text).not.toMatch(/secrets\./);
  });

  it('pins every uses: to a 40-hex commit SHA', () => {
    const uses = [...text.matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map((m) => m[1] ?? '');
    expect(uses.length).toBeGreaterThan(0);
    for (const ref of uses) expect(ref).toMatch(/^[\w.-]+\/[\w.-]+(\/[\w.-]+)*@[0-9a-f]{40}$/);
  });

  it('runs in varde/ by default', () => {
    expect(workflow.defaults?.run?.['working-directory']).toBe('varde');
  });

  it('has a timeout on every job', () => {
    for (const job of Object.values(workflow.jobs)) expect(job['timeout-minutes']).toBe(15);
  });

  it.each(['secrets', 'integration'])('checks out full history in the %s job', (job) => {
    const checkout = workflow.jobs[job]?.steps.find((s) => s.uses?.startsWith('actions/checkout@'));
    expect(checkout?.with?.['fetch-depth']).toBe(0);
  });
});

describe('pnpm settings live only in pnpm-workspace.yaml', () => {
  it('varde/package.json has no "pnpm" field', () => {
    const pkg = JSON.parse(readFileSync(join(VARDE_DIR, 'package.json'), 'utf8')) as object;
    expect(pkg).not.toHaveProperty('pnpm');
  });

  it('varde/.npmrc does not exist', () => {
    expect(existsSync(join(VARDE_DIR, '.npmrc'))).toBe(false);
  });
});
