import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import Builder from "../isobuild/builder";
import { define } from "../tool-testing/selftest";
import files from "../fs/files";

// Builder's real filesystem/cache dependencies come from the tool's dev bundle.
// Keep this component test in the bootstrapped self-test runner: the standalone
// Jest unit environment does not install those dependencies. Running here keeps
// the filesystem and cached symlink traversal real, without test doubles.
// Exercise the POSIX executable-link layout; Windows uses command shims.
if (process.platform !== "win32") {
  // Workspace symlinks change depth when copied into a deployment bundle.
  define("builder preserves workspace executable links", async function () {
    const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "meteor-workspace-links-")));
    const source = path.join(temp, "source");
    const modules = path.join(source, "apps/app/node_modules");
    const workspace = path.join(source, "packages/workspace");
    const otherWorkspace = path.join(source, "packages/z-workspace");
    const bin = path.join(workspace, "node_modules/.bin");
    const command = path.join(modules, "command/bin/run.js");
    const otherCommand = path.join(otherWorkspace, "bin/run.js");
    const output = path.join(temp, "bundle");
    const development = path.join(temp, "development");
    let builder;
    let developmentBuilder;
    try {
      fs.mkdirSync(path.dirname(command), { recursive: true });
      fs.mkdirSync(path.join(modules, "@example"), { recursive: true });
      fs.mkdirSync(path.join(modules, ".bin"), { recursive: true });
      fs.mkdirSync(bin, { recursive: true });
      fs.mkdirSync(path.dirname(otherCommand), { recursive: true });
      fs.writeFileSync(command,
        '#!/usr/bin/env node\nprocess.stdout.write(require("../value.json"));\n',
        { mode: 0o755 });
      fs.writeFileSync(path.join(modules, "command/value.json"), '"portable"');
      fs.writeFileSync(path.join(modules, "command/package.json"), '{"name":"command"}');
      fs.writeFileSync(path.join(workspace, "package.json"), '{"name":"@example/workspace"}');
      fs.writeFileSync(otherCommand,
        '#!/usr/bin/env node\nprocess.stdout.write(require("../value.json"));\n',
        { mode: 0o755 });
      fs.writeFileSync(path.join(otherWorkspace, "value.json"), '"other-portable"');
      fs.writeFileSync(path.join(otherWorkspace, "package.json"), '{"name":"@example/z-workspace"}');
      fs.symlinkSync(path.relative(path.join(modules, "@example"), workspace),
        path.join(modules, "@example/workspace"), "junction");
      fs.symlinkSync(path.relative(path.join(modules, "@example"), otherWorkspace),
        path.join(modules, "@example/z-workspace"), "junction");
      fs.symlinkSync(path.relative(bin, command), path.join(bin, "relative"));
      fs.symlinkSync(command, path.join(bin, "absolute"));
      fs.symlinkSync(path.relative(bin, otherCommand), path.join(bin, "other-relative"));
      fs.symlinkSync(otherCommand, path.join(bin, "other-absolute"));
      const unmappedCommand = path.join(source, "unmapped-command.js");
      fs.writeFileSync(unmappedCommand, "unmapped");
      fs.symlinkSync(unmappedCommand, path.join(bin, "unmapped"));
      fs.symlinkSync("../command/bin/run.js", path.join(modules, ".bin/ordinary"));
      fs.symlinkSync("command", path.join(modules, "command-alias"), "junction");
      const externalFile = path.join(source, "external.txt");
      fs.writeFileSync(externalFile, "external file");
      fs.symlinkSync(path.relative(modules, externalFile), path.join(modules, "external.txt"));
      fs.symlinkSync(".", path.join(modules, "self"), "junction");
      fs.symlinkSync("missing", path.join(modules, "broken"));
      fs.symlinkSync("loop", path.join(modules, "loop"));

      // Use a separate node_modules root so the development package-directory
      // scan does not traverse the portable-copy cycle controls.
      const developmentModules = path.join(source, "apps/development/node_modules");
      fs.mkdirSync(path.join(developmentModules, "@example"), { recursive: true });
      fs.symlinkSync(workspace, path.join(developmentModules, "@example/workspace"), "junction");
      developmentBuilder = new Builder({ outputPath: files.convertToStandardPath(development) });
      await developmentBuilder.copyNodeModulesDirectory({
        from: files.convertToStandardPath(developmentModules),
        to: "npm/node_modules",
        symlink: true,
      });
      await developmentBuilder.complete();
      const developmentWorkspace = path.join(development, "npm/node_modules/@example/workspace");
      assert.ok(fs.lstatSync(developmentWorkspace).isSymbolicLink());
      assert.strictEqual(fs.realpathSync(developmentWorkspace), workspace);
      for (const name of ["relative", "absolute"]) {
        const executable = path.join(developmentWorkspace, "node_modules/.bin", name);
        assert.strictEqual(fs.readlinkSync(executable), fs.readlinkSync(path.join(bin, name)));
        assert.strictEqual(execFileSync(process.execPath, [executable], { encoding: "utf8" }), "portable");
      }

      builder = new Builder({ outputPath: files.convertToStandardPath(output) });
      const filteredLinks = new Set(["other-relative", "other-absolute", "unmapped"]);
      const copyOptions = {
        from: files.convertToStandardPath(modules),
        to: "npm/node_modules",
        symlink: false,
        filter: absPath => !filteredLinks.has(path.basename(absPath)),
        preserveCopiedExternalLinks: true,
      };
      await builder.copyNodeModulesDirectory(copyOptions);
      await builder.complete();
      builder = new Builder({
        outputPath: files.convertToStandardPath(output),
        previousBuilder: builder,
        forceInPlaceBuild: true,
      });
      await builder.copyNodeModulesDirectory(copyOptions);
      await builder.complete();
      // Prove execution is independent of the original checkout, including
      // the command's own package-relative imports and executable mode.
      fs.rmSync(source, { recursive: true, force: true });
      const packaged = path.join(output, "npm/node_modules");
      assert.ok(fs.lstatSync(path.join(packaged, "external.txt")).isFile());
      assert.strictEqual(fs.readFileSync(path.join(packaged, "external.txt"), "utf8"), "external file");
      assert.strictEqual(fs.readlinkSync(path.join(packaged, "broken")), "missing");
      assert.strictEqual(fs.readlinkSync(path.join(packaged, "loop")), "loop");
      assert.strictEqual(fs.realpathSync(path.join(packaged, "self")), packaged);
      assert.strictEqual(fs.realpathSync(path.join(packaged, "command-alias")),
        path.join(packaged, "command"));
      assert.throws(() => fs.lstatSync(path.join(packaged,
        "@example/workspace/node_modules/.bin/unmapped")),
      error => error.code === "ENOENT");
      for (const relative of ["@example/workspace/node_modules/.bin/relative",
        "@example/workspace/node_modules/.bin/absolute", ".bin/ordinary"]) {
        const executable = path.join(packaged, relative);
        assert.strictEqual(fs.realpathSync(executable), path.join(packaged, "command/bin/run.js"));
        assert.strictEqual(execFileSync(process.execPath, [executable], { encoding: "utf8" }), "portable");
        assert.ok(fs.statSync(executable).mode & 0o100);
      }
      for (const name of ["other-relative", "other-absolute"]) {
        const executable = path.join(packaged, "@example/workspace/node_modules/.bin", name);
        assert.ok(fs.lstatSync(executable).isSymbolicLink());
        assert.strictEqual(fs.realpathSync(executable),
          path.join(packaged, "@example/z-workspace/bin/run.js"));
        assert.strictEqual(execFileSync(process.execPath, [executable], { encoding: "utf8" }),
          "other-portable");
      }
    } finally {
      if (builder) await builder.abort();
      if (developmentBuilder) await developmentBuilder.abort();
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });
}
