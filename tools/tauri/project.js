import { Console } from '../console/console.js';
import files from '../fs/files';
import buildmessage from '../utils/buildmessage.js';
import { execFileAsync } from '../utils/processes';

import { TauriBuilder } from './builder.js';
import { ensureRustToolchain } from './rust.js';

// Drives the Tauri CLI to package a Meteor app into a native binary.
//
// Layout of the build directory (projectRoot):
//   <root>/src-tauri/                 (from tools/tauri/skeleton)
//   <root>/tauri-plugin-meteor-webapp/(the Rust HCP plugin crate)
//   <root>/frontend/                  (Meteor web.tauri client + index.html)
export class TauriProject {
  constructor(projectContext, options = {}) {
    this.projectContext = projectContext;
    this.options = options;
    this.projectRoot = options.projectRoot ||
      projectContext.getProjectLocalDirectory('tauri-build');
    this.builder = new TauriBuilder(projectContext, this.projectRoot, options);
  }

  // Path to the bundled Rust skeleton shipped with the meteor tool.
  get skeletonPath() {
    return files.pathJoin(__dirname, 'skeleton');
  }

  // Path to the meteor-webapp plugin crate. Configurable for development via
  // METEOR_TAURI_PLUGIN_PATH; otherwise expected next to the meteor checkout in
  // ../meteor-tauri/tauri-plugin-meteor-webapp.
  get pluginCratePath() {
    if (process.env.METEOR_TAURI_PLUGIN_PATH) {
      return process.env.METEOR_TAURI_PLUGIN_PATH;
    }
    // tools/tauri -> repo root -> ../meteor-tauri
    const repoRoot = files.pathJoin(__dirname, '..', '..');
    return files.pathJoin(
      repoRoot, '..', 'meteor-tauri', 'tauri-plugin-meteor-webapp');
  }

  async ensurePrerequisites() {
    return ensureRustToolchain({ autoInstall: this.options.autoInstallRust !== false });
  }

  // Scaffold src-tauri + plugin crate + frontend into the build directory.
  async scaffold(bundlePath) {
    files.mkdir_p(this.projectRoot);

    // src-tauri from the skeleton.
    const srcTauri = files.pathJoin(this.projectRoot, 'src-tauri');
    await files.rm_recursive(srcTauri);
    await files.cp_r(this.skeletonPath, srcTauri);

    // Copy the plugin crate next to src-tauri (Cargo.toml references it via a
    // relative path).
    const pluginDest = files.pathJoin(
      this.projectRoot, 'tauri-plugin-meteor-webapp');
    const pluginSrc = this.pluginCratePath;
    if (files.exists(pluginSrc)) {
      await files.rm_recursive(pluginDest);
      await files.cp_r(pluginSrc, pluginDest);
    } else {
      buildmessage.error(
        `Could not find the meteor-webapp Tauri plugin crate at ${pluginSrc}. ` +
        `Set METEOR_TAURI_PLUGIN_PATH to its location.`);
      return;
    }

    // Frontend (web.tauri client + index.html) and tauri.conf.json.
    await this.builder.copyFrontend(bundlePath);
    this.builder.writeTauriConfig();

    // Regenerate icons from an app-provided source, if present (otherwise the
    // default Meteor icons shipped in the skeleton are used).
    await this.builder.generateIconsIfProvided();
  }

  // Run the Tauri CLI to build the native app. Returns the path to the bundle
  // output directory.
  async build(bundlePath) {
    if (! await this.ensurePrerequisites()) {
      return null;
    }

    await this.scaffold(bundlePath);
    if (buildmessage.jobHasMessages()) return null;

    const srcTauri = files.pathJoin(this.projectRoot, 'src-tauri');

    // Escape hatch for tests / CI without a Rust toolchain: scaffold the
    // src-tauri project and frontend, but skip the (slow, Rust-dependent)
    // native compile. Returns the scaffolded src-tauri directory so callers
    // can assert on the generated layout.
    if (process.env.METEOR_TAURI_SKIP_NATIVE_BUILD) {
      Console.info(
        'METEOR_TAURI_SKIP_NATIVE_BUILD set: skipping native Tauri build.');
      return srcTauri;
    }

    Console.info('Building Tauri app (this can take a while on first run)...');
    const args = ['@tauri-apps/cli@latest', 'build'];
    if (this.options.debug) {
      args.push('--debug');
    }
    if (this.options.bundleTargets) {
      args.push('--bundles', this.options.bundleTargets);
    }

    try {
      await execFileAsync('npx', args, {
        cwd: files.convertToOSPath(srcTauri),
        stdio: 'inherit',
        env: {
          ...process.env,
          METEOR_ROOT_URL: this.options.mobileServerUrl || '',
        },
      });
    } catch (e) {
      buildmessage.error(`Tauri build failed: ${e.message}`);
      return null;
    }

    return files.pathJoin(srcTauri, 'target',
      this.options.debug ? 'debug' : 'release', 'bundle');
  }

  // Run the app in development against the Meteor dev server (devUrl).
  async run(bundlePath, devUrl) {
    if (! await this.ensurePrerequisites()) {
      return null;
    }

    await this.scaffold(bundlePath);
    if (buildmessage.jobHasMessages()) return null;

    const srcTauri = files.pathJoin(this.projectRoot, 'src-tauri');
    try {
      await execFileAsync('npx', ['@tauri-apps/cli@latest', 'dev'], {
        cwd: files.convertToOSPath(srcTauri),
        stdio: 'inherit',
        env: {
          ...process.env,
          // Point the webview at the running Meteor dev server.
          TAURI_DEV_URL: devUrl || '',
          METEOR_ROOT_URL: devUrl || '',
        },
      });
    } catch (e) {
      buildmessage.error(`Tauri dev run failed: ${e.message}`);
      return null;
    }
    return srcTauri;
  }
}
