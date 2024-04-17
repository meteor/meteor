await (async () => {
  var script = await Assets.getText("safetybelt.js");

  Tinytest.add("reload-safetybelt - safety belt is added", function (test) {
    test.isTrue(
      Object.values(WebAppInternals.additionalStaticJs).some( function (js, pathname) {
        return js === script;
      })
    );
  });
})();
