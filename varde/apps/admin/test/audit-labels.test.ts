import { describe, expect, it } from 'vitest';
import { auditTarget, auditWhat, auditWhen, auditWho } from '../src/audit-labels.js';

const names = {
  rounds: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Runde 1',
      round_clients: [{ id: '22222222-2222-4222-8222-222222222222', client: { name: 'Daco' } }],
    },
  ],
};

describe('audit labels', () => {
  it('turns keys into readable text and keeps unknown keys visible', () => {
    expect(auditWhat('rounds.close')).toBe('Runde avslutta');
    expect(auditWhat('something.new')).toBe('something.new');
    expect(auditWho('system')).toBe('Systemet');
    expect(auditWho('entra:oid-1')).toBe('entra:oid-1');
  });
  it('names rounds and clients instead of showing UUIDs', () => {
    expect(auditTarget('round:11111111-1111-4111-8111-111111111111', names)).toBe('Runde Runde 1');
    expect(auditTarget('round_client:22222222-2222-4222-8222-222222222222', names)).toBe(
      'Daco · Runde 1',
    );
    expect(auditTarget('round:99999999-9999-4999-8999-999999999999', names)).toBe('Runde');
    expect(auditTarget(null, names)).toBe('');
    expect(auditTarget('thing:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', names)).toBe('thing:…');
  });
  it('formats the time the same in every locale', () => {
    expect(auditWhen(new Date(2026, 9, 13, 8, 5).toISOString())).toBe('13.10.2026 08:05');
    expect(auditWhen('not a date')).toBe('not a date');
  });
});
