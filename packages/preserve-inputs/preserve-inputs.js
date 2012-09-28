(function () {

PreserveInputs = {};

var inputTags = 'input textarea button select option'.split(' ');

PreserveInputs.selector = _.map(inputTags, function (t) {
  return t.replace(/^.*$/, '$&[id], $&[name]');
}).join(', ');

PreserveInputs.idNameLabeler = function(n) {
  var label = null;

  if (n.nodeType === 1 /*ELEMENT_NODE*/) {
    if (n.id) {
      label = '#' + n.id;
    } else if (n.getAttribute("name")) {
      label = n.getAttribute("name");
      // Radio button special case:  radio buttons
      // in a group all have the same name.  Their value
      // determines their identity.
      // Checkboxes with the same name and different
      // values are also sometimes used in apps, so
      // we treat them similarly.
      if (n.nodeName === 'INPUT' &&
          (n.type === 'radio' || n.type === 'checkbox') &&
          n.value)
        label = label + ':' + n.value;

      // include parent names and IDs up to enclosing ID
      // in the label
      while (n.parentNode &&
             n.parentNode.nodeType === 1 /*ELEMENT_NODE*/) {
        n = n.parentNode;
        if (n.id) {
          label = '#' + n.id + "/" + label;
          break;
        } else if (n.getAttribute('name')) {
          label = n.getAttribute('name') + "/" + label;
        }
      }
    }
  }

  return label;
};

Spark._globalPreserves[PreserveInputs.selector] =
    PreserveInputs.idNameLabeler;

})();
