Tinytest.add('modules', function (test) {
  test.equal(typeof meteorInstall, "function");
  var require = meteorInstall();
  test.equal(typeof require, "function");
});
