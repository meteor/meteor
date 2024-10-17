// run as node scripts/admin/bump-all-version-numbers.js <packageNames>

const fs = require("fs");

const packageNames = process.argv.slice(2);

packageNames.forEach(name => {
  // name = "packages/" + name + "/package.js";

  const content = fs.readFileSync(name, {encoding: "utf-8"});

  const match = content.match(/\d+\.\d+\.\d+-winr.\d+/);
  if (match) {
    const versionNumber = match[0];
    const s = versionNumber.split(".");
    s[3] = (parseInt(s[3], 10) + 1).toString();
    const incremented = s.join(".");

    content = content.replace(versionNumber, incremented);
    console.log(match[0], match[1], incremented);
    fs.writeFileSync(name, content);
  }
});
