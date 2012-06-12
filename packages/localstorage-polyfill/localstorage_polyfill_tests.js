Tinytest.add("localStorage polyfill", function (test) {
  // Doesn't actually test preservation across reloads since that is hard.
  // userData should do that for us so it's unlikely this wouldn't work.
  localStorage.setItem("key", "value");
  test.equal(localStorage.getItem("key"), "value");
  localStorage.removeItem("key");
  test.equal(localStorage.getItem("key"), null);
});

