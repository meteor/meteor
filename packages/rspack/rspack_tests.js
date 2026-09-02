import fs from "fs";
import os from "os";
import path from "path";

import {
  formatDependencyInstallCommands,
  getDependencyInstallContext,
} from "./lib/dependencies";
import { discoverRspackFileExtensions } from "./lib/file-extensions";

Tinytest.add("rspack - dependencies - formats workspace install commands", (test) => {
  const dependencies = [
    { name: "@rspack/core", version: "2.2.0", dev: true },
    { name: "@swc/helpers", version: "0.5.17", dev: false },
  ];

  test.equal(formatDependencyInstallCommands(dependencies, "pnpm"), {
    dev: "pnpm add --save-dev @rspack/core@2.2.0",
    regular: "pnpm add @swc/helpers@0.5.17",
  });
  test.equal(formatDependencyInstallCommands(dependencies, "yarn"), {
    dev: "yarn add --dev @rspack/core@2.2.0",
    regular: "yarn add @swc/helpers@0.5.17",
  });
  test.equal(formatDependencyInstallCommands(dependencies, "npm"), {
    dev: "meteor npm install --save-dev @rspack/core@2.2.0",
    regular: "meteor npm install @swc/helpers@0.5.17",
  });
  test.equal(formatDependencyInstallCommands(dependencies, "unsupported"), {
    dev: null,
    regular: null,
  });
});

Tinytest.add("rspack - dependencies - detects pnpm monorepo context", (test) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rspack-pnpm-"));
  const appDir = path.join(workspaceRoot, "apps", "app");

  try {
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({})
    );
    fs.writeFileSync(
      path.join(workspaceRoot, "pnpm-workspace.yaml"),
      "packages:\n  - apps/*\n"
    );
    fs.writeFileSync(
      path.join(appDir, "package.json"),
      JSON.stringify({ name: "app" })
    );

    test.equal(getDependencyInstallContext(appDir), {
      appDir,
      isMonorepo: true,
      packageManager: "pnpm",
      workspaceRoot,
    });
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

Tinytest.add("rspack - dependencies - detects workspace lockfile managers", (test) => {
  const cases = [
    ["yarn.lock", "yarn"],
    ["package-lock.json", "npm"],
  ];

  cases.forEach(([lockfile, expectedPackageManager]) => {
    const workspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), `rspack-${expectedPackageManager}-`)
    );
    const appDir = path.join(workspaceRoot, "apps", "app");

    try {
      fs.mkdirSync(appDir, { recursive: true });
      fs.writeFileSync(
        path.join(workspaceRoot, "package.json"),
        JSON.stringify({ workspaces: ["apps/*"] })
      );
      fs.writeFileSync(path.join(workspaceRoot, lockfile), "");
      fs.writeFileSync(
        path.join(appDir, "package.json"),
        JSON.stringify({ name: "app" })
      );

      test.equal(
        getDependencyInstallContext(appDir).packageManager,
        expectedPackageManager
      );
    } finally {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});

Tinytest.add("rspack - file extensions - discovers application extensions", (test) => {
  let globCall;
  const globSync = (pattern, options) => {
    globCall = { pattern, options };
    return ["client/main.CSS", "imports/schema.graphql", "imports/icon.SVG", "README", ".env"];
  };

  const extensions = discoverRspackFileExtensions({
    globSync,
    cwd: "/app",
    generatedContexts: ["_build", "build-assets", "build-chunks", ".rsdoctor"],
  });

  [".js", ".mts", ".cts", ".wasm", ".css", ".graphql", ".svg"].forEach((extension) => {
    test.isTrue(extensions.includes(extension), `Expected ${extension} to be delegated to Rspack`);
  });
  test.isFalse(extensions.includes(""));
  test.equal(globCall, {
    pattern: "**/*",
    options: {
      cwd: "/app",
      nodir: true,
      dot: true,
      ignore: [
        "node_modules/**",
        ".meteor/**",
        ".git/**",
        "public/**",
        "private/**",
        "_build/**",
        "build-assets/**",
        "build-chunks/**",
        ".rsdoctor/**",
      ],
    },
  });
});

Tinytest.add("rspack - file extensions - preserves Meteor compiler inputs", (test) => {
  const extensions = discoverRspackFileExtensions({
    globSync: () => [
      "client/main.html",
      "client/main.less",
      "client/main.scss",
      "client/theme.sass",
      "imports/main.js",
    ],
    cwd: "/app",
    generatedContexts: ["_build", "_build"],
    compilerExtensions: [".HTML", ".less", ".scss", ".sass"],
  });

  [".html", ".less", ".scss", ".sass"].forEach((extension) => {
    test.isFalse(
      extensions.includes(extension),
      `Expected Meteor to retain ownership of ${extension}`,
    );
  });
  test.isTrue(extensions.includes(".js"));
});

Tinytest.add("rspack - file extensions - normalizes generated contexts", (test) => {
  let globOptions;

  discoverRspackFileExtensions({
    globSync: (pattern, options) => {
      globOptions = options;
      return [];
    },
    cwd: "/app",
    generatedContexts: ["./_build/", "_build", "custom\\chunks\\"],
  });

  test.isTrue(globOptions.ignore.includes("_build/**"));
  test.isTrue(globOptions.ignore.includes("custom/chunks/**"));
  test.equal(globOptions.ignore.length, 7);
});
