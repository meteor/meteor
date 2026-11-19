/** Native build requests and artifact collection, owned by the Capacitor provider. */
const fs = require('fs').promises;
const path = require('path');
const { CAPACITOR_PLATFORMS } = require('./constants');

export function getNativeBuildPlatforms(options, configuredPlatforms) {
  const selected = options.platforms ? String(options.platforms).split(',') : configuredPlatforms;
  return Array.from(new Set(selected.map(platform => platform.replace(/^capacitor:/, ''))
    .filter(platform => CAPACITOR_PLATFORMS.includes(platform))));
}

export function getNativeBuildRequest({ appDir, platform, config = {}, options = {}, outputDir }) {
  const nativeDir = path.resolve(appDir, config[platform]?.path || platform);
  const request = {
    platform,
    nativeDir,
    outputDir: path.join(outputDir, platform),
    args: ['build', platform],
    secrets: [config.android?.buildOptions?.keystorePassword, config.android?.buildOptions?.keystoreAliasPassword]
      .filter(value => typeof value === 'string' && value.length > 0),
  };
  if (platform === 'ios') {
    request.artifactDir = path.join(nativeDir, 'App', 'output');
    if (options.debug) request.args.push('--configuration', 'Debug');
    return request;
  }
  if (platform !== 'android') throw new Error(`Unsupported Capacitor build platform: ${platform}`);

  const formats = { bundle: 'AAB', apk: 'APK' };
  if (options.packageType && !Object.hasOwn(formats, options.packageType)) {
    throw new Error('--packageType must be bundle or apk for Capacitor Android builds.');
  }
  const format = formats[options.packageType] || config.android?.buildOptions?.releaseType || 'AAB';
  if (format !== 'AAB' && format !== 'APK') {
    throw new Error('Capacitor android.buildOptions.releaseType must be AAB or APK.');
  }
  if (options.packageType) request.args.push('--androidreleasetype', format);

  const flavor = config.android?.flavor || '';
  const variant = options.debug ? 'debug' : 'release';
  const extension = format.toLowerCase();
  const directory = format === 'AAB'
    ? (flavor ? `${flavor}${options.debug ? 'Debug' : 'Release'}` : variant)
    : path.join(flavor, variant);
  const name = `app${flavor ? `-${flavor}` : ''}-${variant}${options.debug ? '' : '-signed'}.${extension}`;
  request.artifactPaths = [path.join(nativeDir, 'app', 'build', 'outputs', format === 'AAB' ? 'bundle' : 'apk', directory, name)];
  if (options.debug) {
    const taskFlavor = flavor ? flavor[0].toUpperCase() + flavor.slice(1) : '';
    request.gradleTask = format === 'AAB' ? `:app:bundle${taskFlavor}Debug` : `assemble${taskFlavor}Debug`;
  }
  return request;
}

async function getArtifactPaths(request) {
  if (request.artifactPaths) return request.artifactPaths;
  try {
    const entries = await fs.readdir(request.artifactDir, { withFileTypes: true });
    return entries.filter(entry => entry.isFile() && entry.name.endsWith('.ipa'))
      .map(entry => path.join(request.artifactDir, entry.name)).sort();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export async function prepareNativeArtifacts(request) {
  for (const file of await getArtifactPaths(request)) {
    await fs.rm(file, { force: true });
  }
}

export async function collectNativeArtifacts(request) {
  const artifacts = await getArtifactPaths(request);
  if (!artifacts.length) throw new Error(`Capacitor ${request.platform} build did not produce a native artifact.`);
  for (const file of artifacts) {
    const stat = await fs.stat(file).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (!stat?.isFile() || stat.size === 0) {
      throw new Error(`Capacitor ${request.platform} build did not produce ${file}`);
    }
  }
  await fs.mkdir(request.outputDir, { recursive: true });
  const outputs = [];
  for (const file of artifacts) {
    const output = path.join(request.outputDir, path.basename(file));
    if (path.resolve(file) !== path.resolve(output)) await fs.copyFile(file, output);
    outputs.push(output);
  }
  return outputs;
}
