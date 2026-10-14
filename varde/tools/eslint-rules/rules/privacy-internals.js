// The service is the only public privacy entry. Storage tests have two narrow exceptions;
// dynamic imports and re-exports obey the same boundary as static imports.
export const privacyInternals = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      internal: 'Outside modules/privacy only privacy.service may be imported (ADR-021).',
      token: 'RESPONSE_SOURCE is private to modules/privacy; use PrivacyService.',
    },
  },
  create(context) {
    const filename = context.filename.replaceAll('\\', '/');
    const test = filename.includes('/apps/api/test/');
    function check(node, source) {
      const path = source?.value;
      if (typeof path !== 'string') return;
      const internal = /(?:^|\/)privacy\/(.+)$/.exec(path)?.[1];
      if (internal === undefined || /^privacy\.service(?:\.[cm]?[jt]s)?$/.test(internal)) return;
      if (test && /^(?:prisma-source|response-store)(?:\.[cm]?[jt]s)?$/.test(internal)) return;
      context.report({ node, messageId: 'internal' });
    }
    return {
      ImportDeclaration(node) {
        check(node, node.source);
        for (const spec of node.specifiers) {
          if (
            spec.imported?.name === 'RESPONSE_SOURCE' ||
            spec.imported?.value === 'RESPONSE_SOURCE'
          )
            context.report({ node: spec, messageId: 'token' });
        }
      },
      ExportNamedDeclaration(node) {
        check(node, node.source);
      },
      ExportAllDeclaration(node) {
        check(node, node.source);
      },
      ImportExpression(node) {
        check(node, node.source);
      },
      TSImportType(node) {
        check(node, node.argument);
      },
      MemberExpression(node) {
        if (node.property.name === 'RESPONSE_SOURCE' || node.property.value === 'RESPONSE_SOURCE')
          context.report({ node, messageId: 'token' });
      },
    };
  },
};
