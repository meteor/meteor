// Regression tests for issue #12418.
//
// Login popups must not share a window name. `window.open` re-targets an
// existing window whose name matches, so a constant name breaks OAuth flows
// where the login service is itself a Meteor app opening its own login popup.

Tinytest.add('oauth - each login popup gets a unique window name', test => {
  const names = [];
  const popups = [];
  const originalOpen = window.open;

  window.open = (url, name) => {
    names.push(name);
    const popup = { closed: false, focus() {} };
    popups.push(popup);
    return popup;
  };

  try {
    OAuth.showPopup('about:blank', () => {});
    OAuth.showPopup('about:blank', () => {});
  } finally {
    window.open = originalOpen;
    // Let showPopup's `popup.closed` polling finish so it clears its interval.
    popups.forEach(popup => { popup.closed = true; });
  }

  test.equal(names.length, 2);

  names.forEach(name => {
    test.isTrue(
      typeof name === 'string' && name.length > 0,
      'popup must be opened with a window name'
    );
    // A constant name is what broke nested flows; reserved targets would let
    // the popup replace the app's own window.
    test.notEqual(name, 'Login');
    test.notEqual(name, '_blank');
    test.notEqual(name, '_self');
    test.notEqual(name, '_parent');
    test.notEqual(name, '_top');
  });

  test.notEqual(
    names[0],
    names[1],
    'two login popups must not share a window name, otherwise the second ' +
      'window.open re-targets the first popup instead of opening a new one'
  );
});
