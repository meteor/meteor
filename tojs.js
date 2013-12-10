var HTML = HTML2;

// This method is generic, i.e. it can be transplanted to non-Tags
// and it will still work by accessing `this.tagName`, `this.attrs`,
// and `this.children`.
HTML.Tag.prototype.toJS = function (options) {
  var argStrs = [];
  if (this.attrs) {
    var kvStrs = [];
    for (var k in this.attrs) {
      kvStrs.push(toJSLiteral(k) + ': ' + HTML.toJS(this.attrs[k], options));
    }
    argStrs.push('{' + kvStrs.join(', ') + '}');
  }

  for (var i = 0; i < this.children.length; i++) {
    argStrs.push(HTML.toJS(this.children[i], options));
  }

  return 'HTML.' + this.tagName + '(' + argStrs.join(', ') + ')';
};

HTML.CharRef.prototype.toJS = function (options) {
  return HTML.Tag.prototype.toJS.call({tagName: "CharRef",
                                       attrs: {html: this.html,
                                               str: this.str},
                                       children: []},
                                      options);
};

HTML.Comment.prototype.toJS = function (options) {
  return HTML.Tag.prototype.toJS.call({tagName: "Comment",
                                       attrs: null,
                                       children: [this.value]},
                                      options);
};

HTML.Raw.prototype.toJS = function (options) {
  return HTML.Tag.prototype.toJS.call({tagName: "Raw",
                                       attrs: null,
                                       children: [this.value]},
                                      options);
};

HTML.EmitCode.prototype.toJS = function (options) {
  return this.value;
};

// Turns any JSONable value into a JavaScript literal.
var toJSLiteral = function (obj) {
  // See <http://timelessrepo.com/json-isnt-a-javascript-subset> for `\u2028\u2029`.
  // Also escape Unicode surrogates.
  return (JSON.stringify(obj)
          .replace(/[\u2028\u2029\ud800-\udfff]/g, function (c) {
            return '\\u' + ('000' + c.charCodeAt(0).toString(16)).slice(-4);
          }));
};

HTML.toJS = function (node, options) {
  if (node == null) {
    // null or undefined
    return 'null';
  } else if (typeof node === 'string') {
    // string
    return toJSLiteral(node);
  } else if (node instanceof Array) {
    // array
    var parts = [];
    for (var i = 0; i < node.length; i++)
      parts.push(HTML.toJS(node[i], options));
    return '[' + parts.join(', ') + ']';
  } else if (node.toJS) {
    // Tag or something else
    return node.toJS(options);
  } else if ((options && options.allowAllPrimitives) &&
             (typeof node === 'boolean' || typeof node === 'number')) {
    return toJSLiteral(node);
  } else {
    throw new Error("Expected tag, string, array, null, undefined, or " +
                    "object with a toJS method; found: " + node);
  }
};
