(function () {

var inputTags = 'input textarea button select option'.split(' ');

var selector = _.map(inputTags, function (t) {
  return t.replace(/^.*$/, '$&[id], $&[name]');
}).join(', ');


Spark._globalPreserves[selector] = Spark._labelFromIdOrName;

})();
