Tinytest.add("srp - fixed values", function(test) {
  // Test exact values outputted by `generateVerifier`. We have to be very
  // careful about changing the SRP code, because changes could render
  // people's existing user database unusable. This test is
  // intentionally brittle to catch change that could affect the
  // validity of user passwords.

  var identity = "b73d9af9-4e74-4ce0-879c-484828b08436";
  var salt = "85f8b9d3-744a-487d-8982-a50e4c9f552a";
  var password = "95109251-3d8a-4777-bdec-44ffe8d86dfb";
  var a = "dc99c646fa4cb7c24314bb6f4ca2d391297acd0dacb0430a13bbf1e37dcf8071";
  var b = "cf878e00c9f2b6aa48a10f66df9706e64fef2ca399f396d65f5b0a27cb8ae237";

  var verifier = SRP.generateVerifier(
    password, {identity: identity, salt: salt});
  test.equal(verifier.identity, identity);
  test.equal(verifier.salt, salt);
  test.equal(verifier.verifier, "56778b720d20b2e306f04e47180fb94335b88a6052808483acb0e85612606f9f1d8d5a3c6b85e0c7bfec7f08c07bdfbd0d40b032f517871dd8afd045b0f24e2edc05ccdc47b19f35d2eb9f7670521a38c1b358fcee63f052a1aedbb1282d3b92c7a554f8523f3379c2fbc6885be8227fbd426ad6960c3839809f8c94d80a6c51");
});
