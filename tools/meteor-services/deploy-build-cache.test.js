const { buildCacheMatchesSelection } = require('./deploy-build-cache.js');

describe('deploy build cache transport selection', () => {
  const selection = { gitCommitHash: 'commit-a', ddpTransport: 'uws' };

  test('reuses a cache with the same commit and transport', () => {
    expect(buildCacheMatchesSelection({ ...selection }, selection)).toBe(true);
  });

  test.each([
    ['null cache', null],
    ['missing cache', undefined],
    ['missing transport', { gitCommitHash: 'commit-a' }],
    ['empty transport', { gitCommitHash: 'commit-a', ddpTransport: '' }],
    ['missing commit', { ddpTransport: 'uws' }],
    ['empty commit', { gitCommitHash: '', ddpTransport: 'uws' }],
    ['different commit', { gitCommitHash: 'commit-b', ddpTransport: 'uws' }],
    ['different transport', { gitCommitHash: 'commit-a', ddpTransport: 'both' }],
  ])('invalidates %s', (description, cache) => {
    expect(buildCacheMatchesSelection(cache, selection)).toBe(false);
  });

  test.each([
    { gitCommitHash: '', ddpTransport: 'uws' },
    { gitCommitHash: 'commit-a', ddpTransport: '' },
    { ddpTransport: 'uws' },
    { gitCommitHash: 'commit-a' },
  ])('does not reuse matching incomplete metadata %p', incomplete => {
    expect(buildCacheMatchesSelection(incomplete, incomplete)).toBe(false);
  });
});
