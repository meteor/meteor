import execa from "execa";
import fs from "fs-extra";
import os from "os";
import path from "path";

const RSPACK_PACKAGE_DIR = path.resolve(__dirname, "../../npm-packages/meteor-rspack");

describe("@meteorjs/rspack dependency audit /", () => {
  let tempDir;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "meteor-rspack-audit-"));
  });

  afterAll(async () => {
    await fs.remove(tempDir);
  });

  test("supports npm audit fix without critical vulnerabilities", async () => {
    const { stdout: packOutput } = await execa(
      "npm",
      ["pack", RSPACK_PACKAGE_DIR, "--json", "--pack-destination", tempDir],
      { cwd: tempDir },
    );
    const [{ filename }] = JSON.parse(packOutput);

    await fs.writeJson(path.join(tempDir, "package.json"), {
      name: "meteor-rspack-audit-consumer",
      private: true,
      dependencies: {
        "@meteorjs/rspack": `file:${path.join(tempDir, filename)}`,
      },
    });

    await execa(
      "npm",
      ["install", "--ignore-scripts", "--legacy-peer-deps", "--no-audit", "--no-fund"],
      { cwd: tempDir },
    );

    const auditFixResult = await execa(
      "npm",
      [
        "audit",
        "fix",
        "--omit=dev",
        "--audit-level=critical",
        "--ignore-scripts",
        "--legacy-peer-deps",
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

    for (const dependency of Object.keys(installedRspackPackage.dependencies)) {
      expect(require.resolve(dependency, { paths: [installedRspackDir] })).toBeTruthy();
    }
  });
});
