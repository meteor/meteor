runTests = function() {
  // hide any existing HTML but don't remove it
  $('body > *').css({display: 'none'});
  document.head.title = "Tests";
  
  MochaRunner.setReporter(practical.mocha.HtmlReporter)


  inRange = false;
  var rules = _.filter(document.styleSheets[0].cssRules, (r) => { 
    if (r.selectorText && r.selectorText.match(/scoped/)) {
      inRange = !inRange;
    };
    return inRange;
  });

  var styles = _.pluck(rules, 'cssText').join('\n');

  $('head link[rel=stylesheet]').remove();
  $('head').append('<style>' + styles + '</style>');
}

Meteor.isTest = true;
