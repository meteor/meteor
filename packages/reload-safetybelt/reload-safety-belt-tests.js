var script = Assets.getText("safetybelt.js");

Tinytest.add("reload-safetybelt - safety belt is added", function (test) {
  test.isTrue(Object.keys(WebAppInternals.additionalStaticJs).some(
    function (js, pathname) {
      return js === script;
    }
  ));
});
