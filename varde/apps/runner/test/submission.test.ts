import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newDraft } from '../src/draft.js';
import { sendDraft } from '../src/submission.js';
import { syntheticContent } from '../e2e/support.js';

vi.stubGlobal('crypto', webcrypto);
afterEach(() => { vi.unstubAllGlobals(); vi.stubGlobal('crypto', webcrypto); });
const expires = '2099-06-01T22:00:00Z';
describe('minimal confirmation transport for 1.15', () => {
  it('failure leaves stable ids; retry confirms only the acknowledged parts', async () => {
    const v = syntheticContent();
    const draft = { ...newDraft('nn', expires), answers: { K0: 'QAXAM', K1: 'leiar', KB1: 'ja' } };
    const confirmations: string[] = [];
    const fetcher = vi.fn().mockImplementation((_url: string, request: RequestInit) => {
      const body = JSON.parse(request.body as string) as { part: string; submission_id: string };
      return Promise.resolve(body.part === 'leader' ? { status: 500 } : { status: 201, json: () => Promise.resolve({ ok: true, submission_id: body.submission_id }) });
    });
    vi.stubGlobal('fetch', fetcher);
    await expect(sendDraft('synthetic', v, draft, (part) => { confirmations.push(part); })).rejects.toThrow();
    expect(confirmations).toEqual(['common']);
    const resumed = { ...draft, confirmed: { common: true, leader: false } };
    fetcher.mockImplementation((_url: string, request: RequestInit) => {
      const body = JSON.parse(request.body as string) as { submission_id: string };
      return Promise.resolve({ status: 201, json: () => Promise.resolve({ ok: true, submission_id: body.submission_id }) });
    });
    await sendDraft('synthetic', v, resumed, (part) => { confirmations.push(part); });
    expect(confirmations).toEqual(['common', 'leader']);
    expect(fetcher).toHaveBeenCalledTimes(3);
    const common = JSON.parse((fetcher.mock.calls[0]![1] as RequestInit).body as string) as { submission_id: string; answers: object };
    const leader = JSON.parse((fetcher.mock.calls[2]![1] as RequestInit).body as string) as { submission_id: string; answers: object };
    expect(common.submission_id).toBe(draft.submission_ids.common);
    expect(leader.submission_id).toBe(draft.submission_ids.leader);
    expect(leader.answers).toMatchObject({ K0: 'QAXAM' });
  });
  it('a 201 with the wrong id is not a confirmation', async () => {
    const confirmed = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 201, json: () => Promise.resolve({ ok: true, submission_id: 'wrong' }) }));
    await expect(sendDraft('synthetic', syntheticContent(), newDraft('nn', expires), confirmed)).rejects.toThrow();
    expect(confirmed).not.toHaveBeenCalledWith('common');
  });
});
