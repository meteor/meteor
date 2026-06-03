import _ from 'underscore';
import url from 'url';
import { Console } from '../console/console.js';
import files from '../fs/files';
import release from '../packaging/release.js';
import { loadIsopackage } from '../tool-env/isopackets.js';
import { execFileAsync } from '../utils/processes';

import { TAURI_ARCH } from './index.js';

// Builds the frontend assets and Tauri project layout for a Meteor app.
//
// This mirrors tools/cordova/builder.js CordovaBuilder. It takes the bundled
// web.tauri client program, generates the boilerplate index.html (wired with
// __meteor_runtime_config__ so the app connects back to the real Meteor server
// for DDP and Hot Code Push), and lays out a src-tauri project that the Tauri
// CLI can build into a native binary.
export class TauriBuilder {
  constructor(projectContext, projectRoot, options = {}) {
    this.projectContext = projectContext;
    this.projectRoot = projectRoot;
    this.options = options;

    this.metadata = {
      id: 'com.meteor.' + this.projectContext.appIdentifier,
      version: this.readAppVersion(),
      name: files.pathBasename(this.projectContext.projectDir),
    };
  }

  // Port for the in-app local HTTP server that serves the Meteor client bundle.
  //
  // The window loads from http://127.0.0.1:<port>/ so the webview preserves
  // strict <script> execution order (a custom URI scheme does not). Both the
  // static window URL (tauri.conf.json) and the native plugin must agree on
  // this port, so it is derived deterministically from the app identifier and
  // also written into the bundle (meteor_tauri.json) for the plugin to read.
  get assetServerPort() {
    const id = String(this.projectContext.appIdentifier || 'meteor');
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = (hash * 31 + id.charCodeAt(i)) & 0x7fffffff;
    }
    // Range 20000-44999 to stay clear of common dev ports.
    return 20000 + (hash % 25000);
  }

  // Read the app version from the project's package.json (falling back to a
  // sensible default). Tauri requires a semver-shaped version string.
  readAppVersion() {
    const fallback = '0.0.1';
    try {
      const pkgPath = files.pathJoin(
        this.projectContext.projectDir, 'package.json');
      if (!files.exists(pkgPath)) {
        return fallback;
      }
      const pkg = JSON.parse(files.readFile(pkgPath, 'utf8'));
      return (pkg && typeof pkg.version === 'string' && pkg.version) || fallback;
    } catch (e) {
      return fallback;
    }
  }

  // The directory that becomes Tauri's frontendDist: contains index.html and
  // the Meteor client program (under application/).
  get frontendPath() {
    return files.pathJoin(this.projectRoot, 'frontend');
  }

  get applicationPath() {
    return files.pathJoin(this.frontendPath, 'application');
  }

  get srcTauriPath() {
    return files.pathJoin(this.projectRoot, 'src-tauri');
  }

  // Copy the web.tauri program out of the bundle and generate index.html.
  async copyFrontend(bundlePath) {
    await files.rm_recursive(this.frontendPath);
    files.mkdir_p(this.applicationPath);

    const programPath = files.pathJoin(bundlePath, 'programs', TAURI_ARCH);
    await files.cp_r(programPath, this.applicationPath);

    const programJsonPath = files.convertToOSPath(
      files.pathJoin(this.applicationPath, 'program.json'));
    const program = JSON.parse(files.readFile(programJsonPath, 'utf8'));

    const settingsFile = this.options.settingsFile;
    const settings = settingsFile ?
      JSON.parse(files.readFile(settingsFile, 'utf8')) : {};
    const publicSettings = settings['public'];

    await this.appendVersion(program, publicSettings);
    files.writeFile(programJsonPath, JSON.stringify(program), 'utf8');

    const bootstrapPage = await this.generateBootstrapPage(
      this.applicationPath, program, publicSettings);

    // index.html lives at the frontend root so it can be the Tauri entry point,
    // while the manifest's asset URLs (e.g. /app/foo.js) resolve under
    // application/. The native meteor-webapp plugin serves both at runtime.
    files.writeFile(files.pathJoin(this.frontendPath, 'index.html'),
      bootstrapPage, 'utf8');
    files.writeFile(files.pathJoin(this.applicationPath, 'index.html'),
      bootstrapPage, 'utf8');

    // Record the local asset-server port so the native plugin binds to the
    // same port the static window (tauri.conf.json) loads from.
    files.writeFile(
      files.pathJoin(this.applicationPath, 'meteor_tauri.json'),
      JSON.stringify({ assetPort: this.assetServerPort }),
      'utf8');
  }

  // Compute the client version hashes. Must agree with
  // generateClientProgram in packages/webapp/webapp_server.js.
  async appendVersion(program, publicSettings) {
    const configDummy = { PUBLIC_SETTINGS: publicSettings || {} };
    const { WebAppHashing } = await loadIsopackage('webapp-hashing');
    const { AUTOUPDATE_VERSION } = process.env;

    program.version = AUTOUPDATE_VERSION ||
      WebAppHashing.calculateClientHash(program.manifest, null, configDummy);
    program.versionRefreshable = AUTOUPDATE_VERSION ||
      WebAppHashing.calculateClientHash(
        program.manifest, type => type === "css", configDummy);
    program.versionNonRefreshable = AUTOUPDATE_VERSION ||
      WebAppHashing.calculateClientHash(
        program.manifest,
        (type, replaceable) => type !== "css" && !replaceable,
        configDummy);
    program.versionReplaceable = AUTOUPDATE_VERSION ||
      WebAppHashing.calculateClientHash(
        program.manifest,
        (_type, replaceable) => replaceable,
        configDummy);
  }

  async generateBootstrapPage(applicationPath, program, publicSettings) {
    const meteorRelease =
      release.current.isCheckout() ? "none" : release.current.name;
    const hmrVersion =
      this.options.buildMode === 'development' ? Date.now() : undefined;

    const manifest = program.manifest;
    const mobileServerUrl = this.options.mobileServerUrl;
    const parsedUrl = url.parse(mobileServerUrl);

    const runtimeConfig = {
      meteorRelease,
      gitCommitHash: process.env.METEOR_GIT_COMMIT_HASH ||
        files.findGitCommitHash(applicationPath),
      ROOT_URL: mobileServerUrl,
      ROOT_URL_PATH_PREFIX: parsedUrl.pathname.replace(/\/$/, "") || '',
      DDP_DEFAULT_CONNECTION_URL:
        process.env.DDP_DEFAULT_CONNECTION_URL || mobileServerUrl,
      autoupdate: {
        versions: {
          "web.tauri": {
            version: program.version,
            versionRefreshable: program.versionRefreshable,
            versionNonRefreshable: program.versionNonRefreshable,
            versionReplaceable: program.versionReplaceable,
            versionHmr: hmrVersion,
          },
        },
      },
      appId: this.projectContext.appIdentifier,
      meteorEnv: {
        NODE_ENV: process.env.NODE_ENV || "production",
        TEST_METADATA: process.env.TEST_METADATA || "{}",
      },
    };

    if (publicSettings) {
      runtimeConfig.PUBLIC_SETTINGS = publicSettings;
    }

    const { Boilerplate } = await loadIsopackage('boilerplate-generator');
    const boilerplate = new Boilerplate(TAURI_ARCH, manifest, {
      urlMapper: _.identity,
      pathMapper: (path) => files.convertToOSPath(
        files.pathJoin(applicationPath, path)),
      baseDataExtension: {
        meteorRuntimeConfig: JSON.stringify(
          encodeURIComponent(JSON.stringify(runtimeConfig))),
      },
    });

    return boilerplate.toHTMLAsync();
  }

  // Generate the tauri.conf.json for this app, pointing at the frontend dir.
  writeTauriConfig() {
    const identifier = `com.meteor.${this.projectContext.appIdentifier}`;
    const productName = this.metadata.name;

    const config = {
      $schema: "https://schema.tauri.app/config/2",
      productName,
      version: this.metadata.version,
      identifier,
      build: {
        // Static frontend produced by Meteor's bundler. In dev, the runner
        // overrides this with devUrl pointing at the Meteor dev server.
        frontendDist: "../frontend",
      },
      app: {
        // Expose the global Tauri API so the webapp_tauri.js bridge can call
        // into the meteor-webapp plugin via window.__TAURI__.
        withGlobalTauri: true,
        windows: [
          {
            title: productName,
            // Load from the in-app local HTTP server that the meteor-webapp
            // plugin serves the client bundle from. Serving over http:// (vs a
            // custom URI scheme) preserves the strict <script> execution order
            // the Meteor client requires. The port is fixed and shared with the
            // plugin via meteor_tauri.json.
            url: `http://127.0.0.1:${this.assetServerPort}/`,
            width: 1024,
            height: 768,
            resizable: true,
          },
        ],
        security: {
          csp: null,
        },
      },
      bundle: {
        active: true,
        targets: this.options.bundleTargets || "all",
        icon: [
          "icons/32x32.png",
          "icons/128x128.png",
          "icons/icon.icns",
          "icons/icon.ico",
        ],
      },
    };

    files.mkdir_p(this.srcTauriPath);
    files.writeFile(
      files.pathJoin(this.srcTauriPath, 'tauri.conf.json'),
      JSON.stringify(config, null, 2),
      'utf8');

    return config;
  }

  // Returns the path to an app-provided icon source PNG, if one exists.
  // Looked up at private/tauri-icon.png then public/tauri-icon.png.
  appIconSource() {
    const candidates = [
      files.pathJoin(this.projectContext.projectDir, 'private', 'tauri-icon.png'),
      files.pathJoin(this.projectContext.projectDir, 'public', 'tauri-icon.png'),
    ];
    return candidates.find(candidate => files.exists(candidate)) || null;
  }

  // If the app ships its own icon source, regenerate the platform icon set into
  // src-tauri/icons (overwriting the shipped defaults). Requires that
  // writeTauriConfig() has already produced tauri.conf.json, since the Tauri
  // CLI looks it up to locate the project. Non-fatal: on failure we keep the
  // default icons and warn.
  async generateIconsIfProvided() {
    const source = this.appIconSource();
    if (!source) {
      return;
    }

    Console.info('Generating Tauri app icons from ' +
      files.pathRelative(this.projectContext.projectDir, source) + '...');
    try {
      await execFileAsync(
        'npx',
        ['--yes', '@tauri-apps/cli@latest', 'icon',
          files.convertToOSPath(source)],
        {
          cwd: files.convertToOSPath(this.srcTauriPath),
        });
    } catch (e) {
      Console.warn(
        'Could not generate app icons (' + e.message + '). ' +
        'Falling back to the default Meteor icons.');
    }
  }
}
