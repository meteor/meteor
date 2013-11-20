Tinytest.add("cookies - browser set/get", function (test) {
  var name = Random.id();

  test.equal(Cookies.get(name), null);
  Cookies.set(name, "hello");
  test.equal(Cookies.get(name), "hello");
  Cookies.set(name, "hello again");
  test.equal(Cookies.get(name), "hello again");
  Cookies.set(name, "stuff", { maxAge: 0 });
  test.equal(Cookies.get(name), null);
  Cookies.set(name, "kitten", { path: "/somewhere-else" });
  test.equal(Cookies.get(name), null);
  Cookies.set(name, "kitten", { path: "/somewhere-else", maxAge: 0 });
});
