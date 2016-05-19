Plugin.registerCompiler({
  extensions: ['printme'],
  archMatching: 'os'
}, function () {
  throw new Error("Error in my registerCompiler callback!");
});
