import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function tmpProject(t, files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "check-ttc-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
