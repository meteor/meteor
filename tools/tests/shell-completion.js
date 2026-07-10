const assert = require("assert");

const selftest = require("../tool-testing/selftest.js");
const Sandbox = selftest.Sandbox;

selftest.define("shell-completion", async function () {
  const s = new Sandbox();
  await s.init();
  s.set("HOME", s.home);

  // Test top-level commands suggestions
  let run = s.run("shell-completion", "--index", "1", "--", "meteor", "");
  await run.match("add");
  await run.match("admin");
  await run.match("create");
  await run.match("remove");
  await run.match("run");
  run.forbid("recommend-release");
  run.forbid("shell-completion");
  await run.expectExit(0);

  // Test option completion for 'run' command
  run = s.run("shell-completion", "--index", "2", "--", "meteor", "run", "--p");
  await run.match("--port");
  await run.match("--production");
  await run.expectExit(0);

  // Test subcommand suggestions (e.g. admin)
  run = s.run("shell-completion", "--index", "2", "--", "meteor", "admin", "");
  await run.match("recommend-release");
  await run.expectExit(0);

  // Test script output for bash
  run = s.run("shell-completion", "--script", "--shell", "bash");
  await run.match("# Meteor bash completion");
  await run.match("static_top_level_commands=");
  await run.match("'admin'");
  await run.match("COMP_WORDS[0]");
  await run.match('if _meteor_alias_targets_cli "$alias_value"; then');
  await run.match('complete -o default -o bashdefault -F _meteor_complete "$alias_name"');
  await run.expectExit(0);

  // Test script output for zsh
  run = s.run("shell-completion", "--script", "--shell", "zsh");
  await run.match("# Meteor zsh completion");
  await run.match("static_top_level_commands=");
  await run.match("'admin'");
  await run.match("words[1]");
  await run.match('if _meteor_alias_targets_cli "$alias_name"; then');
  await run.match('compdef _meteor "$alias_name"');
  await run.expectExit(0);

  // Test install/uninstall cycles keep shell rc files clean (zsh).
  run = s.run("shell-completion", "--install", "--shell", "zsh");
  await run.expectExit(0);
  let zshrc = s.read(".zshrc");
  assert.strictEqual((zshrc.match(/# Meteor autocompletion/g) || []).length, 1);

  // Double-install must not duplicate the block.
  run = s.run("shell-completion", "--install", "--shell", "zsh");
  await run.expectExit(0);
  zshrc = s.read(".zshrc");
  assert.strictEqual((zshrc.match(/# Meteor autocompletion/g) || []).length, 1);

  run = s.run("shell-completion", "--uninstall");
  await run.expectExit(0);
  zshrc = s.read(".zshrc");
  assert.ok(!zshrc.includes("# Meteor autocompletion"));
  assert.ok(!zshrc.includes("meteor-completion.sh"));

  // Uninstall when nothing is installed must be a safe no-op.
  run = s.run("shell-completion", "--uninstall");
  await run.expectExit(0);

  run = s.run("shell-completion", "--install", "--shell", "zsh");
  await run.expectExit(0);
  zshrc = s.read(".zshrc");
  assert.strictEqual((zshrc.match(/# Meteor autocompletion/g) || []).length, 1);

  // Test install/uninstall cycle for bash.
  run = s.run("shell-completion", "--install", "--shell", "bash");
  await run.expectExit(0);
  // On non-darwin or when .bashrc exists, completion is written to .bashrc.
  const bashrc = s.read(".bashrc");
  assert.strictEqual(
    (bashrc.match(/# Meteor autocompletion/g) || []).length,
    1
  );

  // Double-install must not duplicate the bash block.
  run = s.run("shell-completion", "--install", "--shell", "bash");
  await run.expectExit(0);
  assert.strictEqual(
    (s.read(".bashrc").match(/# Meteor autocompletion/g) || []).length,
    1
  );

  run = s.run("shell-completion", "--uninstall");
  await run.expectExit(0);
  assert.ok(!s.read(".bashrc").includes("# Meteor autocompletion"));
  assert.ok(!s.read(".bashrc").includes("meteor-completion.sh"));
});
