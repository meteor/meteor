const Anser = require("anser");
const fs = require("fs");
const path = require("path");

function readFile(name) {
  return fs.readFileSync(path.join(__dirname, name), "utf8");
}

// Taken from packages/blaze/preamble.js.
function escapeEntities(string) {
  const escapeMap = {
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
    "`": "&#x60;",
    "&": "&amp;"
  };

  const escapeChar = (char) => {
    return escapeMap[char];
  };

  return string.replace(/[<>"'`&]/g, escapeChar);
}

module.exports = function buildErrorPage(log) {
  const htmlLog = Anser.ansiToHtml(
    escapeEntities(log.map((item) => item.message).join("\n"))
  );

  return readFile("template.html")
    .replace("{{log}}", htmlLog)
    .replace("{{script}}", readFile("event-handler.js"));
};
