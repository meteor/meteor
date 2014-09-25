Tinytest.add("accounts - parse urls for accounts-password",
  function (test) {
    var actions = ["reset-password", "verify-email", "enroll-account"];

    // make sure the callback was called the right number of times
    var actionsParsed = [];

    _.each(actions, function (hashPart) {
      var fakeToken = "asdf";
      
      // test backcompat with URLs that only contain the token and no email
      var hashTokenOnly = "#/" + hashPart + "/" + fakeToken;
      AccountsTest.attemptToMatchHash(hashTokenOnly,
          function (token, email, action) {
        test.equal(token, fakeToken);
        test.equal(email, null);
        test.equal(action, hashPart);

        actionsParsed.push(action);
      });

      // test new URLs with token and email
      var fakeEmail = "sashko@meteor.com";
      var hashTokenAndEmail = "#/" + hashPart + "/" + fakeToken + "/" + fakeEmail;
      AccountsTest.attemptToMatchHash(hashTokenAndEmail,
          function (token, email, action) {
        test.equal(token, fakeToken);
        test.equal(email, fakeEmail);
        test.equal(action, hashPart);

        actionsParsed.push(action);
      });
    });

    // make sure each action is called twice, in order
    test.equal(actionsParsed, _.flatten(_.zip(actions, actions)));
  });
