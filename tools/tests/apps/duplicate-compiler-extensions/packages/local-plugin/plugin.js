Plugin.registerCompiler({
  extensions: ['myext']
}, function () {
  return { processFilesForTarget: function () {} };
});
