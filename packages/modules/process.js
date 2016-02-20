try {
  // The application can run `npm install process` to provide its own
  // process stub; otherwise this module will provide a partial stub.
  process = global.process || require("process");
} catch (noProcess) {
  process = {};
}

if (typeof process.env !== "object") {
  process.env = {};
}

Object.keys(meteorEnv).forEach(function (key) {
  process.env[key] = meteorEnv[key];
});
