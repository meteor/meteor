import { spawn } from 'child_process';

import { Console } from '../console/console.js';
import files from '../fs/files';
import runLog from '../runners/run-log.js';

import { TauriProject } from './project.js';
import { displayNameForPlatform, hostOsForPlatform } from './index.js';

// Drives a `tauri dev` process during `meteor run tauri-<platform>`.
//
// The interface intentionally mirrors CordovaRunner so it can be threaded
// through run-all.js / run-app.js in parallel with the Cordova runner: the run
// loop calls prepareProject() once the first bundle is ready and
// startRunTargets() once the dev server is listening.
export class TauriRunner {
  constructor(projectContext, runTargets, options = {}) {
    this.projectContext = projectContext;
    this.runTargets = runTargets;
    this.options = options;
    this.started = false;
    this.tauriProject = null;
    this.devProcess = null;
    this._scaffolded = false;
  }

  get platforms() {
    return this.runTargets.map(target => target.platform);
  }

  // Validate that every requested platform can run on this host OS and is a
  // known Tauri platform.
  async checkPlatformsForRunTargets() {
    import buildmessage from '../utils/buildmessage.js';

    for (const platform of this.platforms) {
      const requiredOs = hostOsForPlatform(platform);
      if (requiredOs && requiredOs !== process.platform) {
        buildmessage.error(
          `${platform}: can only be run on ${requiredOs}.`);
      }
    }
  }

  printWarningsIfNeeded() {
    // Nothing extra to warn about for Tauri yet.
  }

  // Scaffold the Tauri project against the freshly built bundle. Called on the
  // first successful build, before the dev server starts listening.
  async prepareProject(bundlePath, pluginVersions, options = {}) {
    this.tauriProject = new TauriProject(this.projectContext, {
      settingsFile: options.settingsFile,
      mobileServerUrl: options.mobileServerUrl || this.options.mobileServerUrl,
      buildMode: 'development',
      autoInstallRust: this.options.autoInstallRust,
    });

    const ok = await this.tauriProject.ensurePrerequisites();
    if (!ok) {
      return;
    }

    await this.tauriProject.scaffold(bundlePath);
    this._scaffolded = true;
  }

  // Spawn `tauri dev` for each run target, pointed at the running dev server.
  async startRunTargets() {
    if (!this._scaffolded || !this.tauriProject) {
      return;
    }

    const devUrl = this.options.mobileServerUrl || this.options.devUrl;
    const srcTauri = files.pathJoin(
      this.tauriProject.projectRoot, 'src-tauri');
    // Absolute path to the client bundle the builder just produced; the native
    // plugin serves the app from here via the meteor: scheme.
    const frontendDir = files.pathJoin(
      this.tauriProject.projectRoot, 'frontend', 'application');

    for (const platform of this.platforms) {
      runLog.log(
        `Starting ${displayNameForPlatform(platform)} (Tauri)...`,
        { arrow: true });
    }

    this.devProcess = spawn('npx', ['@tauri-apps/cli@latest', 'dev'], {
      cwd: files.convertToOSPath(srcTauri),
      stdio: 'inherit',
      env: {
        ...process.env,
        METEOR_FRONTEND_DIR: files.convertToOSPath(frontendDir),
        METEOR_ROOT_URL: devUrl || '',
      },
    });

    this.devProcess.on('error', (err) => {
      Console.error(`Failed to start Tauri dev process: ${err.message}`);
    });

    this.started = true;
  }

  // Tauri does not need to restart the run loop when platforms or plugins
  // change the way Cordova does.
  havePlatformsChangedSinceLastRun() {
    return false;
  }

  havePluginsChangedSinceLastRun() {
    return false;
  }

  stop() {
    if (this.devProcess && !this.devProcess.killed) {
      this.devProcess.kill();
      this.devProcess = null;
    }
    this.started = false;
  }
}
