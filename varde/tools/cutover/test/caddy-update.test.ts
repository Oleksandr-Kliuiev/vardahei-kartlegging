import { expect, it } from 'vitest';
import { replaceBlock } from '../update-caddy.mjs';

it('changes only the kartlegging block, retaining unrelated edits and query placeholders', () => {
  const original =
    'atlas.example {\n respond "Atlas"\n}\nkartlegging.vardahei.tech {\n reverse_proxy kartlegging:3070\n}\nother.example {\n respond "new Atlas edit"\n}\n';
  const block =
    'kartlegging.vardahei.tech {\n handle / {\n rewrite * /r/legacy?{query}\n }\n respond 404\n}\n';
  const next = replaceBlock(original, block);
  expect(next).toContain('new Atlas edit');
  expect(next).toContain('/r/legacy?{query}');
  expect(next).not.toContain('reverse_proxy kartlegging');
  expect(
    replaceBlock(next, 'kartlegging.vardahei.tech {\n reverse_proxy kartlegging:3070\n}\n'),
  ).toBe(original);
});
