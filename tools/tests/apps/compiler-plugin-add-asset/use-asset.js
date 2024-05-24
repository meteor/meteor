(async () => {
  console.log("Asset says", await Assets.getTextAsync("foo.printme"));
})();
