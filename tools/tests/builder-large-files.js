import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import Builder from "../isobuild/builder";
import files from "../fs/files";
import { define } from "../tool-testing/selftest";

// Exercise the real Buffer-size boundary without allocating a giant Buffer.
// The input is sparse; copying and Builder bookkeeping use the real filesystem.
define("builder - large files copy current bytes on rebuild", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "meteor-large-file-"));
  const source = path.join(root, "source");
  const input = path.join(source, "payload");
  const size = 2 ** 31;
  const outputPath = path.join(root, "bundle");
  const timestamp = new Date("2025-01-01T00:00:00Z");
  let builder;
  try {
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, "small"), "ordinary file");
    const fd = fs.openSync(input, "w");
    try {
      fs.ftruncateSync(fd, size);
      fs.writeSync(fd, Buffer.from("1111"), 0, 4, 0);
      fs.writeSync(fd, Buffer.from("tail"), 0, 4, size - 4);
    } finally {
      fs.closeSync(fd);
    }
    fs.utimesSync(input, timestamp, timestamp);

    const copy = async () => {
      builder = new Builder({
        outputPath: files.convertToStandardPath(outputPath),
        previousBuilder: builder,
        forceInPlaceBuild: true,
      });
      await builder.init();
      await builder.copyDirectory({
        from: files.convertToStandardPath(source),
        to: "data",
        symlink: false,
      });
      await builder.complete();
      return path.join(outputPath, "data", "payload");
    };
    const readAt = (filename, position) => {
      const fd = fs.openSync(filename, "r");
      try {
        const bytes = Buffer.alloc(4);
        assert.strictEqual(fs.readSync(fd, bytes, 0, 4, position), 4);
        return bytes.toString();
      } finally {
        fs.closeSync(fd);
      }
    };

    const output = await copy();
    assert.strictEqual(fs.statSync(output).size, size);
    assert.strictEqual(readAt(output, 0), "1111");
    assert.strictEqual(readAt(output, size - 4), "tail");
    assert.strictEqual(fs.readFileSync(path.join(path.dirname(output), "small"), "utf8"),
      "ordinary file");
    if (process.platform !== "win32") {
      assert.strictEqual(fs.statSync(output).mode & 0o777, 0o666 & ~process.umask());
    }

    // Timestamp-preserving replacement can change bytes without changing size
    // or mtime. Update only the beginning, without allocating a large Buffer.
    const inputFd = files.open(files.convertToStandardPath(input), "r+");
    try {
      files.write(inputFd, Buffer.from("2222"), 0, 4, 0);
    } finally {
      files.close(inputFd);
    }
    fs.utimesSync(input, timestamp, timestamp);
    await copy();
    assert.strictEqual(fs.statSync(output).size, size);
    assert.strictEqual(readAt(output, 0), "2222");
    assert.strictEqual(readAt(output, size - 4), "tail");
  } finally {
    if (builder) await builder.abort();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

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
          files.copyFile(files.convertToStandardPath(input),
            files.convertToStandardPath(output));
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
