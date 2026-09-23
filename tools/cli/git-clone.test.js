jest.mock('../fs/files', () => ({}));

const { isGitSourceLike, parseGitUrl, resolveRepoUrl } = require('./git-clone.js');

describe('isGitSourceLike', () => {
  it('detects full Git URLs', () => {
    expect(isGitSourceLike('https://github.com/owner/repo')).toBe(true);
    expect(isGitSourceLike('http://github.com/owner/repo')).toBe(true);
    expect(isGitSourceLike('ssh://git@github.com/owner/repo.git')).toBe(true);
    expect(isGitSourceLike('git://github.com/owner/repo.git')).toBe(true);
    expect(isGitSourceLike('file:///tmp/repo')).toBe(true);
  });

  it('detects SCP-style Git URLs', () => {
    expect(isGitSourceLike('git@github.com:owner/repo.git')).toBe(true);
  });

  it('detects GitHub shorthand owner/repo', () => {
    expect(isGitSourceLike('Meteor-Community-Packages/meteor-publish-composite'))
      .toBe(true);
  });

  it('can ignore GitHub shorthand when it would conflict with paths', () => {
    expect(isGitSourceLike('owner/repo', { githubShorthand: false }))
      .toBe(false);
    expect(isGitSourceLike('https://github.com/owner/repo', {
      githubShorthand: false,
    })).toBe(true);
  });

  it('does not detect package-like inputs', () => {
    expect(isGitSourceLike('accounts-base')).toBe(false);
    expect(isGitSourceLike('iron:router')).toBe(false);
    expect(isGitSourceLike('accounts-base@1.0.0')).toBe(false);
    expect(isGitSourceLike('cordova:cordova-plugin-camera')).toBe(false);
    expect(isGitSourceLike('@scope/name')).toBe(false);
  });

  it('does not detect local paths as GitHub shorthand', () => {
    expect(isGitSourceLike('../repo')).toBe(false);
    expect(isGitSourceLike('./repo')).toBe(false);
    expect(isGitSourceLike('/tmp/repo')).toBe(false);
  });
});

describe('resolveRepoUrl', () => {
  it('expands GitHub shorthand owner/repo', () => {
    expect(resolveRepoUrl('meteor/meteor3-vue3'))
      .toBe('https://github.com/meteor/meteor3-vue3');
  });

  it('returns full URLs unchanged', () => {
    expect(resolveRepoUrl('https://github.com/meteor/meteor3-vue3'))
      .toBe('https://github.com/meteor/meteor3-vue3');
  });

  it('returns SSH URLs unchanged', () => {
    expect(resolveRepoUrl('git@github.com:owner/repo.git'))
      .toBe('git@github.com:owner/repo.git');
  });

  it('returns npm-style scoped names unchanged', () => {
    expect(resolveRepoUrl('@scope/name')).toBe('@scope/name');
  });

  it('returns non-string input unchanged', () => {
    expect(resolveRepoUrl(null)).toBe(null);
    expect(resolveRepoUrl(42)).toBe(42);
  });
});

describe('parseGitUrl', () => {
  describe('GitHub URLs', () => {
    it('parses branch-only URL', () => {
      const result = parseGitUrl('https://github.com/meteor/meteor3-vue3/tree/3.4-rspack');
      expect(result).toEqual({
        repoUrl: 'https://github.com/meteor/meteor3-vue3',
        branch: '3.4-rspack',
        dir: null,
      });
    });

    it('parses branch and directory', () => {
      const result = parseGitUrl('https://github.com/meteor/examples/tree/main/parties');
      expect(result).toEqual({
        repoUrl: 'https://github.com/meteor/examples',
        branch: 'main',
        dir: 'parties',
      });
    });

    it('parses branch and nested directory', () => {
      const result = parseGitUrl('https://github.com/owner/repo/tree/develop/src/app/demo');
      expect(result).toEqual({
        repoUrl: 'https://github.com/owner/repo',
        branch: 'develop',
        dir: 'src/app/demo',
      });
    });

    it('strips trailing slashes from dir', () => {
      const result = parseGitUrl('https://github.com/owner/repo/tree/main/dir/');
      expect(result).toEqual({
        repoUrl: 'https://github.com/owner/repo',
        branch: 'main',
        dir: 'dir',
      });
    });

    it('decodes percent-encoded branch names', () => {
      const result = parseGitUrl('https://github.com/owner/repo/tree/feature%2Ftest');
      expect(result).toEqual({
        repoUrl: 'https://github.com/owner/repo',
        branch: 'feature/test',
        dir: null,
      });
    });

    it('works with http (not https)', () => {
      const result = parseGitUrl('http://github.com/owner/repo/tree/main');
      expect(result).toEqual({
        repoUrl: 'http://github.com/owner/repo',
        branch: 'main',
        dir: null,
      });
    });
  });

  describe('GitLab URLs', () => {
    it('parses branch-only URL', () => {
      const result = parseGitUrl('https://gitlab.com/owner/repo/-/tree/main');
      expect(result).toEqual({
        repoUrl: 'https://gitlab.com/owner/repo',
        branch: 'main',
        dir: null,
      });
    });

    it('parses branch and directory', () => {
      const result = parseGitUrl('https://gitlab.com/ns/project/-/tree/develop/src');
      expect(result).toEqual({
        repoUrl: 'https://gitlab.com/ns/project',
        branch: 'develop',
        dir: 'src',
      });
    });
  });

  describe('Bitbucket URLs', () => {
    it('parses branch-only URL', () => {
      const result = parseGitUrl('https://bitbucket.org/owner/repo/src/main');
      expect(result).toEqual({
        repoUrl: 'https://bitbucket.org/owner/repo',
        branch: 'main',
        dir: null,
      });
    });

    it('parses branch and directory', () => {
      const result = parseGitUrl('https://bitbucket.org/owner/repo/src/develop/lib/core');
      expect(result).toEqual({
        repoUrl: 'https://bitbucket.org/owner/repo',
        branch: 'develop',
        dir: 'lib/core',
      });
    });
  });

  describe('GitHub shorthand', () => {
    it('expands owner/repo to a github URL', () => {
      const result = parseGitUrl('meteor/meteor3-vue3');
      expect(result).toEqual({
        repoUrl: 'https://github.com/meteor/meteor3-vue3',
        branch: null,
        dir: null,
      });
    });
  });

  describe('plain git URLs (no tree/src segment)', () => {
    it('returns URL unchanged with null branch and dir', () => {
      const result = parseGitUrl('https://github.com/meteor/meteor3-vue3');
      expect(result).toEqual({
        repoUrl: 'https://github.com/meteor/meteor3-vue3',
        branch: null,
        dir: null,
      });
    });

    it('handles SSH-style URLs unchanged', () => {
      const result = parseGitUrl('git@github.com:owner/repo.git');
      expect(result).toEqual({
        repoUrl: 'git@github.com:owner/repo.git',
        branch: null,
        dir: null,
      });
    });
  });

  describe('edge cases', () => {
    it('returns defaults for null input', () => {
      const result = parseGitUrl(null);
      expect(result).toEqual({ repoUrl: null, branch: null, dir: null });
    });

    it('returns defaults for empty string', () => {
      const result = parseGitUrl('');
      expect(result).toEqual({ repoUrl: '', branch: null, dir: null });
    });

    it('returns defaults for non-string input', () => {
      const result = parseGitUrl(42);
      expect(result).toEqual({ repoUrl: 42, branch: null, dir: null });
    });
  });
});
