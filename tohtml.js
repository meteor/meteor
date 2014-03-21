
HTML.toHTML = function (node, parentComponent) {
  if (node == null) {
    // null or undefined
    return '';
  } else if ((typeof node === 'string') || (typeof node === 'boolean') || (typeof node === 'number')) {
    // string; escape special chars
    return HTML.escapeData(String(node));
  } else if (node instanceof Array) {
    // array
    var parts = [];
    for (var i = 0; i < node.length; i++)
      parts.push(HTML.toHTML(node[i], parentComponent));
    return parts.join('');
  } else if (typeof node.instantiate === 'function') {
    // component
    var instance = node.instantiate(parentComponent || null);
    var content = instance.render('STATIC');
    stopWithLater(instance);
    // recurse with a new value for parentComponent
    return HTML.toHTML(content, instance);
  } else if (typeof node === 'function') {
    return HTML.toHTML(callReactiveFunction(node), parentComponent);
  } else if (node.toHTML) {
    // Tag or something else
    return node.toHTML(parentComponent);
  } else {
    throw new Error("Expected tag, string, array, component, null, undefined, or " +
                    "object with a toHTML method; found: " + node);
  }
};

HTML.Comment.prototype.toHTML = function () {
  return '<!--' + this.sanitizedValue + '-->';
};

HTML.CharRef.prototype.toHTML = function () {
  return this.html;
};

HTML.Raw.prototype.toHTML = function () {
  return this.value;
};

HTML.Tag.prototype.toHTML = function (parentComponent) {
  var attrStrs = [];
  var attrs = this.evaluateAttributes(parentComponent);
  if (attrs) {
    for (var k in attrs) {
      var v = HTML.toText(attrs[k], HTML.TEXTMODE.ATTRIBUTE, parentComponent);
      attrStrs.push(' ' + k + '="' + v + '"');
    }
  }

  var tagName = this.tagName;
  var startTag = '<' + tagName + attrStrs.join('') + '>';

  var childStrs = [];
  var content;
  if (tagName === 'textarea') {
    for (var i = 0; i < this.children.length; i++)
      childStrs.push(HTML.toText(this.children[i], HTML.TEXTMODE.RCDATA, parentComponent));

    content = childStrs.join('');
    if (content.slice(0, 1) === '\n')
      // TEXTAREA will absorb a newline, so if we see one, add
      // another one.
      content = '\n' + content;

  } else {
    for (var i = 0; i < this.children.length; i++)
      childStrs.push(HTML.toHTML(this.children[i], parentComponent));

    content = childStrs.join('');
  }

  var result = startTag + content;

  if (this.children.length || ! HTML.isVoidElement(tagName)) {
    // "Void" elements like BR are the only ones that don't get a close
    // tag in HTML5.  They shouldn't have contents, either, so we could
    // throw an error upon seeing contents here.
    result += '</' + tagName + '>';
  }

  return result;
};

HTML.TEXTMODE = {
  ATTRIBUTE: 1,
  RCDATA: 2,
  STRING: 3
};

HTML.toText = function (node, textMode, parentComponent) {
  if (node == null) {
    // null or undefined
    return '';
  } else if ((typeof node === 'string') || (typeof node === 'boolean') || (typeof node === 'number')) {
    node = String(node);
    // string
    if (textMode === HTML.TEXTMODE.STRING) {
      return node;
    } else if (textMode === HTML.TEXTMODE.RCDATA) {
      return HTML.escapeData(node);
    } else if (textMode === HTML.TEXTMODE.ATTRIBUTE) {
      // escape `&` and `"` this time, not `&` and `<`
      return node.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    } else {
      throw new Error("Unknown TEXTMODE: " + textMode);
    }
  } else if (node instanceof Array) {
    // array
    var parts = [];
    for (var i = 0; i < node.length; i++)
      parts.push(HTML.toText(node[i], textMode, parentComponent));
    return parts.join('');
  } else if (typeof node === 'function') {
    return HTML.toText(callReactiveFunction(node), textMode, parentComponent);
  } else if (typeof node.instantiate === 'function') {
    // component
    var instance = node.instantiate(parentComponent || null);
    var content = instance.render('STATIC');
    var result = HTML.toText(content, textMode, instance);
    stopWithLater(instance);
    return result;
  } else if (node.toText) {
    // Something else
    return node.toText(textMode, parentComponent);
  } else {
    throw new Error("Expected tag, string, array, component, null, undefined, or " +
                    "object with a toText method; found: " + node);
  }

};

HTML.Raw.prototype.toText = function () {
  return this.value;
};

// used when including templates within {{#markdown}}
HTML.Tag.prototype.toText = function (textMode, parentComponent) {
  if (textMode === HTML.TEXTMODE.STRING)
    // stringify the tag as HTML, then convert to text
    return HTML.toText(this.toHTML(parentComponent), textMode);
  else
    throw new Error("Can't insert tags in attributes or TEXTAREA elements");
};

HTML.CharRef.prototype.toText = function (textMode) {
  if (textMode === HTML.TEXTMODE.STRING)
    return this.str;
  else if (textMode === HTML.TEXTMODE.RCDATA)
    return this.html;
  else if (textMode === HTML.TEXTMODE.ATTRIBUTE)
    return this.html;
  else
    throw new Error("Unknown TEXTMODE: " + textMode);
};
