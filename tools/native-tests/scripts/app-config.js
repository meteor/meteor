const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_APP = "capacitor-tests";

const APPS = {
  "capacitor-tests": {
    name: "capacitor-tests",
    appId: "com.meteor.capacitortests",
    appName: "MeteorCapacitorTests",
    wrapper: "capacitor",
    sourceDir: path.join(ROOT, "apps", "capacitor-tests"),
    flowPath: path.join(ROOT, "flows", "capacitor-tests.yaml"),
    livereloadInitialFlowPath: path.join(ROOT, "flows", "capacitor-tests-livereload-initial.yaml"),
    livereloadFlowPath: path.join(ROOT, "flows", "capacitor-tests-livereload.yaml"),
    hcpInitialFlowPath: path.join(ROOT, "flows", "capacitor-tests-hcp-initial.yaml"),
    hcpFlowPath: path.join(ROOT, "flows", "capacitor-tests-hcp.yaml"),
  },
  smoke: {
    name: "smoke",
    appId: "com.meteor.smoke",
    appName: "MeteorSmoke",
    wrapper: "cordova",
    sourceDir: path.join(ROOT, "apps", "smoke"),
    flowPath: path.join(ROOT, "flows", "launch.yaml"),
  },
};

function listAppNames() {
  return Object.keys(APPS);
}

function getAppConfig(name = DEFAULT_APP) {
  const app = APPS[name];
  if (!app) {
    throw new Error(`Unknown native test app: ${name}`);
  }
  return { ...app };
}

module.exports = {
  DEFAULT_APP,
  getAppConfig,
  listAppNames,
};
