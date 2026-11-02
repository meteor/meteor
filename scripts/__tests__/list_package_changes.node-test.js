const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const script = path.join(__dirname, "..", "list_package_changes.sh");

function run(...args) {
  return spawnSync("bash", [script, ...args], { encoding: "utf8" });
}

const optionsWithValues = [
  ["--output", "file.json"],
  ["--exclude-author", "author1,author2,..."],
];

for (const [option, example] of optionsWithValues) {
  test(`${option} without a value explains what it needs`, () => {
    const result = run(option);

    assert.equal(result.status, 1);
    assert.ok(
      result.stdout.includes(`Missing value for ${option}. Usage: ${option} ${example}`),
      `unexpected output: ${result.stdout}${result.stderr}`,
    );
    assert.ok(
      !result.stderr.includes("unbound variable"),
      `the parser leaked a shell error: ${result.stderr}`,
    );
  });
}

test("another option is not taken as a missing value", () => {
  const result = run("--output", "--exclude-author", "bot");

  assert.equal(result.status, 1);
  assert.ok(
    result.stdout.includes("Missing value for --output"),
    `unexpected output: ${result.stdout}${result.stderr}`,
  );
});
