const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const cleanup = require("../self-hosted-runner-cleanup.js");

function fixture(t, { workspaceGiB = [30], dockerGiB = [30], fail = [] } = {}) {
  const parent = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "runner-cleanup-")),
  );
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const workspace = path.join(parent, "meteor", "meteor");
  const sibling = path.join(parent, "other-repo");
  const summary = path.join(parent, "summary");
  fs.mkdirSync(path.join(workspace, ".ci-linux-check", "source"), {
    recursive: true,
  });
  fs.mkdirSync(sibling);
  fs.writeFileSync(
    path.join(workspace, ".ci-linux-check", "npm-downloads.tar"),
    "downloads",
  );
  fs.writeFileSync(path.join(sibling, "keep"), "keep");
  fs.symlinkSync(sibling, path.join(workspace, "link"), "dir");

  const env = {
    GITHUB_WORKSPACE: workspace,
    RUNNER_WORKSPACE: parent,
    RUNNER_NAME: "worker-1",
    GITHUB_STEP_SUMMARY: summary,
  };
  const commands = [];
  const dockerRoot = path.join(parent, "docker");
  const fsImpl = {
    ...fs,
    readFileSync(file, options) {
      if (file === "/proc/self/mountinfo")
        return "1 0 0:1 / / rw - tmpfs tmpfs rw\n";
      return fs.readFileSync(file, options);
    },
    statfsSync(file) {
      assert.ok([workspace, parent, dockerRoot].includes(file));
      const values = file === dockerRoot ? dockerGiB : workspaceGiB;
      const available = values.length > 1 ? values.shift() : values[0];
      return { bsize: 1024, bavail: available * 1024 ** 2 };
    },
  };
  const deps = {
    env,
    fsImpl,
    logger: { log() {} },
    execFileSyncImpl(command, args) {
      assert.equal(command, "docker");
      const operation = args.slice(0, 2).join(" ");
      commands.push(operation);
      if (fail.includes(operation))
        throw new Error("daemon diagnostic, omit from reports");
      if (args[0] === "info") return dockerRoot;
      if (args[0] === "system")
        assert.deepEqual(args, ["system", "prune", "-af", "--volumes"]);
      if (args[0] === "builder")
        assert.deepEqual(args, ["builder", "prune", "-af"]);
    },
  };
  return {
    workspace,
    parent,
    sibling,
    env,
    fsImpl,
    deps,
    commands,
    run: (options = {}) => cleanup(options, deps),
    report: () => fs.readFileSync(summary, "utf8"),
  };
}

test("cleans the whole checkout, leaves symlink targets and siblings intact, and skips Docker when the target is met", async (t) => {
  const f = fixture(t, { workspaceGiB: [5, 20] });
  await f.run();
  assert.deepEqual(fs.readdirSync(f.workspace), []);
  assert.equal(fs.readFileSync(path.join(f.sibling, "keep"), "utf8"), "keep");
  assert.deepEqual(f.commands, ["info --format"]);
  assert.match(f.report(), /worker-1/);
  assert.match(f.report(), /5.00 GiB before, 20.00 GiB after/);
  assert.match(f.report(), /20 GiB\): met/);
});

test("zero uses the GITHUB_WORKSPACE fallback and cleans without contacting Docker", async (t) => {
  const f = fixture(t);
  delete f.env.RUNNER_WORKSPACE;
  await f.run({ thresholdGiB: 0 });
  await f.run({ thresholdGiB: 0 });
  assert.deepEqual(fs.readdirSync(f.workspace), []);
  assert.deepEqual(f.commands, []);
});

test("rejects the runner root, redirected checkouts and blank thresholds before cleanup", async (t) => {
  const f = fixture(t);
  await assert.rejects(
    f.run({ workspace: f.parent }),
    /outside RUNNER_WORKSPACE/,
  );
  await assert.rejects(f.run({ thresholdGiB: " " }), /Invalid SELF_HOSTED/);
  fs.renameSync(f.workspace, f.workspace + "-old");
  fs.symlinkSync(f.sibling, f.workspace, "dir");
  await assert.rejects(f.run(), /redirected workspace/);
  assert.deepEqual(fs.readdirSync(f.sibling), ["keep"]);
  assert.deepEqual(f.commands, []);
});

test("refuses to delete across a mount inside the checkout", async (t) => {
  const f = fixture(t, { workspaceGiB: [1] });
  const mount = path
    .join(f.workspace, "..mounted cache")
    .replaceAll(" ", "\\040");
  f.fsImpl.readFileSync = () => `1 0 0:1 / ${mount} rw - tmpfs tmpfs rw\n`;
  await assert.rejects(f.run(), /mount in the workspace/);
  assert.ok(fs.existsSync(path.join(f.workspace, ".ci-linux-check")));
  assert.deepEqual(f.commands, ["info --format"]);
  assert.match(f.report(), /Repository workspace: Incomplete/);
});

test("reclaims container-owned files inside the validated checkout on a permission failure", async (t) => {
  const f = fixture(t);
  f.fsImpl.rmSync = () => {
    throw Object.assign(new Error(), { code: "EACCES" });
  };
  f.deps.execFileSyncImpl = (cmd, args, options) => {
    assert.equal(cmd, "/usr/bin/sudo");
    assert.deepEqual(args, [
      "-n",
      "--",
      "/usr/bin/find",
      ".",
      "-xdev",
      "-depth",
      "-mindepth",
      "1",
      "-delete",
    ]);
    assert.equal(options.cwd, f.workspace);
    // Exercise the actual unprivileged find in this disposable directory.
    require("node:child_process").execFileSync(args[2], args.slice(3), options);
  };
  await f.run({ thresholdGiB: 0 });
  assert.deepEqual(fs.readdirSync(f.workspace), []);
  assert.deepEqual(fs.readdirSync(f.sibling), ["keep"]);
});

test("prunes when only the Docker filesystem is low and verifies recovered space on both disks", async (t) => {
  const f = fixture(t, { dockerGiB: [4, 4, 23] });
  await f.run();
  assert.deepEqual(f.commands, [
    "info --format",
    "system prune",
    "builder prune",
  ]);
  assert.match(
    f.report(),
    /Docker free space: 4.00 GiB before, 23.00 GiB after/,
  );
  assert.match(f.report(), /20 GiB\): met/);
});

test("attempts both prunes and fails when a required prune fails even if free space recovered", async (t) => {
  const f = fixture(t, {
    workspaceGiB: [4, 5, 24],
    fail: ["system prune", "builder prune"],
  });
  await assert.rejects(f.run(), (error) => {
    assert.match(error.message, /system prune.*failed/);
    assert.match(error.message, /builder prune.*failed/);
    assert.doesNotMatch(error.message, /daemon diagnostic/);
    return true;
  });
  assert.deepEqual(f.commands, [
    "info --format",
    "system prune",
    "builder prune",
  ]);
  assert.match(f.report(), /Docker prune: Failed/);
  assert.match(f.report(), /20 GiB\): met/);
});

test("fails when successful pruning leaves the disk below target", async (t) => {
  const f = fixture(t, { workspaceGiB: [4, 5, 8] });
  await assert.rejects(f.run(), /Could not confirm 20 GiB/);
  assert.match(f.report(), /8.00 GiB after/);
  assert.match(f.report(), /20 GiB\): unmet or unverified/);
});

test("cleans the workspace and reports an unverified Docker disk when the daemon is unavailable", async (t) => {
  const f = fixture(t, { fail: ["info --format"] });
  await assert.rejects(
    f.run(),
    /Could not determine the Docker data directory/,
  );
  assert.deepEqual(fs.readdirSync(f.workspace), []);
  assert.match(
    f.report(),
    /Docker free space: unmeasured before, unmeasured after/,
  );
});
