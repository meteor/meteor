Plugin.registerSourceHandler('txt', function (compileStep) {
  compileStep.addAsset({
    path: compileStep.inputPath,
    data: compileStep.read()
  });
});
