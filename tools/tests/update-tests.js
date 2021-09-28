import selftest, { Sandbox } from '../tool-testing/selftest.js';
import catalog from '../packaging/catalog/catalog.js';

const DEFAULT_RELEASE_TRACK = catalog.DEFAULT_TRACK;
const SIMPLE_WAREHOUSE = {
  v1: { },
  v2: { recommended: true }
};

selftest.define("'meteor update' adds constraints to `.meteor/packages`", () => {
  const s = new Sandbox({
    warehouse: SIMPLE_WAREHOUSE,
    fakeMongo: true
  });

  s.createApp("myapp", "very-simple-app-with-no-package-constraints", {
    release: DEFAULT_RELEASE_TRACK + '@v1'
  });
  s.cd("myapp");

  run = s.run("update");
  run.match("updated to Meteor v2");
  run.expectExit(0);

  const packages = s.read(".meteor/packages");
  if (!packages.match('meteor-base@')) {
    selftest.fail("Failed to add a version specifier to `meteor-base` package");
  }
});

selftest.define("'meteor update' alters constraints in `.meteor/packages`", () => {
  const s = new Sandbox({
    warehouse: SIMPLE_WAREHOUSE,
    fakeMongo: true
  });

  s.createApp("myapp", "very-simple-app-with-no-package-constraints", {
    release: DEFAULT_RELEASE_TRACK + '@v1',
    dontPrepareApp: true,
  });
  s.cd("myapp");

  // change the package file to be an old version
  s.write('.meteor/packages', 'meteor-base@0.0.1');

  run = s.run("update");
  run.match("updated to Meteor v2");
  run.expectExit(0);

  const packages = s.read(".meteor/packages");
  if (packages.match('meteor-base@0.0.1')) {
    selftest.fail("Failed to update the version specifier for the `meteor-base` package");
  }
});

selftest.define("'meteor update' updates indirect dependencies with patches", () => {
  const s = new Sandbox();

  s.createApp("myapp", "app-with-indirect-dependencies", {
    release: DEFAULT_RELEASE_TRACK + '@v1'
  });
  s.cd("myapp");

  var run = s.run("--prepare-app");
  // our .meteor/versions contains a version of this so we shouldn't change it
  run.forbid(/indirect-dependency/);
  run.expectExit(0);

  var update = s.run("update");
  // we have direct-dependency@=1.0.0, which depends on indirect@1.0.0
  // we should update to 1.0.1 (only take patches to indirect dependencies)
  update.match(/indirect-dependency.*1.0.1/);
  update.expectExit(0);
});

selftest.define("'meteor update --all-packages' updates indirect dependencies to latest, within constraints", () => {
  const s = new Sandbox();

  s.createApp("myapp", "app-with-indirect-dependencies", {
    release: DEFAULT_RELEASE_TRACK + '@v1'
  });
  s.cd("myapp");

  var run = s.run("--prepare-app");
  // our .meteor/versions contains a version of this so we shouldn't change it
  run.forbid(/indirect-dependency/);
  run.expectExit(0);

  var update = s.run("update", "--all-packages");
  // we have direct-dependency@=1.0.0, which depends on indirect@1.0.0
  // we should update to 1.1.0 but not 2.0.0
  update.match(/indirect-dependency.*1.1.0/);
  update.expectExit(0);
});
