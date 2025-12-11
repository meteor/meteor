const { generateChangelog } = require("./changelog/script.js");
const { listPackages } = require("./packages-listing/script.js");
const { generateMeteorVersions } = require("./meteor-versions/script.js");
async function main() {
  console.log("🚂 Started codegen 🚂");
  await generateChangelog();
  await listPackages();
  await generateMeteorVersions();
  console.log("🚀 Done codegen 🚀");
}

main();
