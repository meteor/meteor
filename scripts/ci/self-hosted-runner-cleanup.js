const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

function resolvePath(target, { fsImpl = fs } = {}) {
  if (!target) {
    return null;
  }

  return fsImpl.existsSync(target)
    ? fsImpl.realpathSync(target)
    : path.resolve(target);
}

function isSubpath(parent, child) {
  const relative = path.relative(parent, child);

  return (
    relative !== "" &&
    relative !== "." &&
    !relative.startsWith("..") &&
    !path.isAbsolute(relative)
  );
}

function run(
  command,
  args,
  { execFileSyncImpl = execFileSync, logger = console } = {}
) {
  try {
    execFileSyncImpl(command, args, { stdio: "inherit" });
    return true;
  } catch (error) {
    logger.log(`Skipping ${command} ${args.join(" ")}: ${error.message}`);
    return false;
  }
}

function removeContents(dir, { fsImpl = fs } = {}) {
  if (!dir || !fsImpl.existsSync(dir)) {
    return;
  }

  const resolved = fsImpl.realpathSync(dir);
  const root = path.parse(resolved).root;
  const depth = resolved
    .slice(root.length)
    .split(path.sep)
    .filter(Boolean).length;

  if (!path.isAbsolute(resolved) || resolved === root || depth < 3) {
    throw new Error(`Refusing to clean unsafe path: ${resolved}`);
  }

  for (const entry of fsImpl.readdirSync(resolved)) {
    fsImpl.rmSync(path.join(resolved, entry), { recursive: true, force: true });
  }
}

function getFreeGiB(target, { execFileSyncImpl = execFileSync } = {}) {
  const output = execFileSyncImpl("df", ["-Pk", target], { encoding: "utf8" });
  const line = output.trim().split(/\n/).pop();
  const fields = line.trim().split(/\s+/);

  return Number(fields[3]) / 1024 / 1024;
}

function resolveWorkspace(workspace, { env = process.env } = {}) {
  const resolvedWorkspace = workspace || env.GITHUB_WORKSPACE;

  if (!resolvedWorkspace) {
    throw new Error(
      "Refusing to clean outside GitHub Actions without an explicit workspace."
    );
  }

  if (!path.isAbsolute(resolvedWorkspace)) {
    throw new Error(
      `Expected an absolute workspace path, got: ${resolvedWorkspace}`
    );
  }

  return resolvedWorkspace;
}

function resolveRunnerWorkspace(
  runnerWorkspace,
  workspace,
  { env = process.env } = {}
) {
  const resolvedRunnerWorkspace =
    runnerWorkspace ||
    env.RUNNER_WORKSPACE ||
    (workspace ? path.dirname(workspace) : null) ||
    (env.GITHUB_WORKSPACE ? path.dirname(env.GITHUB_WORKSPACE) : null);

  if (!resolvedRunnerWorkspace) {
    throw new Error(
      "Refusing to clean without RUNNER_WORKSPACE or GITHUB_WORKSPACE."
    );
  }

  if (!path.isAbsolute(resolvedRunnerWorkspace)) {
    throw new Error(
      `Expected an absolute runner workspace path, got: ${resolvedRunnerWorkspace}`
    );
  }

  return resolvedRunnerWorkspace;
}

function assertSafeWorkspaceScope(
  workspace,
  runnerWorkspace,
  { fsImpl = fs } = {}
) {
  const resolvedWorkspace = resolvePath(workspace, { fsImpl });
  const resolvedRunnerWorkspace = resolvePath(runnerWorkspace, { fsImpl });

  if (!resolvedWorkspace) {
    throw new Error("Refusing to clean without a workspace path.");
  }

  if (!resolvedRunnerWorkspace) {
    throw new Error("Refusing to clean without a runner workspace path.");
  }

  if (!isSubpath(resolvedRunnerWorkspace, resolvedWorkspace)) {
    throw new Error(
      `Refusing to clean workspace outside RUNNER_WORKSPACE: ${resolvedWorkspace}`
    );
  }

  return { resolvedWorkspace, resolvedRunnerWorkspace };
}

function getThresholdGiB(thresholdGiB, { env = process.env } = {}) {
  const rawThreshold = thresholdGiB ?? env.SELF_HOSTED_MIN_FREE_GB ?? "20";
  const parsedThreshold = Number(rawThreshold);

  if (!Number.isFinite(parsedThreshold) || parsedThreshold < 0) {
    throw new Error(`Invalid SELF_HOSTED_MIN_FREE_GB value: ${rawThreshold}`);
  }

  return parsedThreshold;
}

async function cleanupSelfHostedRunner(
  { workspace, runnerWorkspace, thresholdGiB } = {},
  {
    env = process.env,
    fsImpl = fs,
    execFileSyncImpl = execFileSync,
    logger = console,
  } = {}
) {
  const configuredWorkspace = resolveWorkspace(workspace, { env });
  const configuredRunnerWorkspace = resolveRunnerWorkspace(
    runnerWorkspace,
    configuredWorkspace,
    { env }
  );
  const { resolvedWorkspace, resolvedRunnerWorkspace } =
    assertSafeWorkspaceScope(configuredWorkspace, configuredRunnerWorkspace, {
      fsImpl,
    });

  if (env.GITHUB_WORKSPACE) {
    const expectedWorkspace = resolvePath(env.GITHUB_WORKSPACE, { fsImpl });

    if (resolvedWorkspace !== expectedWorkspace) {
      throw new Error(
        `Refusing to clean anything other than GITHUB_WORKSPACE: ${resolvedWorkspace}`
      );
    }
  }

  const resolvedThresholdGiB = getThresholdGiB(thresholdGiB, { env });
  const diskTarget = fsImpl.existsSync(resolvedWorkspace)
    ? resolvedWorkspace
    : resolvedRunnerWorkspace;

  logger.log(`Cleaning workspace at ${resolvedWorkspace}`);
  logger.log(
    `Cleanup is scoped to the current job workspace under ${resolvedRunnerWorkspace}`
  );
  run("df", ["-h", diskTarget], { execFileSyncImpl, logger });
  run("docker", ["system", "df"], { execFileSyncImpl, logger });
  removeContents(resolvedWorkspace, { fsImpl });

  const freeAfterWorkspaceCleanup = getFreeGiB(diskTarget, {
    execFileSyncImpl,
  });
  logger.log(
    `Free space after workspace cleanup: ${freeAfterWorkspaceCleanup.toFixed(
      1
    )} GiB`
  );

  if (freeAfterWorkspaceCleanup < resolvedThresholdGiB) {
    logger.log(
      `Free space is below ${resolvedThresholdGiB} GiB; pruning Docker state.`
    );
    run("docker", ["system", "prune", "-af", "--volumes"], {
      execFileSyncImpl,
      logger,
    });
    run("docker", ["builder", "prune", "-af"], { execFileSyncImpl, logger });
  } else {
    logger.log(
      `Free space is above ${resolvedThresholdGiB} GiB; skipping Docker prune.`
    );
  }

  run("df", ["-h", diskTarget], { execFileSyncImpl, logger });
}

if (require.main === module) {
  cleanupSelfHostedRunner().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = cleanupSelfHostedRunner;
