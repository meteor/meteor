const _fs = require("fs");
const fs = _fs.promises;

const getDocsUrl = (version = "") =>
  `https://release-${version}.docs.meteor.com/`;

exports.generateMeteorVersions = async () => {
  console.log("Reading meteor versions...");
  const files = await fs.readdir("./generators/changelog/versions", "utf8");

  const versions = files
    .filter((f) => f.startsWith("3."))
    .map((f) => f.replace(".md", ""))
    .filter((v) => v !== "3.0.1") // there is no 3.0.1 version
    .map((v) => (v === "3.0.0" ? v.slice(0, -2) : v)) // 3.0 doesn't have a patch version in the URL
    .map((version) => {
      return {
        version: `v${version}`,
        url: getDocsUrl(`${version}`.replaceAll(".", "-")),
      };
    })
    .map((v, index, arr) => {
      const isLast = index === arr.length - 1;
      if (isLast) {
        v.isCurrent = true;
      }
      return v;
    });
  const { version: currentVersion } = versions.find((v) => v.isCurrent);

  console.log("Writing meteor versions...");
  await fs.writeFile(
    "./generators/meteor-versions/metadata.generated.js",
    `export default ${JSON.stringify(
      {
        versions,
        currentVersion,
      },
      null,
      2
    )}`
  );
  console.log("Meteor versions generated!");
};
