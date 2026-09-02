const EXPLICIT_TEST_GROUPS = Object.freeze({
  cli: {
    label: 'CLI',
    pattern: '^CLI /',
  },
  angular: {
    label: 'Angular',
    pattern: '^Meteor Skeletons / Angular Skeleton /',
  },
  babel: {
    label: 'Babel',
    pattern: '^(?:Babel App Bundling /|Meteor Skeletons / Babel Skeleton /)',
  },
  blaze: {
    label: 'Blaze',
    pattern: '^(?:BasicBlaze App Bundling /|Full Blaze App Bundling /|Meteor Skeletons / Blaze Skeleton /)',
  },
  coffeescript: {
    label: 'Coffeescript',
    pattern: '^(?:CoffeeScript App Bundling /|Meteor Skeletons / Coffeescript Skeleton /)',
  },
  full_skeleton: {
    label: 'Full Skeleton',
    pattern: '^Meteor Skeletons / Full Skeleton /',
  },
  tailwind_skeleton: {
    label: 'Tailwind Skeleton',
    pattern: '^Meteor Skeletons / (?:Tailwind|Typescript Tailwind) Skeleton /',
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
  react: {
    label: 'React',
    pattern: '^(?:React App Bundling /|Meteor Skeletons / (?:Apollo|ChakraUI|React) Skeleton /)',
  },
  react_router: {
    label: 'R.Router',
    pattern: '^R\\.Router App Bundling /',
  },
  regressions: {
    label: 'Regressions',
    pattern: '^Regressions /',
  },
  solid: {
    label: 'Solid',
    pattern: '^(?:Solid App Bundling /|Meteor Skeletons / Solid Skeleton /)',
  },
  svelte: {
    label: 'Svelte',
    pattern: '^(?:Svelte App Bundling /|Meteor Skeletons / Svelte Skeleton /)',
  },
  typescript: {
    label: 'Typescript',
    pattern: '^(?:TypeScript App Bundling /|Meteor Skeletons / Typescript Skeleton /)',
  },
  vue: {
    label: 'Vue',
    pattern: '^(?:Vue App Bundling /|Meteor Skeletons / Vue Skeleton /)',
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
  uncategorized: {
    label: 'Uncategorized',
    pattern: createUncategorizedPattern(),
    fallback: true,
    jestArgs: [
      '--testPathIgnorePatterns',
      GROUP_EXCLUDED_TEST_PATH_PATTERN,
    ],
  },
});

module.exports = {
  createUncategorizedPattern,
  EXPLICIT_TEST_GROUPS,
  GROUP_EXCLUDED_TEST_PATH_PATTERN,
  TEST_GROUPS,
};
