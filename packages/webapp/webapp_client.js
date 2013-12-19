WebApp = {

  _isCssLoaded: function () {
    return _.find(document.styleSheets, function (sheet) {
      if (sheet.cssText && !sheet.cssRules) // IE8
        return sheet.cssText.match(/_meteor_detect_css/);
      return _.find(sheet.cssRules, function (rule) {
        return rule.selectorText === '._meteor_detect_css';
      });
    });
  }
};
