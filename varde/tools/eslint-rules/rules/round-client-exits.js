// Rule `varde/round-client-exits` (type-aware; decision of Oleksandr 16.10, ADR-021; BACKLOG
// «до этапа 4», приёмка 1c I1; 3c, решение 2). A client's own `round_client` cells leave
// modules/privacy only to that client's own channel (report 5.1, client CSV, handover) and to the
// admin dashboard (the trusted circle). Next to the round's `all_clients` numbers, the cells of a
// client hidden there by complementary suppression give a smaller client away (C = total − the
// rest). Every other reader — Atlas, the assistant, trends, summaries over several clients —
// takes per-client numbers from `all_clients` (`viewCells`, `clientGroup`). The rule reports:
//  (a) outside modules/privacy, any use of the PrivacyService methods below, called or
//      destructured, outside their allow-list (and computed or rest members of PrivacyService);
//  (b) in the client's own channel, any read of the shared views (`viewCells`, `clientGroup`):
//      next to its own cells, the round's total gives the other clients away (in a round of two
//      clients, total − own = the other one);
//  (c) reads of saved findings (`finding`: per client, `numbers` holds that client's n and count)
//      outside their allow-list: the model on a Prisma client, the relation in include/select
//      unless a nested `select` leaves `numbers` out, or raw SQL on the table `finding`. `count`
//      tells nothing per client.

import { globToRegExp } from './privacy-only-release.js';

/** Fixed allow-lists; every entry has its own test (round-client-exits.test.ts). */
export const ROUND_CLIENT_EXITS = Object.freeze({
  /** The client's own channel: report 5.1, client CSV, the findings of a release for that report. */
  ownCells: Object.freeze([
    'apps/api/src/modules/reports/**',
    'apps/api/src/modules/exports/csv.service.ts',
    'apps/api/src/modules/metrics/metrics.service.ts',
  ]),
  /** Return of the client's own data on request (ADR-017): its own rows and snapshots. */
  handover: Object.freeze(['apps/api/src/modules/retention/**']),
  /** The admin dashboard (ADR-021 variant B): one client, its role grid, the comparison. */
  adminClientCells: Object.freeze([
    'apps/api/src/modules/dashboard/**',
    'apps/api/src/modules/findings/rule-preview.service.ts',
  ]),
  roleClientCells: Object.freeze(['apps/api/src/modules/dashboard/**']),
  cohortCells: Object.freeze(['apps/api/src/modules/dashboard/**']),
  /** Cells before suppression: only the release of a round. */
  computeCells: Object.freeze(['apps/api/src/modules/metrics/metrics.service.ts']),
  /** Per-client cells before suppression (client × role structure of release rule 7). */
  crossCells: Object.freeze(['apps/api/src/modules/metrics/metrics.service.ts']),
  /** The live class `aggregate` query: no reader outside privacy. */
  aggregate: Object.freeze([]),
  /** Round archive (5.2): every population of a round, an admin export. */
  archiveSnapshots: Object.freeze(['apps/api/src/modules/exports/round-archive.service.ts']),
});

/** The client's own channel: its own cells only, never the shared views next to them. */
export const OWN_CHANNEL = Object.freeze([
  'apps/api/src/modules/reports/**',
  'apps/api/src/modules/exports/csv.service.ts',
  'apps/api/src/modules/retention/handover.ts',
]);

/** Saved findings: computed and shown by findings, the client's report, the round archive. */
export const FINDING_ALLOW = Object.freeze([
  'apps/api/src/modules/findings/**',
  'apps/api/src/modules/reports/**',
  'apps/api/src/modules/exports/round-archive.service.ts',
]);

const METHODS = new Set(Object.keys(ROUND_CLIENT_EXITS));
const SHARED = new Set(['viewCells', 'clientGroup']);
const FINDING_RELATIONS = new Set(['finding', 'findings']);
const PRISMA_TYPE = /\b(PrismaClient|TransactionClient)\b/;
const RAW_METHODS = new Set(['$queryRaw', '$queryRawUnsafe', '$executeRaw', '$executeRawUnsafe']);
const FINDING_TABLE = /\bfinding\b/i;

/** Static text of a raw SQL argument or template (interpolations are values, not SQL). */
function sqlText(/** @type {any} */ node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node?.type === 'TemplateLiteral')
    return node.quasis.map((/** @type {any} */ q) => q.value.cooked ?? q.value.raw).join(' ');
  return '';
}

/** Name of a member or pattern key; undefined for a computed key that is not a string literal. */
function keyName(/** @type {{ computed?: boolean }} */ owner, /** @type {any} */ key) {
  if (key?.type === 'Identifier' && !owner.computed) return key.name;
  if (key?.type === 'Literal' && typeof key.value === 'string') return key.value;
  return undefined;
}

/** `{ select: { …without numbers } }` and nothing else: the relation without the numbers. */
function withoutNumbers(/** @type {any} */ value) {
  if (value?.type !== 'ObjectExpression') return false;
  const props = value.properties;
  if (props.length !== 1 || props[0].type !== 'Property') return false;
  const select = props[0];
  if (keyName(select, select.key) !== 'select' || select.value.type !== 'ObjectExpression')
    return false;
  return select.value.properties.every(
    (/** @type {any} */ p) =>
      p.type === 'Property' &&
      keyName(p, p.key) !== undefined &&
      keyName(p, p.key) !== 'numbers' &&
      (p.value.type === 'Literal' || p.value.type === 'Identifier'),
  );
}

/** @type {import('eslint').Rule.RuleModule} */
export const roundClientExits = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "A client's round_client cells leave privacy only to its own channel and the admin dashboard",
    },
    schema: [],
    messages: {
      exit:
        "`{{name}}` lets a client's round_client cells out of privacy: only in {{allowed}} " +
        '(decision 16.10, ADR-021). Other readers take per-client numbers from all_clients ' +
        '(viewCells, clientGroup).',
      dynamic:
        'A computed or rest member of PrivacyService hides which cells leave privacy: name the ' +
        'method (lint varde/round-client-exits).',
      mixed:
        "`{{name}}` in the client's own channel: its own cells go out alone, never next to " +
        'shared numbers (decision 16.10, ADR-021).',
      finding:
        "Saved findings carry one client's numbers of its round_client cells: read `finding` only " +
        'in {{allowed}}, or select it without `numbers` (decision 16.10, ADR-021).',
    },
  },
  create(context) {
    const filename = context.filename.split('\\').join('/');
    const matches = (/** @type {readonly string[]} */ globs) =>
      globs.some((glob) => globToRegExp(glob).test(filename));
    const insidePrivacy = matches(['apps/api/src/modules/privacy/**']);
    const ownChannel = matches(OWN_CHANNEL);
    const findingsAllowed = matches(FINDING_ALLOW);
    if (insidePrivacy && findingsAllowed) return {};
    const exits = /** @type {Record<string, readonly string[]>} */ (ROUND_CLIENT_EXITS);

    const services = context.sourceCode.parserServices;
    const checker = services?.program?.getTypeChecker();
    /** @type {Map<unknown, unknown> | undefined} */
    const toTs = services?.esTreeNodeToTSNodeMap;

    /** @param {import('typescript').Type} type @param {RegExp} name @param {number} depth @returns {boolean} */
    const typeIs = (type, name, depth = 0) => {
      if (!checker || depth > 4) return false;
      const names = [type.aliasSymbol?.getName(), type.getSymbol()?.getName()];
      if (names.some((n) => n !== undefined && name.test(n))) return true;
      if (type.isUnionOrIntersection()) return type.types.some((t) => typeIs(t, name, depth + 1));
      if (type.isClassOrInterface())
        return (checker.getBaseTypes(type) ?? []).some((t) => typeIs(t, name, depth + 1));
      return false;
    };
    const typeOf = (/** @type {import('estree').Node} */ node) => {
      const tsNode = toTs?.get(node);
      if (!checker || !tsNode) return undefined;
      return checker.getTypeAtLocation(/** @type {import('typescript').Node} */ (tsNode));
    };

    /** 'privacy', 'unknown' (no types, any, unknown) or 'other'. */
    const kind = (/** @type {import('estree').Node} */ node) => {
      const type = typeOf(node);
      if (!type) return 'unknown';
      if (typeIs(type, /^PrivacyService$/)) return 'privacy';
      // TypeFlags.Any = 1, TypeFlags.Unknown = 2: nothing proves it is not privacy.
      return type.flags & 3 ? 'unknown' : 'other';
    };
    const isPrisma = (/** @type {import('estree').Node} */ node) => {
      const type = typeOf(node);
      return !!type && (typeIs(type, PRISMA_TYPE) || PRISMA_TYPE.test(checker.typeToString(type)));
    };
    /** True if any object in the member chain of `callee` is a Prisma client. */
    const chainHasPrisma = (/** @type {any} */ callee) => {
      let node = callee;
      while (node.type === 'MemberExpression') {
        if (node.object.type !== 'Super' && isPrisma(node.object)) return true;
        node = node.object;
      }
      return false;
    };

    /** @param {import('estree').Node} node @param {string | undefined} name */
    const checkExit = (node, name) => {
      if (ownChannel && name && SHARED.has(name)) {
        context.report({ node, messageId: 'mixed', data: { name } });
        return;
      }
      if (insidePrivacy || !name || !METHODS.has(name) || matches(exits[name] ?? [])) return;
      const list = exits[name] ?? [];
      context.report({
        node,
        messageId: 'exit',
        data: { name, allowed: list.length ? list.join(', ') : 'modules/privacy' },
      });
    };
    const reportFinding = (/** @type {import('estree').Node} */ node) =>
      context.report({ node, messageId: 'finding', data: { allowed: FINDING_ALLOW.join(', ') } });

    /** @param {any} obj @param {boolean} inRelation */
    const checkArgs = (obj, inRelation) => {
      if (obj?.type !== 'ObjectExpression') return;
      for (const prop of obj.properties) {
        if (prop.type !== 'Property') continue;
        const key = keyName(prop, prop.key);
        if (inRelation && key && FINDING_RELATIONS.has(key) && !withoutNumbers(prop.value)) {
          reportFinding(prop);
          continue;
        }
        checkArgs(prop.value, key === 'include' || key === 'select' || inRelation);
      }
    };

    return {
      MemberExpression(node) {
        if (node.object.type === 'Super') return;
        const name = keyName(node, node.property);
        if (!insidePrivacy) {
          if (name !== undefined) {
            if ((METHODS.has(name) || SHARED.has(name)) && kind(node.object) !== 'other')
              checkExit(node, name);
          } else if (kind(node.object) === 'privacy') {
            context.report({ node, messageId: 'dynamic' });
          }
        }
        if (findingsAllowed || name !== 'finding' || !isPrisma(node.object)) return;
        const parent = /** @type {any} */ (node).parent;
        const method =
          parent?.type === 'MemberExpression' && parent.object === node
            ? keyName(parent, parent.property)
            : undefined;
        if (method !== 'count') reportFinding(node);
      },
      ObjectPattern(node) {
        if (insidePrivacy) return;
        const k = kind(node);
        if (k === 'other') return;
        for (const prop of node.properties) {
          if (prop.type !== 'Property') {
            if (k === 'privacy') context.report({ node: prop, messageId: 'dynamic' });
            continue;
          }
          const name = keyName(prop, prop.key);
          if (name !== undefined) checkExit(prop, name);
          else if (k === 'privacy') context.report({ node: prop, messageId: 'dynamic' });
        }
      },
      CallExpression(node) {
        if (findingsAllowed || node.callee.type !== 'MemberExpression') return;
        if (RAW_METHODS.has(keyName(node.callee, node.callee.property) ?? '')) {
          if (node.arguments.some((arg) => FINDING_TABLE.test(sqlText(arg)))) reportFinding(node);
          return;
        }
        if (chainHasPrisma(node.callee)) for (const arg of node.arguments) checkArgs(arg, false);
      },
      TaggedTemplateExpression(node) {
        const tag = /** @type {any} */ (node.tag);
        if (findingsAllowed || tag.type !== 'MemberExpression') return;
        const name = keyName(tag, tag.property);
        const raw =
          RAW_METHODS.has(name ?? '') ||
          (name === 'sql' && tag.object.type === 'Identifier' && tag.object.name === 'Prisma');
        if (raw && FINDING_TABLE.test(sqlText(node.quasi))) reportFinding(node);
      },
    };
  },
};
