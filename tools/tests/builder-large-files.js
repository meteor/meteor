import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import Builder from "../isobuild/builder";
import files from "../fs/files";
import { define } from "../tool-testing/selftest";

const LARGE_SIZE = 2 ** 31;

async function withFixture(realLargeFile, run) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "meteor-large-file-")));
  const source = path.join(root, "source");
  const input = path.join(source, "payload");
  const outputPath = path.join(root, "bundle");
  let builder;
  fs.mkdirSync(source);
  const makeFile = (filename, contents) => {
    files.writeFile(files.convertToStandardPath(filename), contents);
    if (realLargeFile) {
      const fd = fs.openSync(filename, "r+");
      try {
        fs.ftruncateSync(fd, LARGE_SIZE);
        fs.writeSync(fd, Buffer.from("tail"), 0, 4, LARGE_SIZE - 4);
      } finally {
        fs.closeSync(fd);
      }
    }
  };
  const readAt = (filename, position = 0) => {
    const fd = fs.openSync(filename, "r");
    try {
      const bytes = Buffer.alloc(4);
      assert.strictEqual(fs.readSync(fd, bytes, 0, 4, position), 4);
      return bytes.toString();
    } finally {
      fs.closeSync(fd);
    }
  };
  const copy = async () => {
    builder = new Builder({
      outputPath: files.convertToStandardPath(outputPath),
      previousBuilder: builder,
      forceInPlaceBuild: true,
    });
    await builder.init();
    if (!realLargeFile) {
      const copyFile = builder._copyFile;
      // Control only the source metadata at Builder's file-copy boundary.
      // The copy, permissions, rename and output bookkeeping remain real.
      builder._copyFile = (from, to, stat, ...args) => copyFile.call(builder,
        from, to, to === "data/payload" ? { ...stat, size: LARGE_SIZE } : stat,
        ...args);
    }
    await builder.copyDirectory({
      from: files.convertToStandardPath(source),
      to: "data",
      symlink: false,
    });
    await builder.complete();
    return path.join(outputPath, "data", "payload");
  };
  try {
    await run({ root, source, input, makeFile, readAt, copy, realLargeFile });
  } finally {
    if (builder) await builder.abort();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function currentBytes({ source, input, makeFile, readAt, copy, realLargeFile }) {
  fs.writeFileSync(path.join(source, "small"), "ordinary file");
  makeFile(input, "1111");
  const timestamp = new Date("2025-01-01T00:00:00Z");
  fs.utimesSync(input, timestamp, timestamp);
  const output = await copy();
  assert.strictEqual(fs.statSync(output).size, realLargeFile ? LARGE_SIZE : 4);
  assert.strictEqual(readAt(output), "1111");
  assert.strictEqual(fs.readFileSync(path.join(path.dirname(output), "small"), "utf8"),
    "ordinary file");
  const reader = process.platform === "win32" ? null : fs.openSync(output, "r");
  try {
    const fd = fs.openSync(input, "r+");
    try {
      fs.writeSync(fd, Buffer.from("2222"), 0, 4, 0);
    } finally {
      fs.closeSync(fd);
    }
    fs.utimesSync(input, timestamp, timestamp);
    await copy();
    assert.strictEqual(readAt(output), "2222");
    if (realLargeFile) assert.strictEqual(readAt(output, LARGE_SIZE - 4), "tail");
    if (reader !== null) {
      const oldBytes = Buffer.alloc(4);
      assert.strictEqual(fs.readSync(reader, oldBytes, 0, 4, 0), 4);
      assert.strictEqual(oldBytes.toString(), "1111");
    }
  } finally {
    if (reader !== null) fs.closeSync(reader);
  }
}

async function externalTarget({ root, input, makeFile, readAt, copy, realLargeFile }) {
  const external = path.join(root, "external");
  makeFile(external, "3333");
  files.symlink(files.convertToStandardPath(external), files.convertToStandardPath(input));
  const output = await copy();
  assert.strictEqual(fs.lstatSync(output).isSymbolicLink(), false);
  assert.strictEqual(fs.statSync(output).size, realLargeFile ? LARGE_SIZE : 4);
  assert.strictEqual(readAt(output), "3333");
  if (realLargeFile) assert.strictEqual(readAt(output, LARGE_SIZE - 4), "tail");
}

async function replaceSymlink({ source, input, makeFile, readAt, copy }) {
  const keeper = path.join(source, "keeper");
  files.writeFile(files.convertToStandardPath(keeper), "safe");
  files.symlink("keeper", files.convertToStandardPath(input));
  const output = await copy();
  assert.strictEqual(fs.lstatSync(output).isSymbolicLink(), true);
  files.unlink(files.convertToStandardPath(input));
  makeFile(input, "4444");
  await copy();
  assert.strictEqual(fs.lstatSync(output).isSymbolicLink(), false);
  assert.strictEqual(readAt(output), "4444");
  assert.strictEqual(readAt(path.join(path.dirname(output), "keeper")), "safe");
  assert.strictEqual(readAt(keeper), "safe");
}

for (const [name, scenario] of [
  ["current bytes and existing readers on rebuild", currentBytes],
  ["external file targets outside copied roots", externalTarget],
  ["regular files replacing a prior symlink", replaceSymlink],
]) {
  define(`builder - large copies preserve ${name}`, async () => {
    await withFixture(false, scenario);
  });
  // Opt in with --slow to exercise Node's actual single-read limit. Routine
  // CI can cover metadata/rebuild behavior without multi-gigabyte output files.
  define(`builder - real 2GiB copies preserve ${name}`, ["slow"], async () => {
    await withFixture(true, scenario);
  });
}

if (process.platform !== "win32") {
  define("files - copyFile honors umask and source executable bit", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "meteor-copy-mode-"));
    const input = path.join(root, "input");
    const originalUmask = process.umask();
    try {
      fs.writeFileSync(input, "content");
      for (const mask of [0o022, 0o077]) {
        process.umask(mask);
        for (const sourceMode of [0o644, 0o755]) {
          fs.chmodSync(input, sourceMode);
          const output = path.join(root, `copy-${mask}-${sourceMode}`);
          files.copyFile(files.convertToStandardPath(input), files.convertToStandardPath(output));
          const expected = (sourceMode & 0o100 ? 0o777 : 0o666) & ~mask;
          assert.strictEqual(fs.statSync(output).mode & 0o777, expected);
          assert.strictEqual(fs.readFileSync(output, "utf8"), "content");
        }
      }
    } finally {
      process.umask(originalUmask);
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}
