const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const cleanup = require("../self-hosted-runner-cleanup.js");

function createFixture(t) {
  const runnerWorkspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "runner-workspace-")
  );
  const workspace = path.join(runnerWorkspace, "meteor", "meteor");
  const siblingWorkspace = path.join(
    runnerWorkspace,
    "other-repo",
    "other-repo"
  );

  fs.mkdirSync(path.join(workspace, "nested"), { recursive: true });
  fs.mkdirSync(siblingWorkspace, { recursive: true });

  fs.writeFileSync(path.join(workspace, "root.txt"), "root");
  fs.writeFileSync(path.join(workspace, "nested", "child.txt"), "child");
  fs.writeFileSync(path.join(siblingWorkspace, "keep.txt"), "keep");

  t.after(() => {
    fs.rmSync(runnerWorkspace, { recursive: true, force: true });
  });

  return { runnerWorkspace, workspace, siblingWorkspace };
}

function createExecStub({ availableKiB = 30 * 1024 * 1024 } = {}) {
  const calls = [];

  const execFileSyncImpl = (command, args, options = {}) => {
    calls.push([command, ...args]);

    if (command === "df" && args[0] === "-Pk") {
      const output = [
        "Filesystem 1024-blocks Used Available Capacity Mounted on",
        `/dev/test 1000000 0 ${availableKiB} 0% ${args[1]}`,
      ].join("\n");

      return options.encoding === "utf8" ? output : Buffer.from(output);
    }

    return options.encoding === "utf8" ? "" : Buffer.alloc(0);
  };

  return { calls, execFileSyncImpl };
}

function createEnv({ workspace, runnerWorkspace }) {
  return {
    GITHUB_WORKSPACE: workspace,
    RUNNER_WORKSPACE: runnerWorkspace,
  };
}

function isDockerPruneCall(call) {
  return (
    call[0] === "docker" &&
    ((call[1] === "system" && call[2] === "prune") ||
      (call[1] === "builder" && call[2] === "prune"))
  );
}

test("removes all contents from GITHUB_WORKSPACE and leaves sibling workspaces untouched", async (t) => {
  const { runnerWorkspace, workspace, siblingWorkspace } = createFixture(t);
  const { calls, execFileSyncImpl } = createExecStub();
  const env = createEnv({ workspace, runnerWorkspace });

  await cleanup(
    { workspace, runnerWorkspace, thresholdGiB: 0 },
    { env, execFileSyncImpl, logger: { log() {} } }
  );

  assert.deepEqual(fs.readdirSync(workspace), []);
  assert.equal(
    fs.readFileSync(path.join(siblingWorkspace, "keep.txt"), "utf8"),
    "keep"
  );
  assert.deepEqual(
    calls.filter(isDockerPruneCall),
    [],
    "docker prune commands should not run when free space is above the threshold"
  );
});

test("rejects cleaning RUNNER_WORKSPACE itself", async (t) => {
  const { runnerWorkspace } = createFixture(t);
  const { execFileSyncImpl } = createExecStub();
  const env = createEnv({ workspace: runnerWorkspace, runnerWorkspace });

  await assert.rejects(
    cleanup(
      { workspace: runnerWorkspace, runnerWorkspace, thresholdGiB: 0 },
      { env, execFileSyncImpl, logger: { log() {} } }
    ),
    /outside RUNNER_WORKSPACE|unsafe path/
  );
});

test("prunes docker only when free space is below the threshold", async (t) => {
  const { runnerWorkspace, workspace } = createFixture(t);
  const { calls, execFileSyncImpl } = createExecStub({
    availableKiB: 5 * 1024 * 1024,
  });
  const env = createEnv({ workspace, runnerWorkspace });

  await cleanup(
    { workspace, runnerWorkspace, thresholdGiB: 20 },
    { env, execFileSyncImpl, logger: { log() {} } }
  );

  assert.ok(
    calls.some(
      (call) =>
        call[0] === "docker" &&
        call[1] === "system" &&
        call[2] === "prune" &&
        call.includes("--volumes")
    ),
    "expected docker system prune when free space is low"
  );
  assert.ok(
    calls.some(
      (call) =>
        call[0] === "docker" && call[1] === "builder" && call[2] === "prune"
    ),
    "expected docker builder prune when free space is low"
  );
});

test("falls back to GITHUB_WORKSPACE when RUNNER_WORKSPACE is not set", async (t) => {
  const { workspace } = createFixture(t);
  const { calls, execFileSyncImpl } = createExecStub();

  await cleanup(
    { thresholdGiB: 0 },
    {
      env: { GITHUB_WORKSPACE: workspace },
      execFileSyncImpl,
      logger: { log() {} },
    }
  );

  assert.deepEqual(fs.readdirSync(workspace), []);
  assert.deepEqual(
    calls.filter(isDockerPruneCall),
    [],
    "docker prune commands should not run when free space is above the threshold"
  );
});