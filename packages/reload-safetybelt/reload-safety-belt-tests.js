await (async () => {
  const script = await Assets.getTextAsync("safetybelt.js");

  Tinytest.add("reload-safetybelt - safety belt is added", function (test) {
    test.isTrue(
      Object.values(WebAppInternals.additionalStaticJs).some( function (js, _pathname) {
        return js === script;
      })
    );
  });
})();
