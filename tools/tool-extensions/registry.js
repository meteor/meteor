import { conflictError, unknownPlatformError } from './errors.js';
import {
  normalizeToolExtension,
  TOOL_EXTENSION_API_VERSION,
} from './schema.js';

const BUILT_IN_PLATFORM_NAMES = new Set(['android', 'ios']);

export function createCordovaFallbackExtension() {
  return {
    id: 'meteor:cordova-fallback',
    label: 'Meteor Cordova',
    apiVersion: TOOL_EXTENSION_API_VERSION,
    packageName: 'meteor-tool',
    fallback: true,
    platforms: ['android', 'ios'].map(name => ({
      name,
      kind: 'mobile',
      provider: 'cordova',
      claimsBuiltIn: true,
      aliases: [`cordova:${name}`],
      buildTargets: ['web.cordova'],
      nativeProjectDir: name,
      hcpMode: 'native-runtime',
    })),
    buildTargets: [
      {
        name: 'web.cordova',
        baseArch: 'web.cordova',
        outputKind: 'cordova-project',
        runtime: 'cordova',
        hcpMode: 'native-runtime',
      },
    ],
    capabilities: {
      run: true,
      build: true,
      addPlatform: true,
      removePlatform: true,
      hcp: true,
    },
  };
}

export function createToolExtensionRegistry({ extensions = [] } = {}) {
  const normalizedExtensions = extensions.map(extension =>
    normalizeToolExtension(extension, {
      packageName: extension.packageName,
    })
  );

  function allPlatformNames() {
    return Array.from(new Set(
      normalizedExtensions.flatMap(extension =>
        extension.platforms.flatMap(platform => [
          platform.name,
          ...platform.aliases,
        ])
      )
    )).sort();
  }

  function resolvePlatform(name) {
    const matches = [];
    for (const extension of normalizedExtensions) {
      for (const platform of extension.platforms) {
        const isMatch = platform.name === name || platform.aliases.includes(name);
        if (!isMatch) {
          continue;
        }
        matches.push({
          extension,
          platform,
          isFallback: extension.fallback === true,
        });
      }
    }

    const installedMatches = matches.filter(match => !match.isFallback);
    if (installedMatches.length > 1) {
      throw conflictError(
        `Multiple installed packages can handle platform ${name}`,
        {
          platform: name,
          matches: installedMatches.map(match => match.extension.id),
        }
      );
    }
    if (installedMatches.length === 1) {
      return installedMatches[0];
    }
    if (matches.length === 1) {
      return matches[0];
    }
    if (matches.length > 1) {
      const nonBuiltInMatches = matches.filter(match =>
        !BUILT_IN_PLATFORM_NAMES.has(match.platform.name)
      );
      return nonBuiltInMatches[0] || matches[0];
    }

    throw unknownPlatformError(name, allPlatformNames());
  }

  function getBaseWebArchsForPlatform(name) {
    const resolved = resolvePlatform(name);
    const targetsByName = new Map(
      resolved.extension.buildTargets.map(target => [target.name, target])
    );

    return Array.from(new Set(
      resolved.platform.buildTargets
        .map(targetName => targetsByName.get(targetName))
        .filter(Boolean)
        .map(target => target.baseArch)
        .filter(Boolean)
    ));
  }

  function canHandlePlatform(name, capability) {
    const resolved = resolvePlatform(name);
    return resolved.extension.capabilities[capability] === true;
  }

  return {
    extensions: normalizedExtensions,
    allPlatformNames,
    resolvePlatform,
    getBaseWebArchsForPlatform,
    canHandlePlatform,
  };
}
