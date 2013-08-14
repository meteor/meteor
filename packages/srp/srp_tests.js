Tinytest.add("srp - good exchange", function(test) {
  var password = 'hi there!';
  var verifier = SRP.generateVerifier(password);

  var C = new SRP.Client(password);
  var S = new SRP.Server(verifier);

  var request = C.startExchange();
  var challenge = S.issueChallenge(request);
  var response = C.respondToChallenge(challenge);
  var confirmation = S.verifyResponse(response);

  test.isTrue(confirmation);
  test.isTrue(C.verifyConfirmation(confirmation));

});

Tinytest.add("srp - bad exchange", function(test) {
  var verifier = SRP.generateVerifier('one password');

  var C = new SRP.Client('another password');
  var S = new SRP.Server(verifier);

  var request = C.startExchange();
  var challenge = S.issueChallenge(request);
  var response = C.respondToChallenge(challenge);
  var confirmation = S.verifyResponse(response);

  test.isFalse(confirmation);
});


Tinytest.add("srp - fixed values", function(test) {
  // Test exact values during the exchange. We have to be very careful
  // about changing the SRP code, because changes could render
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

  var C = new SRP.Client(password, {a: a});
  var S = new SRP.Server(verifier, {b: b});

  var request = C.startExchange();
  test.equal(request.A, "8a75aa61471a92d4c3b5d53698c910af5ef013c42799876c40612d1d5e0dc41d01f669bc022fadcd8a704030483401a1b86b8670191bd9dfb1fb506dd11c688b2f08e9946756263954db2040c1df1894af7af5f839c9215bb445268439157e65e8f100469d575d5d0458e19e8bd4dd4ea2c0b30b1b3f4f39264de4ec596e0bb7");

  var challenge = S.issueChallenge(request);
  test.equal(challenge.B, "77ab0a40ef428aa2fa2bc257c905f352c7f75fbcfdb8761393c9dc0f730bbb0270ba9f837545b410c955c3f761494b329ad23c6efdec7e63509e538c2f68a3526e072550a11dac46017718362205e0c698b5bed67d6ff475aa92c191ca169f865c81a1a577373c449b98df720c7b7ff50536f9919d781e698025fd7164932ba7");

  var response = C.respondToChallenge(challenge);
  test.equal(response.M, "8705d31bb61497279adf44eef6c167dcb7e03aa7a42102c1ea7e73025fbd4cd9");

  var confirmation = S.verifyResponse(response);
  test.equal(confirmation.HAMK, "07a0f200392fa9a084db7acc2021fbc174bfb36956b46835cc12506b68b27bba");

  test.isTrue(C.verifyConfirmation(confirmation));
});


Tinytest.add("srp - options", function(test) {
  // test that all options are respected.
  //
  // Note, all test strings here should be hex, because the 'hash'
  // function needs to output numbers.

  var baseOptions = {
    hash: function (x) { return x; },
    N: 'b',
    g: '2',
    k: '1'
  };
  var verifierOptions = _.extend({
    identity: 'a',
    salt: 'b'
  }, baseOptions);
  var clientOptions = _.extend({
    a: "2"
  }, baseOptions);
  var serverOptions = _.extend({
    b: "2"
  }, baseOptions);

  var verifier = SRP.generateVerifier('c', verifierOptions);;

  test.equal(verifier.identity, 'a');
  test.equal(verifier.salt, 'b');
  test.equal(verifier.verifier, '3');

  var C = new SRP.Client('c', clientOptions);
  var S = new SRP.Server(verifier, serverOptions);

  var request = C.startExchange();
  test.equal(request.A, '4');

  var challenge = S.issueChallenge(request);
  test.equal(challenge.identity, 'a');
  test.equal(challenge.salt, 'b');
  test.equal(challenge.B, '7');

  var response = C.respondToChallenge(challenge);
  test.equal(response.M, '471');

  var confirmation = S.verifyResponse(response);
  test.isTrue(confirmation);
  test.equal(confirmation.HAMK, '44711');

});
