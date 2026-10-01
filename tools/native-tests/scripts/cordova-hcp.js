const path = require("node:path");
const fs = require("fs-extra");

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_INTERVAL_MS = 1_000;
const MANIFEST_PATH = "/__cordova/manifest.json";

const FIXTURE_REPLACEMENTS = [
  {
    file: path.join("client", "main.html"),
    from: "Welcome to Meteor Cordova Tests",
    to: "Welcome to Meteor Cordova Tests Updated",
  },
  {
    file: path.join("client", "main.js"),
    from: "Native client version initial",
    to: "Native client version updated",
  },
  {
    file: path.join("server", "main.js"),
    from: "Native server version initial",
    to: "Native server version updated",
  },
];

async function replaceRequired(file, from, to) {
  const content = await fs.readFile(file, "utf8");
  if (!content.includes(from)) {
    throw new Error(`Required fixture marker "${from}" not found in ${file}`);
  }
  await fs.writeFile(file, content.replace(from, to), "utf8");
}

async function applyCordovaFixtureUpdate(appDir) {
  for (const replacement of FIXTURE_REPLACEMENTS) {
    await replaceRequired(
      path.join(appDir, replacement.file),
      replacement.from,
      replacement.to
    );
  }
}

async function readCordovaManifest({
  baseUrl,
  fetchImpl = globalThis.fetch,
  signal,
}) {
  const url = new URL(MANIFEST_PATH, baseUrl).toString();
  const response = await fetchImpl(url, {
    headers: { "cache-control": "no-cache" },
    signal,
  });
  if (!response.ok) {
    throw new Error(
      `Cordova manifest request failed with HTTP ${response.status}`
    );
  }
  const manifest = await response.json();
  if (
    typeof manifest?.version !== "string" ||
    manifest.version.length === 0
  ) {
    throw new Error("Cordova manifest must contain a non-empty version");
  }
  return { version: manifest.version, manifest };
}

async function waitForCordovaManifestChange({
  baseUrl,
  previousVersion,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  intervalMs = DEFAULT_INTERVAL_MS,
  fetchImpl = globalThis.fetch,
}) {
  const manifestUrl = new URL(MANIFEST_PATH, baseUrl).toString();
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    const remainingMs = deadline - Date.now();
    const abortController = new AbortController();
    const timeoutError = new Error("request timed out");
    let requestTimeout;

    try {
      const timeoutPromise = new Promise((_, reject) => {
        requestTimeout = setTimeout(() => {
          reject(timeoutError);
          abortController.abort(timeoutError);
        }, remainingMs);
      });
      const result = await Promise.race([
        readCordovaManifest({
          baseUrl,
          fetchImpl,
          signal: abortController.signal,
        }),
        timeoutPromise,
      ]);
      if (result.version !== previousVersion) {
        return result;
      }
      lastError = new Error(`version remains ${previousVersion}`);
    } catch (error) {
      lastError = error;
      if (error === timeoutError) {
        break;
      }
    } finally {
      clearTimeout(requestTimeout);
    }

    const remainingAfterRequestMs = deadline - Date.now();
    if (remainingAfterRequestMs > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(intervalMs, remainingAfterRequestMs))
      );
    }
  }

  const detail = lastError ? `: ${lastError.message}` : "";
  throw new Error(
    `Timed out waiting for Cordova manifest ${manifestUrl} to change from ` +
      `${previousVersion}${detail}`
  );
}

module.exports = {
  applyCordovaFixtureUpdate,
  readCordovaManifest,
  waitForCordovaManifestChange,
};
