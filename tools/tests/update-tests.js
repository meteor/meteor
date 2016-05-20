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
    release: DEFAULT_RELEASE_TRACK + '@v1'
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
