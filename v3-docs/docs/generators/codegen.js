const { generateChangelog } = require("./changelog/script.js");
const { listPackages } = require("./packages-listing/script.js");

async function main() {
  console.log("🚂 Started codegen 🚂");
  await generateChangelog();
  await listPackages();
  console.log("🚀 Done codegen 🚀");
}

main();
