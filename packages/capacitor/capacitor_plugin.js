/**
 * @module capacitor_plugin
 * @description Build-plugin entry point for the Capacitor integration.
 *
 * Orchestrates:
 *   1. Gating on the active Meteor command (run / build / add-platform). See lib/command.js.
 *   2. Ensuring NPM dependencies, build-native/, and capacitor.config.js exist.
 *   3. Snapshotting the resolved capacitor.config to the per-env build context.
 *   4. On `meteor add-platform`, running `npx cap add` for the requested platforms.
 *   5. On `meteor build` and `meteor run android|ios`, transforming
 *      web.cordova/ into build-native/ and running `cap sync` (scoped to the
 *      active platform when run native).
 */

const path = require('path');
const fs = require('fs');

const {
  isMeteorAppDebug,
  isMeteorAppConfigModernVerbose,
  hasMeteorAppConfigAutoInstallDeps,
  setMeteorAppIgnore,
} = require('meteor/tools-core/lib/meteor');
const {
  createMeteorToolContext,
  runToolScenarios,
  scenario,
} = require('meteor/tools-core/lib/lifecycle');
const {
  logInfo,
  logError,
  logProgress,
} = require('meteor/tools-core/lib/log');
const { isYarnProject } = require('meteor/tools-core/lib/npm');

const {
  CAPACITOR_BUILD_CONTEXT,
  CAPACITOR_CORDOVA_OUTPUT_DIR,
  getCapacitorWebDirCandidates,
} = require('./lib/constants');
const { ensureCapacitorInstalled } = require('./lib/dependencies');
const {
  ensureCapacitorBuildContextExists,
  ensureCapacitorConfigExists,
  writeResolvedConfigSnapshot,
} = require('./lib/build-context');
const { runCapacitorTransforms } = require('./lib/transforms');
const {
  runCapSync,
  scheduleCapRunAfterMeteorReady,
  ensureNativePlatformAdded,
  addNativePlatformIfMissing,
  cleanup,
  getCapacitorEnv,
} = require('./lib/processes');
const {
  CAPACITOR_PLATFORMS,
  isCapacitorOptIn,
  isCapacitorRunOptIn,
  isCapacitorBuildOptIn,
  isCapacitorAddPlatformOptIn,
} = require('./lib/command');
const { getCapacitorHcpMode } = require('./lib/hcp');

if (isCapacitorOptIn()) {
  await runCapacitorPlugin();
}

async function runCapacitorPlugin() {
  try {
    const hcpMode = getCapacitorHcpMode();

    const context = createMeteorToolContext({
      provider: 'capacitor',
      state: {
        platforms: [],
        hcpMode,
      },
    });

    await runToolScenarios({
      context,
      setup: async context => {
        context.state.platforms = getRequestedCapacitorPlatforms(context.options);

        if (process.env.YARN_ENABLED === undefined) {
          process.env.YARN_ENABLED = isYarnProject() ? 'true' : 'false';
        }

        process.env.METEOR_CAPACITOR = 'true';
        // Bypass Cordova's runner when the project has the `capacitor` package.
        // The Meteor CLI now skips Cordova through provider resolution; this
        // assignment covers downstream child processes spawned by the plugin.
        process.env.METEOR_CORDOVA_DISABLE = 'true';

        // Skip native webDirs at isobuild scan time. Scoped to native-*
        // subdirs so rspack's main-* outputs under the same _build/ root
        // stay visible.
        setMeteorAppIgnore(getCapacitorWebDirCandidates().join(' '));

        if (hasMeteorAppConfigAutoInstallDeps()) {
          // Top-level await: build plugins are evaluated as ESM with TLA enabled.
          await ensureCapacitorInstalled({
            platforms: (
              isCapacitorAddPlatformOptIn() || isCapacitorRunOptIn()
            ) ? context.state.platforms : null,
          });
        }

        ensureCapacitorBuildContextExists();
        ensureCapacitorConfigExists();

        // Snapshot the resolved capacitor.config to the per-env webDir
        // (`_build/native-{dev,prod}/capacitor.config.json`). Informational:
        // capacitor's CLI still loads the source .js from project root.
        await writeResolvedConfigSnapshot({ appDir: context.appDir });

        process.on('exit', cleanup);
        process.on('SIGINT', () => {
          cleanup();
          process.exit();
        });
      },
      scenarios: [
        scenario('add-platform', {
          when: isCapacitorAddPlatformOptIn,
          run: async context => {
            // Run cap add per requested platform; no-op when already added.
            // The CLI writes .meteor/platforms after the compile returns.
            for (const platform of context.state.platforms) {
              const code = await addNativePlatformIfMissing({
                appDir: context.appDir,
                platform,
              });
              if (code !== 0) {
                throw new Error(`cap add ${platform} exited with code ${code}`);
              }
            }
          },
        }),
        scenario('build', {
          when: isCapacitorBuildOptIn,
          run: context => {
            // `meteor build --platforms=android|ios` syncs the selected native
            // project. Without a single selected platform, Capacitor syncs all
            // native projects present in the app.
            const { platforms } = context.state;
            Plugin.onBuildOutputReady(async buildOutputContext => {
              await transformAndSync({
                appDir: context.appDir,
                platform: platforms.length === 1 ? platforms[0] : null,
                cordovaOutDir: getBuildCordovaOutDir(buildOutputContext),
                fatal: true,
                hcpMode: context.state.hcpMode,
                mobileServerUrl: getContextMobileServerUrl(context),
              });
            });
          },
        }),
        scenario('run:native', {
          when: isCapacitorRunOptIn,
          run: async context => {
            // Auto-bootstrap the native project (`android/` or `ios/`) when the user
            // ran `meteor run android|ios|*-device` without a prior `meteor add-platform`,
            // so a freshly-cloned project just works.
            await ensureNativePlatformAdded({ appDir: context.appDir });

            // Sync once at startup, then schedule Capacitor launch after the Meteor
            // HTTP index route is actually available. The launch scheduler is not
            // awaited here because the server starts only after this bundle step
            // returns.
            if (context.platform) {
              scheduleCapRunAfterMeteorReady({
                appDir: context.appDir,
                platform: context.platform,
                beforeRun: () => transformAndSync({
                  appDir: context.appDir,
                  platform: context.platform,
                  hcpMode: context.state.hcpMode,
                  mobileServerUrl: getContextMobileServerUrl(context),
                }),
                extraArgs: ['--no-sync'],
              });
            }
          },
        }),
      ],
    });
  } catch (error) {
    logError(`Capacitor plugin error: ${error.message}`);
    throw error;
  }
}

function isVerbose() {
  return isMeteorAppDebug() || isMeteorAppConfigModernVerbose();
}

function logVerbose(...args) {
  if (isVerbose()) logInfo(...args);
}

function getRequestedCapacitorPlatforms(options = {}) {
  const requested = [
    ...(options.args || []),
    ...(options.platforms ? String(options.platforms).split(',') : []),
  ];
  return Array.from(new Set(requested.map(arg => {
    if (arg === 'android' || arg === 'android-device') return 'android';
    if (arg === 'ios' || arg === 'ios-device') return 'ios';
    return arg;
  }).filter(platform => CAPACITOR_PLATFORMS.includes(platform))));
}

function getBuildCordovaOutDir(buildOutputContext = {}) {
  if (!buildOutputContext.outputPath) {
    return null;
  }

  return path.join(buildOutputContext.outputPath, 'programs', 'web.cordova');
}

async function withProcessEnv(env, fn) {
  const previous = {};
  Object.keys(env).forEach(key => {
    previous[key] = process.env[key];
    process.env[key] = env[key];
  });
  try {
    return await fn();
  } finally {
    Object.keys(env).forEach(key => {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    });
  }
}

function getContextMobileServerUrl(context = {}) {
  return context?.options?.mobileServerUrl ||
    context?.options?.['mobile-server'] ||
    process.env.MOBILE_ROOT_URL ||
    null;
}

/**
 * Runs the cordova→build-native transform. Returns false if the
 * transform itself failed (web.cordova/ exists but transforms threw).
 */
async function runTransform({ appDir, cordovaOutDir = null, hcpMode = getCapacitorHcpMode() }) {
  if (isVerbose()) logProgress('=> 🔧 Capacitor: transforming web.cordova → build-native/');
  const ok = await runCapacitorTransforms({
    appDir,
    cordovaOutDir,
    verbose: isVerbose(),
    hcpMode,
  });
  if (!ok) {
    logError('=> ❌ Capacitor transform failed');
    return false;
  }
  logVerbose(`[i] Capacitor build-native/ ready at ${path.join(appDir, CAPACITOR_BUILD_CONTEXT)}`);
  return true;
}

/**
 * Resolves once `web.cordova/program.json` is on disk (the bundle Meteor
 * actually emits, buildIndex composes index.html from it). Returns false
 * on timeout.
 */
function waitForCordovaBundle(cordovaOutDir, { intervalMs = 100, timeoutMs = 30_000 } = {}) {
  const sentinelPath = path.join(cordovaOutDir, 'program.json');
  if (fs.existsSync(sentinelPath)) return Promise.resolve(true);

  return new Promise(resolve => {
    const start = Date.now();
    const interval = setInterval(() => {
      if (fs.existsSync(sentinelPath)) {
        clearInterval(interval);
        resolve(true);
      } else if (Date.now() - start >= timeoutMs) {
        clearInterval(interval);
        resolve(false);
      }
    }, intervalMs);
  });
}

/**
 * Runs the transform + cap sync pair used by both `meteor build` and
 * `meteor run android|ios`. Awaits the cordova bundle becoming available
 * before transforming. Continuous re-sync on subsequent rebuilds (the
 * watcher) is planned separately.
 *
 * @param {Object} opts
 * @param {string} opts.appDir
 * @param {string|null} [opts.platform] 'android' / 'ios' for run, null for build.
 * @param {string|null} [opts.cordovaOutDir] Explicit web.cordova source dir.
 * @param {boolean} [opts.fatal] Throw on failure instead of returning false.
 */
async function transformAndSync({
  appDir,
  platform = null,
  cordovaOutDir = null,
  fatal = false,
  hcpMode = getCapacitorHcpMode(),
  mobileServerUrl = null,
}) {
  const resolvedCordovaOutDir = cordovaOutDir ||
    path.join(appDir, CAPACITOR_CORDOVA_OUTPUT_DIR);
  const displayCordovaOutDir = path.relative(appDir, resolvedCordovaOutDir);

  logVerbose(`[i] Capacitor: waiting for ${displayCordovaOutDir}/program.json`);
  const ready = await waitForCordovaBundle(resolvedCordovaOutDir);
  if (!ready) {
    return handleTransformFailure(
      `Capacitor: ${displayCordovaOutDir}/program.json not found in Meteor build output.`,
      { fatal }
    );
  }

  const capacitorEnv = getCapacitorEnv({ platform, mobileServerUrl });

  return withProcessEnv(capacitorEnv, async () => {
    await writeResolvedConfigSnapshot({ appDir });

    if (!(await runTransform({ appDir, cordovaOutDir: resolvedCordovaOutDir, hcpMode }))) {
      return handleTransformFailure('Capacitor build sync failed during web.cordova transform.', {
        fatal,
        log: false,
      });
    }

    try {
      await runCapSync({ appDir, platform });
      return true;
    } catch (err) {
      return handleTransformFailure(`Capacitor sync failed: ${err.message}`, { fatal });
    }
  });
}

function handleTransformFailure(message, { fatal = false, log = true } = {}) {
  if (fatal) {
    throw new Error(message);
  }
  if (log) {
    logError(message);
  }
  return false;
}
