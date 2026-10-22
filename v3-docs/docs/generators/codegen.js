const { generateChangelog } = require("./changelog/script.js");
const { listPackages } = require("./packages-listing/script.js");
const { generateMeteorVersions } = require("./meteor-versions/script.js");
const { generateApiJson } = require("./api-export/generateApiJson.js");

async function main() {
  console.log("🚂 Started codegen 🚂");
  await generateChangelog();
  await listPackages();
  await generateMeteorVersions();
  await generateApiJson();
  console.log("🚀 Done codegen 🚀");
}

main();
