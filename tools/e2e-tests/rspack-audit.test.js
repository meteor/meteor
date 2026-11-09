import execa from "execa";
import fs from "fs-extra";
import os from "os";
import path from "path";
import semver from "semver";

const RSPACK_PACKAGE_DIR = path.resolve(__dirname, "../../npm-packages/meteor-rspack");
const REACT_SKELETON_PACKAGE = path.resolve(__dirname, "../static-assets/skel-react/package.json");

describe("Regressions / @meteorjs/rspack dependency audit /", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "meteor-rspack-audit-"));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  test.each([
    ["npm audit fix", []],
    ["npm audit fix --force", ["--force"]],
  ])("supports %s without breaking Rspack builds", async (_command, flags) => {
    const { stdout: packOutput } = await execa(
      "npm",
      ["pack", RSPACK_PACKAGE_DIR, "--json", "--pack-destination", tempDir],
      { cwd: tempDir },
    );
    const [{ filename }] = JSON.parse(packOutput);
    const sourcePackage = await fs.readJson(path.join(RSPACK_PACKAGE_DIR, "package.json"));
    const skeletonPackage = await fs.readJson(REACT_SKELETON_PACKAGE);

    // Use the app's full dependency graph, including the Rspack CLI and peers.
    // Omitting dev dependencies or bypassing peers misses the Rspack 1 -> 2
    // mismatch reported in #14310.
    await fs.writeJson(path.join(tempDir, "package.json"), {
      name: "meteor-rspack-audit-consumer",
      private: true,
      dependencies: skeletonPackage.dependencies,
      devDependencies: {
        ...skeletonPackage.devDependencies,
        "@meteorjs/rspack": `file:./${filename}`,
      },
    });

    await execa(
      "npm",
      ["install", "--include=dev", "--no-audit", "--no-fund"],
      { cwd: tempDir },
    );

    const auditFixResult = await execa(
      "npm",
      [
        "audit",
        "fix",
        ...flags,
        "--include=dev",
        "--audit-level=critical",
        "--json",
      ],
      { cwd: tempDir, reject: false },
    );
    const auditFix = JSON.parse(auditFixResult.stdout);
    const audit = auditFix.audit ?? auditFix;

    expect(audit.metadata?.vulnerabilities).toBeDefined();
    expect(audit.metadata.vulnerabilities.critical).toBe(0);
    expect(auditFixResult.exitCode).toBe(0);

    const installedRspackDir = path.join(tempDir, "node_modules", "@meteorjs", "rspack");
    const installedRspackPackage = await fs.readJson(path.join(installedRspackDir, "package.json"));
    expect(installedRspackPackage.version).toBe(sourcePackage.version);

    for (const dependency of Object.keys(installedRspackPackage.dependencies)) {
      expect(require.resolve(dependency, { paths: [installedRspackDir] })).toBeTruthy();
    }

    for (const [name, range] of Object.entries(skeletonPackage.devDependencies)) {
      if (!name.startsWith("@rspack/")) continue;
      const installedPackage = await fs.readJson(path.join(tempDir, "node_modules", name, "package.json"));
      expect(semver.satisfies(installedPackage.version, range)).toBe(true);
      expect(audit.vulnerabilities?.[name]).toBeUndefined();
    }
    expect(audit.vulnerabilities?.["@meteorjs/rspack"]).toBeUndefined();

    // --force can accept invalid peers; validate the resulting tree separately.
    await execa("npm", ["ls", "--all", "--json"], { cwd: tempDir });

    const lock = await fs.readJson(path.join(tempDir, "package-lock.json"));
    for (const dependency of ["node-polyfill-webpack-plugin", "node-stdlib-browser", "elliptic"]) {
      expect(Object.keys(lock.packages).some(key => key.endsWith(`/node_modules/${dependency}`)
        || key === `node_modules/${dependency}`)).toBe(false);
    }

    await fs.writeFile(path.join(tempDir, "entry.js"), 'console.log("meteor-rspack-audit-build-ok");\n');
    await fs.writeFile(path.join(tempDir, "rspack.config.js"), `
const { defineConfig } = require("@meteorjs/rspack");
module.exports = defineConfig(() => ({
  mode: "production",
  target: "node",
  entry: "./entry.js",
  output: { path: require("path").join(__dirname, "dist"), filename: "main.js" },
}));
`);
    await execa("npm", ["exec", "--", "rspack", "build"], { cwd: tempDir });
    const { stdout } = await execa(process.execPath, ["dist/main.js"], { cwd: tempDir });
    expect(stdout).toBe("meteor-rspack-audit-build-ok");
  });
});
