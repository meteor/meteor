Plugin.registerSourceHandler("awesome", function (compileStep) {
  throw Error("crash in plugin");
});
