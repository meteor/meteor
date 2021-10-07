// Regression test for web.browser.legacy - see https://github.com/meteor/meteor/issues/11662
Tinytest.add('ecmascript - runtime - NodeList spread', test => {
  const div = document.createElement('div');
  document.body.appendChild(div);

  for (let i = 0; i < 5; i++) {
    const child = document.createElement('div');
    child.innerText = `child ${i}`;
    div.appendChild(child);
  }

  try {
    test.equal(div.childNodes?.length, 5);
    const arr = [...div.childNodes];

    arr.forEach((el, i) => {
      test.equal(el.innerText, `child ${i}`);
    });
  } finally {
    document.body.removeChild(div);
  }
});
