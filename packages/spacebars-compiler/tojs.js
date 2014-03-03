
// Turns any JSONable value into a JavaScript literal.
toJSLiteral = function (obj) {
  // See <http://timelessrepo.com/json-isnt-a-javascript-subset> for `\u2028\u2029`.
  // Also escape Unicode surrogates.
  return (JSON.stringify(obj)
          .replace(/[\u2028\u2029\ud800-\udfff]/g, function (c) {
            return '\\u' + ('000' + c.charCodeAt(0).toString(16)).slice(-4);
          }));
};



var jsReservedWordSet = (function (set) {
  _.each("abstract else instanceof super boolean enum int switch break export interface synchronized byte extends let this case false long throw catch final native throws char finally new transient class float null true const for package try continue function private typeof debugger goto protected var default if public void delete implements return volatile do import short while double in static with".split(' '), function (w) {
    set[w] = 1;
  });
  return set;
})({});

toObjectLiteralKey = function (k) {
  if (/^[a-zA-Z$_][a-zA-Z$0-9_]*$/.test(k) && jsReservedWordSet[k] !== 1)
    return k;
  return toJSLiteral(k);
};

// This method is generic, i.e. it can be transplanted to non-Tags
// and it will still work by accessing `this.tagName`, `this.attrs`,
// and `this.children`.  It's ok if `this.attrs` has content that
// isn't allowed in an attribute (this feature is used by
// HTMLTools.Special.prototype.toJS).
HTML.Tag.prototype.toJS = function (options) {
  var argStrs = [];
  if (this.attrs) {
    var kvStrs = [];
    for (var k in this.attrs) {
      if (! HTML.isNully(this.attrs[k]))
        kvStrs.push(toObjectLiteralKey(k) + ': ' +
                    HTML.toJS(this.attrs[k], options));
    }
    if (kvStrs.length)
      argStrs.push('{' + kvStrs.join(', ') + '}');
  }

  for (var i = 0; i < this.children.length; i++) {
    argStrs.push(HTML.toJS(this.children[i], options));
  }

  var tagName = this.tagName;
  var tagSymbol;
  if (! (this instanceof HTML.Tag))
    // a CharRef or Comment, say
    tagSymbol = (tagName.indexOf('.') >= 0 ? tagName : 'HTML.' + tagName);
  else if (! HTML.isTagEnsured(tagName))
    tagSymbol = 'HTML.getTag(' + toJSLiteral(tagName) + ')';
  else
    tagSymbol = 'HTML.' + HTML.getSymbolName(tagName);

  return tagSymbol + '(' + argStrs.join(', ') + ')';
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

HTML.toJS = function (node, options) {
  if (node == null) {
    // null or undefined
    return 'null';
  } else if ((typeof node === 'string') || (typeof node === 'boolean') || (typeof node === 'number')) {
    // string (or something that will be rendered as a string)
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
  } else {
    throw new Error("Expected tag, string, array, null, undefined, or " +
                    "object with a toJS method; found: " + node);
  }
};
