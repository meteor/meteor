const fs = require("fs").promises;

// we want to get the strings that are between #### Breaking Changes and #### New Public API
// then we will create a map with the package name and the version for example:
//
// - `accounts-2fa@3.0.0`:

// - Some methods are now async. See below:
// - `Accounts._is2faEnabledForUser`
// - `(Meteor Method) - generate2faActivationQrCode`
// - `(Meteor Method) - enableUser2fa`
// - `(Meteor Method) - disableUser2fa`
// - `(Meteor Method) - has2faEnabled`

// will be converted to:
// {"accounts-2fa@3.0.0": ` - Some methods are now async. See below:
// - `Accounts._is2faEnabledForUser`
// - `(Meteor Method) - generate2faActivationQrCode`
// - `(Meteor Method) - enableUser2fa`
// - `(Meteor Method) - disableUser2fa`
// - `(Meteor Method) - has2faEnabled``
// }

// then we will iterate and order the packages in alphabetical order and write again to the file.

/**
 *
 * @param {string} path
 * @returns {Promise<[string, null] | ["", Error]>}
 */
async function getFile(path) {
  try {
    const data = await fs.readFile(path, "utf8");
    return [data, null];
  } catch (e) {
    console.error(e);
    return ["", new Error("could not read file")];
  }
}

async function main() {
  const [filePath] = process.argv.slice(2);
  const [code, error] = await getFile(filePath);
  if (error) throw error;

  const regex = /#### Breaking Changes([\s\S]*?)#### New Public API/gm;
  const matches = code.match(regex).join("\n").split("\n");

  let objectMap = {};
  let currentWorkingPackage = "";
  for (const line of matches) {
    if (line.startsWith("-")) {
      const packageName = line
        .replace("-", "")
        .replace("`:", "")
        .replace("`", "")
        .trim();
      objectMap[packageName] = "";
      currentWorkingPackage = packageName;
      continue;
    }
    objectMap[currentWorkingPackage] += line + "\n";
  }
  // sorting acc
  const result = Object.keys(objectMap)
    .reduce((acc, key) => {
      if (key === "") return acc;
      acc.push({ key, value: objectMap[key]});
      return acc;
    }, [])
    .sort((a, b) => a.key.localeCompare(b.key))
    .reduce((acc, { key, value }) => {
      return acc + `- \`${key}\`:\n${value}`;
    }, "")

  const newCode = code.replace(regex, `#### Breaking Changes\n\n${result}`);

  await fs.writeFile(filePath, newCode);
}

main().then(() => console.log("done"));
