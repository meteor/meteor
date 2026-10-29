const assert = require("assert");

const selftest = require("../tool-testing/selftest.js");
const files = require("../fs/files");
const Sandbox = selftest.Sandbox;
const Run = selftest.Run;

function hasShell(shell) {
  try {
    require("child_process").execFileSync(shell, ["-c", "exit 0"], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function runShell(s, shell, args) {
  return new Run(shell, {
    sandbox: s,
    args,
    cwd: s.cwd,
    env: {
      ...s._makeEnv(),
      BASH_ENV: "",
      METEOR_EXEC: files.convertToOSPath(s.execPath),
    },
  });
}

async function expectBashLoadsCompletion(s, rcFile) {
  const run = runShell(s, "bash", [
    "--noprofile",
    "--norc",
    "-c",
    `source "$HOME/${rcFile}" && complete -p meteor`,
  ]);
  await run.match("-F _meteor_complete meteor");
  await run.expectExit(0);
}

async function expectZshLoadsCompletion(s) {
  const run = runShell(s, "zsh", [
    "-f",
    "-c",
    'autoload -Uz compinit && compinit -D -u && source "$HOME/.zshrc" && ' +
      'print -r -- "handler=${_comps[meteor]}"',
  ]);
  await run.match("handler=_meteor");
  await run.expectExit(0);
}

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
  // macOS only touches .bashrc when it already exists.
  const bashRcFile = process.platform === "darwin" ? ".bash_profile" : ".bashrc";
  run = s.run("shell-completion", "--install", "--shell", "bash");
  await run.expectExit(0);
  assert.strictEqual(
    (s.read(bashRcFile).match(/# Meteor autocompletion/g) || []).length,
    1
  );

  // Double-install must not duplicate the bash block.
  run = s.run("shell-completion", "--install", "--shell", "bash");
  await run.expectExit(0);
  assert.strictEqual(
    (s.read(bashRcFile).match(/# Meteor autocompletion/g) || []).length,
    1
  );

  // Installing for one shell must not clobber the other one's script. zsh
  // goes last so the bash check, which always runs in CI, is the one at risk.
  run = s.run("shell-completion", "--install", "--shell", "zsh");
  await run.expectExit(0);
  assert.ok(
    s.read(".meteor/meteor-completion.zsh")?.startsWith("# Meteor zsh completion")
  );
  assert.ok(
    s.read(".meteor/meteor-completion.bash")?.startsWith("# Meteor bash completion")
  );

  const hasBash = process.platform !== "win32" && hasShell("bash");
  const hasZsh = process.platform !== "win32" && hasShell("zsh");

  if (hasBash) {
    await expectBashLoadsCompletion(s, bashRcFile);
  }

  if (hasZsh) {
    await expectZshLoadsCompletion(s);
  }

  // Bash 4+ hands "author:p" to the completion function already split on
  // ":", while bash 3.2 keeps it whole; both only replace what follows the ":".
  if (hasBash) {
    s.mkdir("completion-app");
    s.mkdir("completion-app/.meteor");
    s.write("completion-app/.meteor/release", "none\n");
    s.write(
      "completion-app/.meteor/packages",
      "meteor-base\nauthor:package\nother:thing\n" +
        "$(touch $HOME/completion-expanded)\n"
    );

    const completeInBash = (line, words, cword) =>
      runShell(s, "bash", [
        "--noprofile",
        "--norc",
        "-c",
        'meteor() { "$METEOR_EXEC" "$@"; }\n' +
          'source "$HOME/.meteor/meteor-completion.sh"\n' +
          `COMP_LINE='${line}'\n` +
          "COMP_POINT=${#COMP_LINE}\n" +
          `COMP_WORDS=(${words})\n` +
          `COMP_CWORD=${cword}\n` +
          "_meteor_complete\n" +
          'echo "reply=${#COMPREPLY[@]}:${COMPREPLY[*]}"',
      ]);

    await s.cd("completion-app", async () => {
      run = completeInBash(
        "meteor remove author:p",
        "meteor remove author : p",
        4
      );
      await run.match("reply=1:package");
      await run.expectExit(0);

      run = completeInBash(
        "meteor remove author:p",
        "meteor remove author:p",
        2
      );
      await run.match("reply=1:package");
      await run.expectExit(0);

      run = completeInBash(
        "meteor remove author:",
        "meteor remove author :",
        3
      );
      await run.match("reply=1:package");
      await run.expectExit(0);

      run = completeInBash(
        "meteor remove author:package oth",
        "meteor remove author : package oth",
        5
      );
      await run.match("reply=1:other:thing");
      await run.expectExit(0);

      // Entries from .meteor/packages are matched as plain text.
      run = completeInBash("meteor remove ", 'meteor remove ""', 2);
      await run.match("reply=4:");
      await run.expectExit(0);
      assert.strictEqual(s.read("../completion-expanded"), null);
    });
  }

  run = s.run("shell-completion", "--uninstall");
  await run.expectExit(0);
  assert.ok(!s.read(bashRcFile).includes("# Meteor autocompletion"));
  assert.ok(!s.read(bashRcFile).includes("meteor-completion.sh"));
  assert.strictEqual(s.read(".meteor/meteor-completion.sh"), null);
  assert.strictEqual(s.read(".meteor/meteor-completion.bash"), null);
  assert.strictEqual(s.read(".meteor/meteor-completion.zsh"), null);

  // An install from before the per-shell scripts kept the whole zsh script in
  // meteor-completion.sh; installing bash on top must not break zsh.
  s.write(".meteor/meteor-completion.sh", "# Meteor zsh completion\n");
  s.write(
    ".zshrc",
    "\n# Meteor autocompletion\n" +
      '[ -f "$HOME/.meteor/meteor-completion.sh" ] && ' +
      'source "$HOME/.meteor/meteor-completion.sh"\n'
  );

  run = s.run("shell-completion", "--install", "--shell", "bash");
  await run.expectExit(0);
  assert.ok(
    s.read(".meteor/meteor-completion.sh")?.startsWith("# Meteor shell completion loader")
  );
  assert.ok(
    s.read(".meteor/meteor-completion.zsh")?.startsWith("# Meteor zsh completion")
  );

  if (hasBash) {
    await expectBashLoadsCompletion(s, bashRcFile);
  }

  if (hasZsh) {
    await expectZshLoadsCompletion(s);
  }

  run = s.run("shell-completion", "--uninstall");
  await run.expectExit(0);
});
