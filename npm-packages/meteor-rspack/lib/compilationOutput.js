// Type checkers and other plugins/watchers can invalidate a compilation without
// changing its output. This can affect any Rspack project, regardless of language.
// Rspack already compares asset contents before writing them, so track emitted
// flags and asset names without copying and hashing entire bundles in JS.
function createOutputTracker() {
  let version = 0;
  let previousNames;

  return stats => {
    const { assets } = stats.toJson({
      all: false,
      assets: true,
      cachedAssets: true,
      relatedAssets: true,
    });
    const pending = [...assets];
    const names = [];
    let emitted = false;
    for (let i = 0; i < pending.length; i++) {
      const asset = pending[i];
      names.push(asset.name);
      emitted ||= asset.emitted;
      // Source maps are nested under their parent asset in Rspack stats.
      if (asset.related) pending.push(...asset.related);
    }
    const currentNames = JSON.stringify(names.sort());
    if (emitted || currentNames !== previousNames) version++;
    previousNames = currentNames;
    return version;
  };
}

module.exports = { createOutputTracker };
