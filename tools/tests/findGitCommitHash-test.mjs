/**
 * Standalone test for findGitCommitHash EBADF handling.
 *
 * Demonstrates that a synchronous throw from execFile (e.g. spawn EBADF)
 * must be caught so the promise resolves with undefined instead of rejecting.
 *
 * Run: node tools/tests/findGitCommitHash-test.mjs
 */

import assert from "assert";

// Replicates the fixed findGitCommitHash from tools/fs/files.ts,
// accepting an execFile function for testability.
function findGitCommitHash(execFileFn) {
  return new Promise(resolve => {
    try {
      execFileFn(
        "git",
        ["rev-parse", "HEAD"],
        { cwd: "." },
        (error, stdout) => {
          if (!error && typeof stdout === "string") {
            resolve(stdout.trim());
          } else {
            resolve();
          }
        }
      );
    } catch (e) {
      resolve();
    }
  });
}

// Mock execFile that throws EBADF synchronously, as happens during
// heavy cold builds in git worktrees when file descriptors are exhausted.
function execFileThrowsEBADF() {
  const err = new Error("spawn EBADF");
  err.code = "EBADF";
  err.errno = -9;
  err.syscall = "spawn";
  throw err;
}

// Mock execFile that works normally.
function execFileNormal(cmd, args, opts, cb) {
  cb(null, "abc123\n");
}

async function run() {
  // The promise must resolve (not reject) when execFile throws EBADF.
  const result = await findGitCommitHash(execFileThrowsEBADF);
  assert.strictEqual(result, undefined,
    "Expected undefined when execFile throws EBADF");

  // Normal operation still works.
  const hash = await findGitCommitHash(execFileNormal);
  assert.strictEqual(hash, "abc123",
    "Expected trimmed stdout from execFile");

  console.log("PASSED: findGitCommitHash handles synchronous EBADF");
}

run().catch(err => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
