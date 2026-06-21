/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'warn',
      comment:
        'Circular dependencies make modules harder to reason about and can break ESM live bindings or lazy-loaded registries.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'shared-no-domain-deps',
      severity: 'warn',
      comment:
        "@open-mercato/shared must have zero domain dependencies — no @open-mercato/core or other domain/UI/provider packages (packages/shared/AGENTS.md). Cross-cutting infra siblings (cache/events/queue) and lazy `await import(...)` escape hatches are exempt. Currently surfaces pre-existing debt in shared/src/lib/{data/engine,crud,commands,encryption}.",
      from: { path: '^packages/shared/src' },
      to: {
        path: '^(packages/(core|ui|enterprise|checkout|webhooks|gateway-stripe|channel-gmail|channel-imap|storage-s3|sync-akeneo)/|apps/)',
        dependencyTypesNot: ['dynamic-import'],
      },
    },
    {
      name: 'packages-no-app-deps',
      severity: 'error',
      comment:
        'Packages must not depend on apps/mercato — the app consumes packages, never the reverse. Lazy `await import(...)` escape hatches used to break cycles are exempt.',
      from: { path: '^packages/' },
      to: { path: '^apps/', dependencyTypesNot: ['dynamic-import'] },
    },
    {
      name: 'oss-no-enterprise-deps',
      severity: 'error',
      comment:
        'OSS packages must not depend on the commercial enterprise overlay (packages/enterprise/AGENTS.md). Lazy `await import(...)` escape hatches used to break cycles are exempt.',
      from: { path: '^packages/(?!enterprise/)' },
      to: { path: '^packages/enterprise/', dependencyTypesNot: ['dynamic-import'] },
    },
    {
      name: 'core-no-cross-module-entity-imports',
      severity: 'warn',
      comment:
        "No direct ORM relationships between modules — fetch related data via foreign-key IDs/services instead of importing another module's entities (root AGENTS.md -> Architecture). Lazy `await import(...)` escape hatches used to break cycles are exempt.",
      from: { path: '^packages/core/src/modules/([^/]+)/' },
      to: {
        path: '^packages/core/src/modules/(?!$1/)[^/]+/data/entities',
        dependencyTypesNot: ['dynamic-import'],
      },
    },
  ],
  options: {
    tsConfig: { fileName: '.dependency-cruiser.tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'types', 'node', 'require', 'default'],
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    },
    includeOnly: '^(packages|apps)/',
    exclude: {
      path: [
        'node_modules',
        '(^|/)dist/',
        '(^|/)generated/',
        '\\.generated\\.[cm]?[jt]sx?$',
        '(^|/)\\.(next|mercato|turbo)/',
        '(^|/)(coverage|test-results|playwright-report|build)/',
        '\\.(test|spec)\\.[cm]?[jt]sx?$',
        '(^|/)__tests__/',
        '(^|/)__integration__/',
        '^apps/docs/',
        '^external/',
      ],
    },
    doNotFollow: { path: 'node_modules' },
    reporterOptions: {
      dot: { collapsePattern: '^(packages|apps)/[^/]+' },
      archi: { collapsePattern: '^(packages|apps)/[^/]+' },
    },
  },
}
