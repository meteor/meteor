Meteor._isCssLoaded = function () {
  return _.find(document.styleSheets, function (sheet) {
    return _.find(sheet.cssRules, function (rule) {
      return rule.selectorText === '._meteor_detect_css';
    });
  });
};
