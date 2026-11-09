import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

// This file is imported from a data: URL by actions/github-script before checkout,
// so it intentionally uses an ESM export even though the repository defaults to CJS.
export default async function runSelfHostedRunnerCleanup({
  github,
  context,
  scriptPath = "scripts/ci/self-hosted-runner-cleanup.js",
}) {
  const { owner, repo } = context.repo;
  const { data } = await github.rest.repos.getContent({
    owner,
    repo,
    path: scriptPath,
    ref: context.sha,
  });

  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "self-hosted-runner-cleanup-")
  );
  const tempFile = path.join(tempDir, path.basename(scriptPath));

  fs.writeFileSync(tempFile, Buffer.from(data.content, "base64"));

  try {
    const requireFromTempFile = createRequire(tempFile);
    const cleanup = requireFromTempFile(tempFile);
    await cleanup();
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
