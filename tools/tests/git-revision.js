import assert from "assert";
import Run from "../tool-testing/run.js";
import selftest from "../tool-testing/selftest.js";
const Sandbox = selftest.Sandbox;

selftest.define("git revision", function () {
  const s = new Sandbox();

  s.createApp("myapp", "git-revision");
  s.cd("myapp");

  function git(...args) {
    const run = new Run("git", {
      sandbox: s,
      args,
      cwd: s.cwd,
      env: s._makeEnv(),
    });
    run.expectExit(0);
    return run;
  }

  git("init");
  git("add", ".");
  git("commit", "-m", "first");

  let revision;
  git("rev-parse", "HEAD").outputLog.get().some(line => {
    if (line.channel === "stdout") {
      revision = line.text;
      return true;
    }
  });

  assert(/^[0-9a-z]{40}$/.test(revision), revision);

  const build = s.run("build", "--directory", "../myapp-build");
  build.waitSecs(30);
  build.expectExit(0);

  const star = JSON.parse(s.read("../myapp-build/bundle/star.json"));
  assert.strictEqual(star.gitRevision, revision);

  const run = s.run();
  run.match("__meteor_runtime_config__.gitRevision: " + revision);
  run.stop();
});
