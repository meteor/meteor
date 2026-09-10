import {
  getPnpmCommand,
  getPnpmCommandCandidates,
  getYarnCommand,
  getYarnCommandCandidates,
} from "../lib/npm.js";

Tinytest.add("tools-core - npm - resolves Yarn directly", (test) => {
  const command = getYarnCommand(["add", "example@1.0.0"], {
    resolveBinary: binaryName =>
      binaryName === "yarn" ? "/tools/yarn" : null,
  });

  test.equal(command, {
    command: "/tools/yarn",
    args: ["add", "example@1.0.0"],
    prefix: "/tools/yarn",
  });
});

Tinytest.add("tools-core - npm - falls back to Corepack for Yarn", (test) => {
  const command = getYarnCommand(["add", "example@1.0.0"], {
    resolveBinary: binaryName =>
      binaryName === "corepack" ? "/tools/corepack" : null,
  });

  test.equal(command, {
    command: "/tools/corepack",
    args: ["yarn", "add", "example@1.0.0"],
    prefix: "/tools/corepack yarn",
  });
});

Tinytest.add("tools-core - npm - orders Yarn before Corepack", (test) => {
  const commands = getYarnCommandCandidates([], {
    resolveBinary: binaryName => `/tools/${binaryName}`,
  });

  test.equal(commands, [
    {
      command: "/tools/yarn",
      args: [],
      prefix: "/tools/yarn",
    },
    {
      command: "/tools/corepack",
      args: ["yarn"],
      prefix: "/tools/corepack yarn",
    },
  ]);
});

Tinytest.add("tools-core - npm - resolves pnpm directly", (test) => {
  const command = getPnpmCommand(["add", "example@1.0.0"], {
    resolveBinary: binaryName =>
      binaryName === "pnpm" ? "/tools/pnpm" : null,
  });

  test.equal(command, {
    command: "/tools/pnpm",
    args: ["add", "example@1.0.0"],
    prefix: "/tools/pnpm",
  });
});

Tinytest.add("tools-core - npm - falls back to Corepack for pnpm", (test) => {
  const command = getPnpmCommand(["add", "example@1.0.0"], {
    resolveBinary: binaryName =>
      binaryName === "corepack" ? "/tools/corepack" : null,
  });

  test.equal(command, {
    command: "/tools/corepack",
    args: ["pnpm", "add", "example@1.0.0"],
    prefix: "/tools/corepack pnpm",
  });
});

Tinytest.add("tools-core - npm - orders pnpm before Corepack", (test) => {
  const commands = getPnpmCommandCandidates([], {
    resolveBinary: binaryName => `/tools/${binaryName}`,
  });

  test.equal(commands, [
    {
      command: "/tools/pnpm",
      args: [],
      prefix: "/tools/pnpm",
    },
    {
      command: "/tools/corepack",
      args: ["pnpm"],
      prefix: "/tools/corepack pnpm",
    },
  ]);
});

Tinytest.add("tools-core - npm - reports unavailable pnpm", (test) => {
  const command = getPnpmCommand([], {
    resolveBinary: () => null,
  });

  test.isNull(command);
});
