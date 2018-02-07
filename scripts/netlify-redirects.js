const fs = require("hexo-fs");
const path = require("path");
const assert = require("assert");

const redirectsPath = path.join(hexo.public_dir, "_redirects");
console.log(redirectsPath);

const validVersion = /^[0-9.]+$/;

// Main entry point.
writeRedirectsForVersions();

function writeRedirectsForVersions() {
  if (hexo && hexo.config && hexo.config.versions) {
    assertValidVersions(hexo.config.versions);
    fs.writeFile(
      redirectsPath,
      getContentForVersions(hexo.config.versions));
  } else {
    console.warn("No versions were found in the Hexo configuration.");
  }
}

function assertValidVersions(versions) {
  assert.ok(Array.isArray(versions), "Invalid versions. Must be `Array` type.");
  assert.ok(versions.every(version => validVersion.test(version)),
    "Invalid version! Version strings must only contain digits and dots!");
}

function getUrlForVersion(version) {
  const urlVersion = version.replace(/\./g, "-");
  return `https://version-${urlVersion}--meteor-docs.netlify.com/:splat`;
}

function redirectLineForVersion(version) {
  const sourcePath = `/v${version}/*`
  const targetUrl = getUrlForVersion(version);
  return `${sourcePath} ${targetUrl} 200`; // 200 = status code.
}

function getContentForVersions(versions) {
  return versions
    .map(redirectLineForVersion)
    .join("\n")
    + "\n"; // Trailing newline.
}
