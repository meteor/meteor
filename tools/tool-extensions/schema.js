import { schemaError } from './errors.js';

export const TOOL_EXTENSION_API_VERSION = '1.0';
export const HCP_MODES = new Set(['none', 'web-assets', 'native-runtime']);

export function normalizeToolExtension(input, { packageName } = {}) {
  if (!input || typeof input !== 'object') {
    throw schemaError('tool extension metadata must be an object');
  }
  if (!input.id || typeof input.id !== 'string') {
    throw schemaError('tool extension id is required');
  }
  if (input.apiVersion !== TOOL_EXTENSION_API_VERSION) {
    throw schemaError(`unsupported tool extension apiVersion: ${input.apiVersion}`);
  }

  const config = input.nativeProjectConfig;
  if (config != null && (
    typeof config.file !== 'string' || !config.file ||
    (config.platformEnv != null && (typeof config.platformEnv !== 'string' || !config.platformEnv)) ||
    !config.paths || typeof config.paths !== 'object' || Array.isArray(config.paths) ||
    Object.values(config.paths).some(keys =>
      !Array.isArray(keys) || !keys.length || keys.some(key => typeof key !== 'string' || !key)
    )
  )) {
    throw schemaError('nativeProjectConfig requires a config file base name and a key path for each configured platform');
  }

  const normalized = {
    id: input.id,
    label: input.label || input.id,
    apiVersion: input.apiVersion,
    packageName: input.packageName || packageName,
    fallback: input.fallback === true,
    ...(config && { nativeProjectConfig: config }),
    platforms: normalizePlatforms(input.platforms || []),
    buildTargets: normalizeBuildTargets(input.buildTargets || []),
    commands: Array.isArray(input.commands)
      ? input.commands.map(command => ({ ...command }))
      : [],
    capabilities: { ...(input.capabilities || {}) },
  };

  if (!normalized.packageName) {
    throw schemaError(`tool extension ${input.id} must have a packageName`);
  }

  return normalized;
}

function normalizePlatforms(platforms) {
  if (!Array.isArray(platforms)) {
    throw schemaError('tool extension platforms must be an array');
  }

  return platforms.map(platform => {
    if (!platform.name || typeof platform.name !== 'string') {
      throw schemaError('platform name is required');
    }
    if (!platform.provider || typeof platform.provider !== 'string') {
      throw schemaError(`platform ${platform.name} provider is required`);
    }
    if (platform.hcpMode && !HCP_MODES.has(platform.hcpMode)) {
      throw schemaError(`unsupported hcp mode: ${platform.hcpMode}`);
    }

    return {
      name: platform.name,
      kind: platform.kind || 'custom',
      provider: platform.provider,
      claimsBuiltIn: !!platform.claimsBuiltIn,
      aliases: [...(platform.aliases || [])],
      buildTargets: [...(platform.buildTargets || [])],
      nativeProjectDir: platform.nativeProjectDir || null,
      hcpMode: platform.hcpMode || 'none',
    };
  });
}

function normalizeBuildTargets(buildTargets) {
  if (!Array.isArray(buildTargets)) {
    throw schemaError('tool extension buildTargets must be an array');
  }

  return buildTargets.map(target => {
    if (!target.name || typeof target.name !== 'string') {
      throw schemaError('build target name is required');
    }
    if (target.hcpMode && !HCP_MODES.has(target.hcpMode)) {
      throw schemaError(`unsupported hcp mode: ${target.hcpMode}`);
    }

    return {
      name: target.name,
      baseArch: target.baseArch || null,
      outputKind: target.outputKind || 'web-dir',
      runtime: target.runtime || 'web',
      hcpMode: target.hcpMode || 'none',
    };
  });
}
