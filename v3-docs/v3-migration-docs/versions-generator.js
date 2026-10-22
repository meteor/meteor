const fs = require("node:fs");

const develDevBundleLink =
  "https://raw.githubusercontent.com/meteor/meteor/refs/heads/devel/scripts/build-dev-bundle-common.sh";

const meteorToolLink =
  "https://raw.githubusercontent.com/meteor/meteor/refs/heads/devel/packages/meteor-tool/package.js";

const getMeteorVersionFromDevel = async () => {
  const response = await fetch(meteorToolLink);
  const text = await response.text();
  const version = text
    .match(/version: (.*)/)[1]
    .replaceAll("'", "")
    .replaceAll('"', "")
    .replaceAll(",", "");
  return version;
};

const getNodeAndNpmVersionFromDevel = async () => {
  const response = await fetch(develDevBundleLink);
  const text = await response.text();
  const nodeVersion = text.match(/NODE_VERSION=(.*)/)[1];
  const npmVersion = text.match(/NPM_VERSION=(.*)/)[1];
  return { nodeVersion, npmVersion };
};

async function main() {
  const [meteorVersion, { nodeVersion, npmVersion }] = await Promise.all([
    getMeteorVersionFromDevel(),
    getNodeAndNpmVersionFromDevel(),
  ]);

  const newIndexFile = fs
    .readFileSync("index.md", "utf8")
    .replace(/meteor_version: (.*)/, `meteor_version: ${meteorVersion}`)
    .replace(/node_version: (.*)/, `node_version: ${nodeVersion}`)
    .replace(/npm_version: (.*)/, `npm_version: ${npmVersion}`);

  fs.writeFileSync("index.md", newIndexFile);
}

main();
