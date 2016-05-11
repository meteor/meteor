import selftest, { Sandbox } from '../tool-testing/selftest.js';
import catalog from '../packaging/catalog/catalog.js';

const DEFAULT_RELEASE_TRACK = catalog.DEFAULT_TRACK;
const SIMPLE_WAREHOUSE = {
  v1: { },
  v2: { recommended: true }
};

selftest.define("'meteor update' alters `.meteor/packages`", () => {
  const s = new Sandbox({
    warehouse: SIMPLE_WAREHOUSE,
    fakeMongo: true
  });

  s.createApp("myapp", "very-simple-app-with-no-package-constraints");
  s.cd("myapp");

  s.write('.meteor/release', DEFAULT_RELEASE_TRACK + '@v1');
  run = s.run("update");
  run.match("updated to Meteor v2");
  run.expectExit(0);

  const packages = s.read(".meteor/packages");
  if (!packages.match('meteor-base@')) {
    selftest.fail("Failed to add a version specifier to `meteor-base` package");
  }
});
