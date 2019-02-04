import assert from "assert";
import Run from "../tool-testing/run.js";
import selftest from "../tool-testing/selftest.js";
const Sandbox = selftest.Sandbox;

function gitHelper(...args) {
  assert(this instanceof Sandbox);
  const run = new Run("git", {
    sandbox: this,
    args,
    cwd: this.cwd,
    env: this._makeEnv(),
  });
  run.expectExit(0);
  return run;
}

function initGitApp(sandbox) {
  const git = gitHelper.bind(sandbox);

  git("init");
  git("config", "user.name", "Ben Newman");
  git("config", "user.email", "ben@meteor.com");
  git("add", ".");
  git("commit", "-m", "first");

  let commitHash;
  git("rev-parse", "HEAD").outputLog.get().some(line => {
    if (line.channel === "stdout") {
      commitHash = line.text;
      return true;
    }
  });

  assert(/^[0-9a-z]{40}$/.test(commitHash), commitHash);

  return commitHash;
}

selftest.define("Meteor.gitCommitHash", function () {
  const s = new Sandbox();

  s.createApp("app-using-git", "git-commit-hash");
  s.cd("app-using-git");

  const commitHash = initGitApp(s);

  const build = s.run("build", "--directory", "../app-using-git-build");
  build.waitSecs(30);
  build.expectExit(0);

  const star = JSON.parse(s.read("../app-using-git-build/bundle/star.json"));
  assert.strictEqual(star.gitCommitHash, commitHash);

  const test = s.run("npm", "test");
  test.waitSecs(30);
  test.match("__meteor_runtime_config__.gitCommitHash: " + commitHash);
  test.match("App running at");
  test.match("SERVER FAILURES: 0");
  test.match("CLIENT FAILURES: 0");
  test.waitSecs(30);
  test.expectExit(0);
});
