const fs = require("fs").promises;

// if we have more files with tla just add them here and make sure to add them
// as well to jsdoc-conf.json in the exclude section and their counterparts
// with .docs.js extension
const pathsWithTLA = [
  "packages/accounts-password/password_server.js",
  "packages/webapp/webapp_server.js",
];

/**
 *
 * @param {string} path
 * @returns {Promise<[string, Error]>}
 */
async function getFile(path) {
  try {
    const data = await fs.readFile(path, "utf8");
    return [data, null];
  } catch (e) {
    console.error(e);
    return ["", e];
  }
}

(async function () {
  for (const path of pathsWithTLA) {
    const [code, error] = await getFile(`../${path}`);
    if (error) return "ERR";
    /**
     * @type {string[]}
     */
    let file = [];
    // the complexity of this is O(n^2) but it's not a big deal since we are only
    // doing this for a few files.
    for (line of code.split("\n")) {
      // this is a hack to remove the await keyword from the top level.
      if (line.startsWith("await")) {
        line = line.replace("await", "");
      }
      file.push(line);
    }

    await fs.writeFile(
      `../${path.replace(".js", ".docs.js")}`,
      file.join("\n"),
      "utf8"
    );
  }
})();
