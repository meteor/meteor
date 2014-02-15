Tinytest.add("cookies - parse and stringify", function (test) {
  test.equal(Cookies.parse("a=b; c=d"), {a: "b", c: "d"});
  test.equal(Cookies.parse("a=b;c=d"), {a: "b", c: "d"});
  test.equal(Cookies.parse("a=b;c=d;e=12"), {a: "b", c: "d", e: "12"});
  test.equal(Cookies.parse("a=b=c;d=e=f"), {a: "b=c", d: "e=f"});

  // results depends on object key order being preserved, but it will
  // probably work in all of our test hosts
  test.equal(Cookies.stringify({a: "1"}), "a=1");
  test.equal(Cookies.stringify({a: "1", b: "2"}), "a=1;b=2");
  test.equal(Cookies.stringify({a: "a=1", b: "b=2"}), "a=a=1;b=b=2");
});
