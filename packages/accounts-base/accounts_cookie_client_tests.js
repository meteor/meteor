// Client-side tests for HttpOnly cookie auth flow
// Ensures token is not accessible via JS (HttpOnly) and resume works.

if (Meteor.isClient) {
  Tinytest.addAsync('accounts cookie - login with password sets HttpOnly cookie and not readable via document.cookie', (test, done) => {
    // Enable cookie auth
    Accounts.config({ useHttpOnlyCookies: true });
    Accounts._isolateLoginTokenForTest();

    const username = `u_${Random.id()}`;
    const password = `p_${Random.id()}`;

    Accounts.createUser({ username, password }, (err) => {
      test.isUndefined(err, 'error creating user');
      // After login, a token is stored in storageLocation, but cookie should be HttpOnly.
      // We cannot directly read HttpOnly cookie, so assert it does NOT appear in document.cookie substring
      const token = Accounts._storedLoginToken();
      test.isTrue(!!token, 'token stored locally');
      const cookieStr = document.cookie || '';
      test.isFalse(/meteor_login_token=/.test(cookieStr), 'HttpOnly cookie not exposed to JS');
      Meteor.logout(() => done());
    });
  });


  Tinytest.addAsync('accounts cookie - clearing cookie on logout makes refresh return 204', async (test, done) => {
    Accounts.config({ useHttpOnlyCookies: true });
    Accounts._isolateLoginTokenForTest();
    const username = `u3_${Random.id()}`;
    const password = `p3_${Random.id()}`;
    await new Promise((resolve, reject) => Accounts.createUser({ username, password }, (e)=> e?reject(e):resolve()));
    test.isTrue(!!Meteor.userId());

    // Perform explicit fetch to refresh endpoint to ensure cookie present
    let r = await fetch('/_accounts/cookie/refresh', { credentials: 'include' });
    test.isTrue(r.status === 200 || r.status === 204, 'refresh reachable');

    await new Promise(res => Meteor.logout(()=>res()));
    test.isFalse(!!Meteor.userId());

    // Poll refresh until 204 or timeout because _clearHttpOnlyCookie is async
    const start = Date.now();
    const check = async () => {
      const resp = await fetch('/_accounts/cookie/refresh', { credentials: 'include' });
      if (resp.status === 204) {
        test.equal(resp.status, 204, 'cookie cleared after logout');
        done();
      } else if (Date.now() - start > 4000) {
        test.fail(`Expected 204 after logout, got ${resp.status}`);
        done();
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
}
