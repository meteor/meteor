
// Stringifier based on css-stringify
var emit = function (str) {
  return str.toString();
};

var visit = function (node, last) {
  return traverse[node.type](node, last);
};

var mapVisit = function (nodes) {
  var buf = "";

  for (var i = 0, length = nodes.length; i < length; i++) {
    buf += visit(nodes[i], i === length - 1);
  }

  return buf;
};

MinifyAst = function(node) {
  return node.stylesheet
    .rules.map(function (rule) { return visit(rule); })
    .join('');
};

var traverse = {};

traverse.comment = function(node) {
  return emit('', node.position);
};

traverse.import = function(node) {
  return emit('@import ' + node.import + ';', node.position);
};

traverse.media = function(node) {
  return emit('@media ' + node.media, node.position, true)
    + emit('{')
    + mapVisit(node.rules)
    + emit('}');
};

traverse.document = function(node) {
  var doc = '@' + (node.vendor || '') + 'document ' + node.document;

  return emit(doc, node.position, true)
    + emit('{')
    + mapVisit(node.rules)
    + emit('}');
};

traverse.charset = function(node) {
  return emit('@charset ' + node.charset + ';', node.position);
};

traverse.namespace = function(node) {
  return emit('@namespace ' + node.namespace + ';', node.position);
};

traverse.supports = function(node){
  return emit('@supports ' + node.supports, node.position, true)
    + emit('{')
    + mapVisit(node.rules)
    + emit('}');
};

traverse.keyframes = function(node) {
  return emit('@'
    + (node.vendor || '')
    + 'keyframes '
    + node.name, node.position, true)
    + emit('{')
    + mapVisit(node.keyframes)
    + emit('}');
};

traverse.keyframe = function(node) {
  var decls = node.declarations;

  return emit(node.values.join(','), node.position, true)
    + emit('{')
    + mapVisit(decls)
    + emit('}');
};

traverse.page = function(node) {
  var sel = node.selectors.length
    ? node.selectors.join(', ')
    : '';

  return emit('@page ' + sel, node.position, true)
    + emit('{')
    + mapVisit(node.declarations)
    + emit('}');
};

traverse.rule = function(node) {
  var decls = node.declarations;
  if (!decls.length) return '';

  var selectors = node.selectors.map(function (selector) {
    // removes universal selectors like *.class => .class
    // removes optional whitespace around '>' and '+'
    return selector.replace(/\*\./, '.')
                   .replace(/\s*>\s*/g, '>')
                   .replace(/\s*\+\s*/g, '+');
  });
  return emit(selectors.join(','), node.position, true)
    + emit('{')
    + mapVisit(decls)
    + emit('}');
};

traverse.declaration = function(node, last) {
  var value = node.value;

  // remove optional quotes around font name
  if (node.property === 'font') {
    value = value.replace(/\'[^\']+\'/g, function (m) {
      if (m.indexOf(' ') !== -1)
        return m;
      return m.replace(/\'/g, '');
    });
    value = value.replace(/\"[^\"]+\"/g, function (m) {
      if (m.indexOf(' ') !== -1)
        return m;
      return m.replace(/\"/g, '');
    });
  }
  // remove url quotes if possible
  // in case it is the last declaration, we can omit the semicolon
  return emit(node.property + ':' + value, node.position)
         + (last ? '' : emit(';'));
};


