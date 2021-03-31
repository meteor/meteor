Tinytest.add("less - imports", function (test) {
  var div = document.createElement('div');
  document.body.appendChild(div);

  try {
    var t = function (className, style) {
      div.className = className;
      test.equal(getStyleProperty(div, 'border-style'), style, className);
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
