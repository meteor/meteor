const EXPLICIT_TEST_GROUPS = Object.freeze({
  cli: {
    label: 'CLI',
    pattern: '^CLI /',
  },
  angular_coffeescript: {
    label: 'Angular & Coffeescript',
    pattern: '^(?:Meteor Skeletons / Angular Skeleton /|CoffeeScript App Bundling /|Meteor Skeletons / Coffeescript Skeleton /)',
  },
  babel_tailwind: {
    label: 'Babel & Tailwind',
    pattern: '^(?:Babel App Bundling /|Meteor Skeletons / Babel Skeleton /|Meteor Skeletons / (?:Tailwind|Typescript Tailwind) Skeleton /)',
  },
  blaze: {
    label: 'Blaze',
    pattern: '^(?:BasicBlaze App Bundling /|Blaze Router Integration /|Full Blaze App Bundling /|Meteor Skeletons / Blaze Skeleton /)',
  },
  assets_full_pwa: {
    label: 'Assets, Full & PWA',
    pattern: '^(?:Assets App Bundling /|Meteor Skeletons / (?:Full|PWA) Skeleton /)',
  },
  examples: {
    label: 'Examples',
    pattern: '^Examples /',
  },
  monorepo: {
    label: 'Monorepo',
    pattern: '^(?:Monorepo App Bundling /|Pnpm Monorepo App Bundling /|Symlink Monorepo App Bundling /|Yarn Monorepo Dependency Auto-install /|Meteor Skeletons / Pnpm Skeleton /)',
  },
  other: {
    label: 'Other',
    pattern: '^(?:Other /|Meteor Skeletons / Other / Bare Skeleton /)',
  },
  react_vue: {
    label: 'React & Vue',
    pattern: '^(?:React App Bundling /|Meteor Skeletons / (?:Apollo|ChakraUI|React) Skeleton /|Vue App Bundling /|Meteor Skeletons / Vue Skeleton /)',
  },
  react_router: {
    label: 'R.Router',
    pattern: '^R\\.Router App Bundling /',
  },
  server_runtime: {
    label: 'Server Runtime',
    pattern: '^Regressions / Server Runtime',
  },
  regressions: {
    label: 'Regressions',
    pattern: '^(?:Regressions / (?!Server Runtime)|Regression /|Rspack bundle probe)',
  },
  solid_svelte: {
    label: 'Solid & Svelte',
    pattern: '^(?:Solid App Bundling /|Meteor Skeletons / Solid Skeleton /|Svelte App Bundling /|Meteor Skeletons / Svelte Skeleton /)',
  },
  typescript: {
    label: 'Typescript',
    pattern: '^(?:TypeScript App Bundling /|Meteor Skeletons / Typescript Skeleton /)',
  },
});

// Passing this through Jest's CLI replaces the config-level ignore list, so
// preserve the existing apps/ fixture exclusion while also leaving Accounts
// to its dedicated workflow.
const GROUP_EXCLUDED_TEST_PATH_PATTERN =
  '(?:[/\\\\]apps[/\\\\]|accounts\\.test\\.js$)';

function createUncategorizedPattern(groups = EXPLICIT_TEST_GROUPS) {
  const explicitPatterns = Object.values(groups).map(({ pattern }) => {
    if (!pattern.startsWith('^')) {
      throw new Error(`E2E test group pattern must be anchored: ${pattern}`);
    }

    return `(?:${pattern.slice(1)})`;
  });

  return explicitPatterns.length === 0
    ? '^.+'
    : `^(?!(?:${explicitPatterns.join('|')})).+`;
}

const TEST_GROUPS = Object.freeze({
  ...EXPLICIT_TEST_GROUPS,
  accounts: {
    label: 'Accounts',
    pattern: '^',
    testPathPattern: 'accounts\\.test\\.js$',
    testPathIgnorePattern: '[/\\\\]apps[/\\\\]',
    workflow: 'accounts',
  },
  uncategorized: {
    label: 'Uncategorized',
    pattern: createUncategorizedPattern(),
    fallback: true,
  },
});

function getTestGroup(name) {
  const group = Object.hasOwn(TEST_GROUPS, name) && TEST_GROUPS[name];
  if (!group) {
    throw new Error(`Unknown E2E test group "${name || ''}". Available groups: ${Object.keys(TEST_GROUPS).join(', ')}`);
  }
  return group;
}

function getGroupIgnoredPaths(group) {
  return group.testPathIgnorePattern || GROUP_EXCLUDED_TEST_PATH_PATTERN;
}

// The runner and coverage audit share both name and path selection rules.
function getGroupJestArgs(name) {
  const group = getTestGroup(name);
  return [
    '--testNamePattern', group.pattern,
    '--testPathIgnorePatterns', getGroupIgnoredPaths(group),
    ...(group.testPathPattern ? ['--testPathPattern', group.testPathPattern] : []),
  ];
}

function matchesTestGroup(group, testPath, fullName) {
  return !new RegExp(getGroupIgnoredPaths(group)).test(testPath) &&
    (!group.testPathPattern || new RegExp(group.testPathPattern).test(testPath)) &&
    new RegExp(group.pattern).test(fullName);
}

function getTestGroupMatrix(workflow = 'e2e') {
  for (const [name, group] of Object.entries(TEST_GROUPS)) {
    if (!['e2e', 'accounts'].includes(group.workflow || 'e2e')) {
      throw new Error(`E2E group ${name} has an unknown workflow: ${group.workflow}`);
    }
  }
  return {
    include: Object.entries(TEST_GROUPS)
      .filter(([, group]) => (group.workflow || 'e2e') === workflow)
      .map(([group, { label }]) => ({ category: label, group })),
  };
}

module.exports = {
  createUncategorizedPattern,
  EXPLICIT_TEST_GROUPS,
  getGroupJestArgs,
  getTestGroupMatrix,
  GROUP_EXCLUDED_TEST_PATH_PATTERN,
  matchesTestGroup,
  TEST_GROUPS,
};
