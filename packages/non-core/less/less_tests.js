Tinytest.add("less - imports", function (test) {
  var div = document.createElement('div');
  document.body.appendChild(div);

  try {
    var t = function (className, style) {
      div.className = className;

      // Computed styles don't fills the main border-style which was used,
      // but instead computes the style for each side and fills those.
      test.equal(getStyleProperty(div, 'border-top-style'), style, className);
      test.equal(getStyleProperty(div, 'border-bottom-style'), style, className);
      test.equal(getStyleProperty(div, 'border-right-style'), style, className);
      test.equal(getStyleProperty(div, 'border-left-style'), style, className);
    };
    t('el1', 'dotted');
    t('el2', 'dashed');
    t('el3', 'solid');
    t('el4', 'double');
    t('el5', 'groove');
    t('el6', 'inset');

    // This is assigned to 'ridge' in not-included.less, which is ... not
    // included. So that's why it should be 'none'.  (This tests that we don't
    // process non-main files.)
    t('el0', 'none');
  } finally {
    document.body.removeChild(div);
  }
});
