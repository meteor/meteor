function buildCacheMatchesSelection(cache, { gitCommitHash, ddpTransport }) {
  return !!(cache &&
    cache.gitCommitHash &&
    cache.ddpTransport &&
    cache.gitCommitHash === gitCommitHash &&
    cache.ddpTransport === ddpTransport);
}

module.exports = { buildCacheMatchesSelection };
