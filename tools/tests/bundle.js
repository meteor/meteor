var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;

import * as files from "../fs/files";
import { execSync } from 'child_process';
// Default maxBuffer for execSync is 1024 * 1024 bytes, so this is 10x that.
const maxBuffer = 10 * 1024 * 1024;

selftest.define("bundle", async function () {
  var s = new Sandbox();
  await s.init();

  var run;

  await s.createApp("myapp", "standard-app");
  s.cd("myapp");
  run = s.run("bundle", "../myapp.tgz");
  run.waitSecs(60);
  await run.expectExit(0);

  var tarball = files.pathJoin(s.cwd, "../myapp.tgz");
  await selftest.expectEqual(files.exists(tarball), true);
});

selftest.define("bundle - verify sanitized asset names", async function () {
  const s = new Sandbox();
  await s.init();

  let run;

  await s.createApp("sanitized-app", "sanitized-app");
  s.cd("sanitized-app");
  run = s.run("bundle", "../sanitized-app.tgz");
  run.waitSecs(60);
  await run.expectExit(0);

  const tarball = files.pathJoin(s.cwd, "../sanitized-app.tgz");
  const sanitizedFilename = 'Meteor_-@2x.png';
  selftest.expectTrue(
    execSync(`tar -tf ${tarball}`, {
      maxBuffer,
    }).toString().indexOf(sanitizedFilename) > -1
  );
});

selftest.define("bundle - isobuild crashes with ERR_INVALID_ARG_TYPE when encountering broken symlinks (#11241)", async function () {
  const s = new Sandbox({ fakeMongo: true });
  await s.init();

  await s.createApp("myapp", "standard-app");
  s.cd("myapp");

  //Add bad symlink
  s.mkdir("node_modules/.bin");
  const symlink = files.pathJoin(s.cwd, "node_modules/.bin/bad");
  try {
    files.unlink(symlink);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  files.symlink("nonexistent", symlink);

  const run = s.run();
  await run.match("myapp");
  await run.match("proxy");

  //make sure we get the useful error, not the cryptic one
  await run.matchErr("Broken symbolic link encountered at");
});
