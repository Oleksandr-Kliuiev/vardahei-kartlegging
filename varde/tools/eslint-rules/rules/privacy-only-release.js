// Rule `varde/privacy-only-release` (type-aware; allow-list tightened in 0.15).
// The `privacy` module is the only release point for responses and aggregate snapshots
// (ADR-021, ADR-018). Outside the allow-list the rule reports:
//  (a) access to `response` / `aggregateSnapshot` on a PrismaClient / TransactionClient value;
//  (b) `response(s)` / `aggregateSnapshot(s)` keys in `include` / `select` of such calls;
//  (c) raw SQL (`$queryRaw*`, `$executeRaw*`, `Prisma.sql`) mentioning response / aggregate_snapshot;
//  (d) `PrismaService` / `@prisma/client` imports in `*.controller.ts` and `*.gateway.ts`.
// Types are matched by name (not module): stage 0 has no such models yet.
// Since 3.1 the same holds for seminar participants (`contact`, `registration`, ADR-017) with their
// own allow-list: only modules/privacy/participants.ts reads or writes them.

/**
 * Fixed allow-list; every entry has its own test (privacy-only-release.test.ts). Since 0.15
 * only the facade and the response source of modules/privacy may read these models.
 */
export const DEFAULT_ALLOW = Object.freeze([
  'apps/api/src/modules/privacy/privacy.service.ts',
  'apps/api/src/modules/privacy/source.ts',
  'apps/api/src/modules/privacy/prisma-source.ts',
  'apps/api/src/modules/privacy/prisma-snapshot-store.ts',
  'apps/api/src/modules/privacy/response-store.ts',
  'apps/api/prisma/**',
]);

/** Seminar participants (3.1): names and e-mail addresses only through the participant store. */
export const PARTICIPANT_ALLOW = Object.freeze([
  'apps/api/src/modules/privacy/participants.ts',
  'apps/api/prisma/**',
]);

const MODEL_PROPS = new Set(['response', 'aggregateSnapshot']);
const RELATION_KEYS = new Set(['response', 'responses', 'aggregateSnapshot', 'aggregateSnapshots']);
const PARTICIPANT_PROPS = new Set(['contact', 'registration']);
const PARTICIPANT_RELATIONS = new Set(['contact', 'contacts', 'registration', 'registrations']);
const RAW_METHODS = new Set(['$queryRaw', '$queryRawUnsafe', '$executeRaw', '$executeRawUnsafe']);
const RAW_TEXT = /response|aggregate_snapshot/i;
const PARTICIPANT_RAW = /\b(contact|registration)\b/i;
const PRISMA_TYPE = /\b(PrismaClient|TransactionClient)\b/;
const THIN_FILE = /\.(controller|gateway)\.ts$/;

/** @param {string} glob */
export function globToRegExp(glob) {
  const body = glob
    .split('**')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*'))
    .join('.*');
  return new RegExp(`(^|/)${body}$`);
}

/** @param {import('estree').Node | undefined | null} node */
function propName(node) {
  if (!node) return undefined;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  return undefined;
}

/** @type {import('eslint').Rule.RuleModule} */
export const privacyOnlyRelease = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Responses and aggregate snapshots leave the database only via modules/privacy',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allow: { type: 'array', items: { type: 'string' } },
          participants: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      model: 'Access to `{{name}}` outside modules/privacy: use PrivacyService (ADR-021).',
      relation: 'Reading `{{name}}` through include/select outside modules/privacy (ADR-021).',
      raw: 'Raw SQL touching responses, aggregate snapshots or seminar participants outside modules/privacy (ADR-021).',
      thin: 'Controllers and gateways stay thin: no `{{name}}` import (PRINCIPLES §12).',
    },
  },
  create(context) {
    const filename = context.filename.split('\\').join('/');
    const allow = context.options[0]?.allow ?? DEFAULT_ALLOW;
    const participantAllow = context.options[0]?.participants ?? PARTICIPANT_ALLOW;
    const matches = (/** @type {readonly string[]} */ globs) =>
      globs.some((glob) => globToRegExp(glob).test(filename));
    const responsesAllowed = matches(allow);
    const participantsAllowed = matches(participantAllow);
    if (responsesAllowed && participantsAllowed) return {};
    const models = new Set([
      ...(responsesAllowed ? [] : MODEL_PROPS),
      ...(participantsAllowed ? [] : PARTICIPANT_PROPS),
    ]);
    const relations = new Set([
      ...(responsesAllowed ? [] : RELATION_KEYS),
      ...(participantsAllowed ? [] : PARTICIPANT_RELATIONS),
    ]);
    const rawTexts = [
      ...(responsesAllowed ? [] : [RAW_TEXT]),
      ...(participantsAllowed ? [] : [PARTICIPANT_RAW]),
    ];
    const isRawText = (/** @type {string} */ text) => rawTexts.some((r) => r.test(text));

    const services = context.sourceCode.parserServices;
    const program = services?.program;
    const checker = program?.getTypeChecker();
    /** @type {Map<unknown, unknown> | undefined} */
    const toTs = services?.esTreeNodeToTSNodeMap;

    /** @param {import('typescript').Type} type @param {number} depth @returns {boolean} */
    const typeIsPrisma = (type, depth = 0) => {
      if (!checker || depth > 4) return false;
      const names = [type.aliasSymbol?.getName(), type.getSymbol()?.getName()];
      if (names.some((n) => n === 'PrismaClient' || n === 'TransactionClient')) return true;
      if (PRISMA_TYPE.test(checker.typeToString(type))) return true;
      if (type.isUnionOrIntersection()) return type.types.some((t) => typeIsPrisma(t, depth + 1));
      if (type.isClassOrInterface()) {
        return (checker.getBaseTypes(type) ?? []).some((t) => typeIsPrisma(t, depth + 1));
      }
      return false;
    };

    /** @param {import('estree').Node} node */
    const isPrisma = (node) => {
      if (!checker || !toTs) return false;
      const tsNode = toTs.get(node);
      if (!tsNode) return false;
      return typeIsPrisma(
        checker.getTypeAtLocation(/** @type {import('typescript').Node} */ (tsNode)),
      );
    };

    /** True if any object in the member chain of `callee` is a Prisma client. */
    const chainHasPrisma = (/** @type {import('estree').Node} */ callee) => {
      let node = callee;
      while (node.type === 'MemberExpression') {
        if (node.object.type !== 'Super' && isPrisma(node.object)) return true;
        node = node.object;
      }
      return false;
    };

    /** @param {import('estree').Node} obj @param {boolean} inRelation */
    const checkArgs = (obj, inRelation) => {
      if (obj.type !== 'ObjectExpression') return;
      for (const prop of obj.properties) {
        if (prop.type !== 'Property') continue;
        const key = propName(prop.key);
        if (inRelation && key && relations.has(key)) {
          context.report({ node: prop, messageId: 'relation', data: { name: key } });
        }
        checkArgs(prop.value, key === 'include' || key === 'select' || inRelation);
      }
    };

    /** @param {import('estree').TemplateLiteral} quasi */
    const templateText = (quasi) =>
      quasi.quasis.map((q) => q.value.cooked ?? q.value.raw).join(' ');

    /** @param {import('estree').Node} tag */
    const isRawTag = (tag) => {
      if (tag.type === 'MemberExpression') {
        const name = propName(tag.property);
        if (name && RAW_METHODS.has(name)) return true;
        return name === 'sql' && tag.object.type === 'Identifier' && tag.object.name === 'Prisma';
      }
      return false;
    };

    return {
      MemberExpression(node) {
        const name = propName(node.property);
        if (
          name &&
          models.has(name) &&
          node.object.type !== 'Super' &&
          isPrisma(node.object)
        ) {
          context.report({ node, messageId: 'model', data: { name } });
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== 'MemberExpression') return;
        const method = propName(callee.property);
        if (method && RAW_METHODS.has(method)) {
          for (const arg of node.arguments) {
            const text =
              arg.type === 'Literal' && typeof arg.value === 'string'
                ? arg.value
                : arg.type === 'TemplateLiteral'
                  ? templateText(arg)
                  : '';
            if (isRawText(text)) context.report({ node, messageId: 'raw' });
          }
        }
        if (chainHasPrisma(callee)) for (const arg of node.arguments) checkArgs(arg, false);
      },
      TaggedTemplateExpression(node) {
        if (isRawTag(node.tag) && isRawText(templateText(node.quasi))) {
          context.report({ node, messageId: 'raw' });
        }
      },
      ImportDeclaration(node) {
        if (!THIN_FILE.test(filename)) return;
        const source = String(node.source.value);
        const names = node.specifiers.map((s) => s.local.name);
        if (source === '@prisma/client' || /(^|\/)prisma\.service(\.js)?$/.test(source)) {
          context.report({ node, messageId: 'thin', data: { name: source } });
        } else if (names.includes('PrismaService')) {
          context.report({ node, messageId: 'thin', data: { name: 'PrismaService' } });
        }
      },
    };
  },
};
