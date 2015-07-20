module.exports = {
  context: __dirname,
  entry: "promise",
  output: {
    library: "Promise",
    libraryTarget: "this",
    path: __dirname,
    filename: "promise_client.js"
  }
};
