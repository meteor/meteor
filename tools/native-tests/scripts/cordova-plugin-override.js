const path = require("node:path");
const { pathToFileURL } = require("node:url");
const fs = require("fs-extra");

const PLUGIN_ID = "cordova-plugin-meteor-webapp";

async function configureLocalMeteorWebappPlugin({ appDir, pluginDir }) {
  const pluginsFile = path.join(appDir, ".meteor", "cordova-plugins");
  let content = "";

  try {
    content = await fs.readFile(pluginsFile, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  const entries = content
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((entry) => !entry.startsWith(`${PLUGIN_ID}@`));

  entries.push(`${PLUGIN_ID}@${pathToFileURL(path.resolve(pluginDir)).href}`);
  await fs.outputFile(pluginsFile, `${entries.join("\n")}\n`, "utf8");
}

module.exports = { configureLocalMeteorWebappPlugin };
