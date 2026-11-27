const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

function resolvePath(target, { fsImpl = fs } = {}) {
  if (!target) {
    return null;
  }

  try {
    return fsImpl.realpathSync(target);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    if (fsImpl.lstatSync(target, { throwIfNoEntry: false })?.isSymbolicLink()) {
      throw new Error("Refusing to clean a redirected workspace");
    }
    return path.resolve(target);
  }
}

function isSubpath(parent, child) {
  const relative = path.relative(parent, child);

  return (
    relative !== "" &&
    relative !== "." &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function removeContents(dir, { fsImpl, execFileSyncImpl }) {
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

  // A bind mount can expose another workspace even on the same filesystem.
  const mounts = fsImpl.readFileSync("/proc/self/mountinfo", "utf8");
  for (const line of mounts.trimEnd().split("\n")) {
    const mount = line
      .split(" ")[4]
      .replace(/\\([0-7]{3})/g, (_, octal) =>
        String.fromCharCode(parseInt(octal, 8)),
      );
    if (resolved === mount || isSubpath(resolved, mount)) {
      throw new Error("Refusing to clean across a mount in the workspace");
    }
  }

  try {
    for (const entry of fsImpl.readdirSync(resolved)) {
      fsImpl.rmSync(path.join(resolved, entry), {
        recursive: true,
        force: true,
      });
    }
  } catch (error) {
    if (error.code !== "EACCES" && error.code !== "EPERM") {
      throw error;
    }
    // Root-running CI containers can leave directories the runner cannot empty.
    // Anchor find at the validated workspace. Leave its root and symlink targets alone.
    execFileSyncImpl(
      "/usr/bin/sudo",
      [
        "-n",
        "--",
        "/usr/bin/find",
        ".",
        "-xdev",
        "-depth",
        "-mindepth",
        "1",
        "-delete",
      ],
      { cwd: resolved, stdio: "ignore" },
    );
  }
  if (fsImpl.readdirSync(resolved).length) {
    throw new Error(
      `Workspace still contains files after cleanup: ${resolved}`,
    );
  }
}

function getFreeGiB(target, fsImpl) {
  const { bavail, bsize } = fsImpl.statfsSync(target);
  return Math.max(0, bavail * bsize) / 1024 ** 3;
}

function resolveWorkspace(workspace, { env = process.env } = {}) {
  const resolvedWorkspace = workspace || env.GITHUB_WORKSPACE;

  if (!resolvedWorkspace) {
    throw new Error(
      "Refusing to clean outside GitHub Actions without an explicit workspace.",
    );
  }

  if (!path.isAbsolute(resolvedWorkspace)) {
    throw new Error(
      `Expected an absolute workspace path, got: ${resolvedWorkspace}`,
    );
  }

  return resolvedWorkspace;
}

function resolveRunnerWorkspace(
  runnerWorkspace,
  workspace,
  { env = process.env } = {},
) {
  const resolvedRunnerWorkspace =
    runnerWorkspace ||
    env.RUNNER_WORKSPACE ||
    (workspace ? path.dirname(workspace) : null) ||
    (env.GITHUB_WORKSPACE ? path.dirname(env.GITHUB_WORKSPACE) : null);

  if (!resolvedRunnerWorkspace) {
    throw new Error(
      "Refusing to clean without RUNNER_WORKSPACE or GITHUB_WORKSPACE.",
    );
  }

  if (!path.isAbsolute(resolvedRunnerWorkspace)) {
    throw new Error(
      `Expected an absolute runner workspace path, got: ${resolvedRunnerWorkspace}`,
    );
  }

  return resolvedRunnerWorkspace;
}

function assertSafeWorkspaceScope(
  workspace,
  runnerWorkspace,
  { fsImpl = fs } = {},
) {
  const resolvedWorkspace = resolvePath(workspace, { fsImpl });
  const resolvedRunnerWorkspace = resolvePath(runnerWorkspace, { fsImpl });

  if (!resolvedWorkspace) {
    throw new Error("Refusing to clean without a workspace path.");
  }

  if (!resolvedRunnerWorkspace) {
    throw new Error("Refusing to clean without a runner workspace path.");
  }

  if (
    !isSubpath(runnerWorkspace, workspace) ||
    !isSubpath(resolvedRunnerWorkspace, resolvedWorkspace)
  ) {
    throw new Error(
      `Refusing to clean workspace outside RUNNER_WORKSPACE: ${resolvedWorkspace}`,
    );
  }
  if (
    path.resolve(
      resolvedRunnerWorkspace,
      path.relative(runnerWorkspace, workspace),
    ) !== resolvedWorkspace
  ) {
    throw new Error(`Refusing to clean a redirected workspace: ${workspace}`);
  }

  return { resolvedWorkspace, resolvedRunnerWorkspace };
}

function getThresholdGiB(thresholdGiB, { env = process.env } = {}) {
  const rawThreshold = thresholdGiB ?? env.SELF_HOSTED_MIN_FREE_GB ?? "20";
  const parsedThreshold = Number(rawThreshold);

  if (
    String(rawThreshold).trim() === "" ||
    !Number.isFinite(parsedThreshold) ||
    parsedThreshold < 0
  ) {
    throw new Error("Invalid SELF_HOSTED_MIN_FREE_GB. Expected a nonnegative number.");
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
  } = {},
) {
  const configuredWorkspace = resolveWorkspace(workspace, { env });
  const configuredRunnerWorkspace = resolveRunnerWorkspace(
    runnerWorkspace,
    configuredWorkspace,
    { env },
  );
  const { resolvedWorkspace, resolvedRunnerWorkspace } =
    assertSafeWorkspaceScope(configuredWorkspace, configuredRunnerWorkspace, {
      fsImpl,
    });

  if (env.GITHUB_WORKSPACE) {
    const expectedWorkspace = resolvePath(env.GITHUB_WORKSPACE, { fsImpl });

    if (resolvedWorkspace !== expectedWorkspace) {
      throw new Error(
        `Refusing to clean anything other than GITHUB_WORKSPACE: ${resolvedWorkspace}`,
      );
    }
  }

  const resolvedThresholdGiB = getThresholdGiB(thresholdGiB, { env });
  const diskTarget = fsImpl.existsSync(resolvedWorkspace)
    ? resolvedWorkspace
    : resolvedRunnerWorkspace;

  const disks = [{ name: "Workspace", path: diskTarget }];
  const errors = [];
  let workspaceStatus = "Incomplete";
  let pruneStatus = "Not run";
  if (resolvedThresholdGiB > 0) {
    const dockerDisk = { name: "Docker" };
    disks.push(dockerDisk);
    try {
      const dockerRoot = execFileSyncImpl(
        "docker",
        ["info", "--format", "{{.DockerRootDir}}"],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        },
      ).trim();
      if (path.isAbsolute(dockerRoot)) dockerDisk.path = dockerRoot;
    } catch {
      // The workspace can still be cleaned when the Docker daemon is unavailable.
    }
    if (!dockerDisk.path)
      errors.push("Could not determine the Docker data directory");
  }

  function measureFreeSpace(phase) {
    for (const disk of disks) {
      if (!disk.path) continue;
      try {
        disk[phase] = getFreeGiB(disk.path, fsImpl);
      } catch {
        disk[phase] = undefined;
        errors.push(
          `Could not measure free space on the ${disk.name} filesystem`,
        );
      }
    }
  }

  measureFreeSpace("before");
  try {
    removeContents(resolvedWorkspace, { fsImpl, execFileSyncImpl });
    workspaceStatus = "Empty";
  } catch (error) {
    errors.push(
      error.code ? `Workspace cleanup failed (${error.code})` : error.message,
    );
  }
  measureFreeSpace("after");
  if (
    workspaceStatus === "Empty" &&
    disks.some((disk) => disk.after < resolvedThresholdGiB)
  ) {
    pruneStatus = "Completed";
    for (const args of [
      ["system", "prune", "-af", "--volumes"],
      ["builder", "prune", "-af"],
    ]) {
      try {
        execFileSyncImpl("docker", args, { stdio: "ignore" });
      } catch {
        pruneStatus = "Failed";
        errors.push(`docker ${args.join(" ")} failed`);
      }
    }
    measureFreeSpace("after");
  }
  const targetMet = disks.every((disk) => disk.after >= resolvedThresholdGiB);
  if (!targetMet)
    errors.push(
      `Could not confirm ${resolvedThresholdGiB} GiB of free space after cleanup`,
    );

  const format = (value) =>
    value === undefined ? "unmeasured" : `${value.toFixed(2)} GiB`;
  const summary = [
    "### Runner cleanup",
    "",
    `- Runner: ${env.RUNNER_NAME || "local"}`,
    `- Repository workspace: ${workspaceStatus}`,
    `- Docker prune: ${pruneStatus}`,
    ...disks.map(
      (disk) =>
        `- ${disk.name} free space: ${format(disk.before)} before, ${format(disk.after)} after`,
    ),
    `- Free-space target (${resolvedThresholdGiB} GiB): ${targetMet ? "met" : "unmet or unverified"}`,
    "",
  ].join("\n");
  logger.log(summary);
  if (env.GITHUB_STEP_SUMMARY)
    fsImpl.appendFileSync(env.GITHUB_STEP_SUMMARY, summary);
  if (errors.length) throw new Error([...new Set(errors)].join("\n"));
}

if (require.main === module) {
  cleanupSelfHostedRunner().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = cleanupSelfHostedRunner;
