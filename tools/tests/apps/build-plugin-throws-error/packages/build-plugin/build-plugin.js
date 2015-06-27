Plugin.registerSourceHandler("extension", function () {
  throw new Error("Error inside a source handler!");
});