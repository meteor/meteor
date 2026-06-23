import { createHash } from 'crypto';

function hashClientProgram(manifest, includeFilter, runtimeConfig = {}) {
  const hash = createHash('sha1');

  hash.update(JSON.stringify(runtimeConfig));

  for (const resource of manifest || []) {
    if (
      (resource.where === 'client' || resource.where === 'internal') &&
      (!includeFilter || includeFilter(resource.type, resource.replaceable))
    ) {
      hash.update(resource.path || '');
      hash.update(resource.hash || '');
    }
  }

  return hash.digest('hex');
}

export function normalizeWebProgramVersions(program, runtimeConfig = {}) {
  const normalized = { ...program };
  const manifest = Array.isArray(normalized.manifest) ? normalized.manifest : [];
  const autoupdateVersion = process.env.AUTOUPDATE_VERSION;

  normalized.version = normalized.version || autoupdateVersion ||
    hashClientProgram(manifest, null, runtimeConfig);
  normalized.versionRefreshable = normalized.versionRefreshable || autoupdateVersion ||
    hashClientProgram(manifest, type => type === 'css', runtimeConfig);
  normalized.versionNonRefreshable = normalized.versionNonRefreshable || autoupdateVersion ||
    hashClientProgram(
      manifest,
      (type, replaceable) => type !== 'css' && !replaceable,
      runtimeConfig
    );
  normalized.versionReplaceable = normalized.versionReplaceable || autoupdateVersion ||
    hashClientProgram(
      manifest,
      (_type, replaceable) => replaceable,
      runtimeConfig
    );

  return normalized;
}

function stripUrlPrefix(url, prefix) {
  if (!prefix || typeof url !== 'string' || !url.startsWith(prefix)) {
    return url;
  }

  return `/${url.slice(prefix.length)}`;
}

export function normalizeWebProgramAssetUrls(program, { stripPrefix } = {}) {
  const normalized = { ...program };
  const manifest = Array.isArray(normalized.manifest) ? normalized.manifest : [];

  normalized.manifest = manifest.map(resource => {
    if (!resource || typeof resource !== 'object') {
      return resource;
    }

    let next = resource;
    for (const key of ['url', 'sourceMapUrl']) {
      const value = resource[key];
      const stripped = stripUrlPrefix(value, stripPrefix);
      if (stripped !== value) {
        if (next === resource) {
          next = { ...resource };
        }
        next[key] = stripped;
      }
    }

    return next;
  });

  return normalized;
}
