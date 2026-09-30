import * as selftest from "../tool-testing/selftest.js";
import * as files from "../fs/files";
import * as buildmessage from "../utils/buildmessage.js";
import PackageSource from "../isobuild/package-source.js";
import { SourceProcessorSet } from "../isobuild/build-plugin.js";
import {
  getMeteorConfig,
  normalizeModernConfig,
  setMeteorConfig,
} from "../tool-env/meteor-config.js";

for (const { name, modern, cordovaMain } of [
  { name: "modern Cordova", modern: true, cordovaMain: "modern.js" },
  {
    name: "legacy Cordova opt-out",
    modern: { cordova: false },
    cordovaMain: "legacy.js",
  },
  { name: "legacy mode", modern: false, cordovaMain: "legacy.js" },
]) {
  selftest.define(`fetch - entry points - ${name}`, async function () {
    const previousConfig = getMeteorConfig();

    try {
      setMeteorConfig({ modern: normalizeModernConfig(modern) });

      // Load the real manifest through Isobuild so architecture aliases and
      // main-module selection use the same code as an application build.
      const packageSource = new PackageSource();
      const mainModules = {};
      const messages = await buildmessage.capture({
        title: "loading fetch entry points",
      }, async () => {
        await packageSource.initFromPackageDir(
          files.pathJoin(files.getCurrentToolsDir(), "packages", "fetch"),
        );
        const processors = new SourceProcessorSet("fetch", { hardcodeJs: true });
        for (const arch of packageSource.architectures) {
          const { main } = arch.getFiles(processors, arch.watchSet);
          mainModules[arch.arch] = main && main.relPath;
        }
      });

      if (messages.hasMessages()) {
        selftest.fail(messages.formatMessages(0));
      }

      await selftest.expectEqual(mainModules, {
        os: "server.js",
        "web.browser": "modern.js",
        "web.browser.legacy": "legacy.js",
        "web.cordova": cordovaMain,
      });
    } finally {
      setMeteorConfig(previousConfig);
    }
  });
}
