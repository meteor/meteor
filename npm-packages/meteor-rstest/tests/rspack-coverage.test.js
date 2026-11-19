const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  applyRstestCoverageToSwcRule,
  readRstestCoveragePlan,
  resolveRstestCoverageSwcPlugin,
} = require("../src/rspack/coverage.js");

function coveragePlan(overrides = {}) {
  return {
    schemaVersion: 1,
    generation: "generation-1",
    enabled: true,
    provider: "istanbul",
    root: "/app",
    include: [],
    exclude: ["**/*.test.js"],
    allowExternal: false,
    artifactRoot: "/app/.meteor/local/rstest/coverage/generation-1",
    ...overrides,
  };
}

test("coverage-disabled plans leave the original SWC rule untouched", () => {
  const rule = {
    options: {
      jsc: {
        experimental: {
          plugins: [["/plugins/user.wasm", { feature: true }]],
        },
      },
    },
  };
  const before = structuredClone(rule);

  const returned = applyRstestCoverageToSwcRule(rule, {
    plan: coveragePlan({ enabled: false }),
  });

  assert.equal(returned, rule);
  assert.deepEqual(rule, before);
});

test("Istanbul coverage appends its exact exclusions after existing SWC plugins once", () => {
  const coveragePlugin = "/app/node_modules/swc-plugin-coverage-instrument/plugin.wasm";
  const rule = {
    options: {
      jsc: {
        experimental: {
          plugins: [["/plugins/user.wasm", { feature: true }]],
        },
      },
    },
  };

  applyRstestCoverageToSwcRule(rule, {
    plan: coveragePlan(),
    pluginPath: coveragePlugin,
  });
  applyRstestCoverageToSwcRule(rule, {
    plan: coveragePlan(),
    pluginPath: coveragePlugin,
  });

  assert.deepEqual(rule.options.jsc.experimental.plugins, [
    ["/plugins/user.wasm", { feature: true }],
    [coveragePlugin, { unstableExclude: ["**/*.test.js"] }],
  ]);
});

test("Meteor-hosted coverage rejects the V8 provider", () => {
  assert.throws(
    () =>
      applyRstestCoverageToSwcRule(
        { options: { jsc: {} } },
        {
          plan: coveragePlan({ provider: "v8" }),
          pluginPath: "/plugins/coverage.wasm",
        },
      ),
    /Istanbul provider/,
  );
});

test("coverage plans reject stale generations before instrumentation", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "meteor-rspack-coverage-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const filename = path.join(root, "plan.json");
  fs.writeFileSync(
    filename,
    JSON.stringify(
      coveragePlan({
        root,
        artifactRoot: path.join(root, "artifacts"),
      }),
    ),
  );

  assert.deepEqual(
    readRstestCoveragePlan(filename, { generation: "generation-1" }),
    coveragePlan({ root, artifactRoot: path.join(root, "artifacts") }),
  );
  assert.throws(
    () => readRstestCoveragePlan(filename, { generation: "generation-2" }),
    /invalid or stale coverage plan/i,
  );
});

test("hosted coverage resolves separately from the native Istanbul compiler plugin", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "meteor-rspack-provider-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "package.json"), "{}");
  const coordinatorRoot = path.join(root, "node_modules", "@meteorjs", "rstest");
  const coordinatorEntry = path.join(coordinatorRoot, "index.js");
  const providerRoot = path.join(coordinatorRoot, "node_modules", "@rstest", "coverage-istanbul");
  const providerEntry = path.join(providerRoot, "dist", "index.js");
  const pluginRoot = path.join(coordinatorRoot, "node_modules", "swc-plugin-coverage-instrument");
  const pluginPath = path.join(pluginRoot, "coverage.wasm");
  fs.mkdirSync(path.dirname(providerEntry), { recursive: true });
  fs.mkdirSync(pluginRoot, { recursive: true });
  fs.writeFileSync(coordinatorEntry, "module.exports = {};");
  fs.writeFileSync(
    path.join(coordinatorRoot, "package.json"),
    JSON.stringify({
      name: "@meteorjs/rstest",
      main: "index.js",
    }),
  );
  fs.writeFileSync(providerEntry, "module.exports = {};");
  fs.writeFileSync(
    path.join(providerRoot, "package.json"),
    JSON.stringify({
      name: "@rstest/coverage-istanbul",
      main: "dist/index.js",
    }),
  );
  fs.writeFileSync(
    path.join(pluginRoot, "package.json"),
    JSON.stringify({
      name: "swc-plugin-coverage-instrument",
      main: "coverage.wasm",
    }),
  );
  fs.writeFileSync(pluginPath, "wasm");
  const nativePluginRoot = path.join(
    providerRoot,
    "node_modules",
    "swc-plugin-coverage-instrument",
  );
  fs.mkdirSync(nativePluginRoot, { recursive: true });
  fs.writeFileSync(
    path.join(nativePluginRoot, "package.json"),
    JSON.stringify({
      name: "swc-plugin-coverage-instrument",
      main: "native.wasm",
    }),
  );
  fs.writeFileSync(path.join(nativePluginRoot, "native.wasm"), "older compiler ABI");

  assert.equal(resolveRstestCoverageSwcPlugin({ npmRoot: root }), fs.realpathSync(pluginPath));

  const planPath = path.join(root, "coverage-plan.json");
  fs.writeFileSync(
    planPath,
    JSON.stringify(
      coveragePlan({
        root,
        artifactRoot: path.join(root, "coverage"),
      }),
    ),
  );
  const rule = { options: { jsc: {} } };
  applyRstestCoverageToSwcRule(rule, {
    plan: readRstestCoveragePlan(planPath, { generation: "generation-1" }),
    pluginPath: resolveRstestCoverageSwcPlugin({ npmRoot: root }),
  });
  assert.deepEqual(rule.options.jsc.experimental.plugins, [
    [fs.realpathSync(pluginPath), { unstableExclude: ["**/*.test.js"] }],
  ]);
});

test("hosted coverage instruments executable code with the supported Rspack compiler", async (t) => {
  const { rspack } = require("@rspack/core");
  const { createMeteorSwcRule } = require("@meteorjs/rspack/config");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "meteor-hosted-coverage-"));
  const entry = path.join(root, "entry.js");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(entry, "export const double = value => value > 0 ? value * 2 : 0;");
  const rule = createMeteorSwcRule({ root, isClient: false });
  applyRstestCoverageToSwcRule(rule, {
    plan: coveragePlan({ root }),
    pluginPath: resolveRstestCoverageSwcPlugin({ npmRoot: path.resolve(__dirname, "..") }),
  });
  const compiler = rspack({
    mode: "development",
    devtool: false,
    context: root,
    target: "node",
    entry: "./entry.js",
    output: { path: path.join(root, "out"), library: { type: "commonjs2" } },
    module: { rules: [rule] },
  });
  try {
    const stats = await new Promise((resolve, reject) => {
      compiler.run((error, result) => (error ? reject(error) : resolve(result)));
    });
    assert.equal(stats.hasErrors(), false, stats.toString({ all: false, errors: true }));
    const context = { module: { exports: {} } };
    require("node:vm").runInNewContext(
      fs.readFileSync(path.join(root, "out/main.js"), "utf8"),
      context,
    );
    assert.equal(context.module.exports.double(3), 6);
    assert.equal(context.module.exports.double(-1), 0);
    const coverage = context.__coverage__[entry];
    assert.ok(Object.values(coverage.f).some((count) => count === 2));
    assert.ok(Object.values(coverage.b).some((counts) => counts.every((count) => count > 0)));
  } finally {
    await new Promise((resolve, reject) =>
      compiler.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
