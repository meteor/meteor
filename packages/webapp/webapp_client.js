export const WebApp = {
  _isCssLoaded() {
    if (document.styleSheets.length === 0) {
      return true;
    }

    return _.find(document.styleSheets, sheet => {
      if (sheet.cssText && ! sheet.cssRules) { // IE8
        return ! sheet.cssText.match(/meteor-css-not-found-error/);
      }

      return ! _.find(
        sheet.cssRules,
        rule => rule.selectorText === '.meteor-css-not-found-error'
      );
    });
  }
};
