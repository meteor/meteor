
UI.renderTo = function (kind, props,
                        parentNode, beforeNode, parentComp) {
  if (kind === null)
    return null;
  if (! UI.isComponent(kind))
    throw new Error("Expected Component, function, or null");
  if (kind.isInited)
    throw new Error("Expected uninited Component");
  // XXX Handle case where kind is function, be reactive
  // about it.  Reuse the same DomRange.

  var comp = kind.extend(props);
  var dom = new DomRange;
  // Insert new DomRange's start/end markers
  var nodes = dom.getNodes();
  for (var i = 0, N = nodes.length; i < N; i++)
    parentNode.insertBefore(nodes[i], beforeNode);

  comp.dom = dom;
  comp.isInited = true;

  if (comp.init)
    comp.init();

  if (comp.render) {
    var buf = makeRenderBuffer();
    comp.render(buf);
    buf.build(comp);
  }

  return comp;
};

var ESCAPED_CHARS_UNQUOTED_REGEX = /[&<>]/g;
var ESCAPED_CHARS_QUOTED_REGEX = /[&<>"]/g;

var escapeMap = {
  "<": "&lt;",
  ">": "&gt;",
  "&": "&amp;",
  '"': "&quot;"
};
var escapeOne = function(c) {
  return escapeMap[c];
};

UI.encodeSpecialEntities = function (text, isQuoted) {
  // Encode Unicode characters to HTML entities.
  //
  // This implementation just encodes the characters that otherwise
  // wouldn't parse (like `<`) and passes the rest through.  You'd
  // need to do something different if you care about HTML entities as
  // a way to embed special characters in ASCII.
  return text.replace(isQuoted ? ESCAPED_CHARS_QUOTED_REGEX :
                      ESCAPED_CHARS_UNQUOTED_REGEX, escapeOne);
};


var GT_OR_QUOTE = /[>'"]/;

makeRenderBuffer = function (options) {
  var isPreview = !! options && options.preview;

  var strs = [];
  var componentsToRender = null; // {}
  var randomString = null; // Random.id()
  var commentUid = 1;
  var elementUid = 1;
  // Problem: In the template `<span {{foo}} {{bar}}>`, how do
  // we make foo and bar insert some HTML in the stream that
  // will allow us to find the element later?  Since we don't
  // tokenize the HTML here, we can't even be sure whether
  // they are in the same tag.  We can't emit a duplicate
  // extra attribute.  We can emit different attributes,
  // but if every attr tag emits a different attribute, it
  // won't be efficient to find them.
  //
  // Solution: Emit different attributes, data-meteorui-id1
  // and data-meteorui-id2, not knowing if they are on the
  // same element or not.  Reset the number, which is
  // `curDataAttrNumber`, if we can be absolutely sure a tag
  // has ended.  To detect if a tag has definitely ended,
  // we set `greaterThanEndsTag` to true after an attr tag,
  // and set it to false if we see a quote character.  If we
  // a greater-than (`>`) between the attrs and the next quote
  // character, we know the tag has ended and we can reset
  // `curDataAttrNumber` to 1.  When we look for these
  // attributes, we look for attribute names with numbers
  // between 1 and `maxDataAttrNumber` inclusive.
  var curDataAttrNumber = 1;
  var maxDataAttrNumber = 0;
  var dataAttrs = null; // []; names of all HTML attributes used
  var greaterThanEndsTag = false;

  var attrManagersToWire = null; // {}

  var push = function (/*stringsToPush*/) {
    for (var i = 0, N = arguments.length;
         greaterThanEndsTag && i < N;
         i++) {
      // find first greater-than or quote
      var match = arguments[i].match(GT_OR_QUOTE);
      if (match) {
        if (match[0] == '>')
          curDataAttrNumber = 1;
        // if it's a quote, missed our chance to
        // reset the count.  either way, stop looking.
        greaterThanEndsTag = false;
      }
    }
    strs.push.apply(strs, arguments);
  };

  var handle = function (arg) {
    if (arg == null) {
      // nothing to do
    } else if (typeof arg === 'string') {
      // "HTML"
      push(arg);
    } else if (UI.isComponent(arg) ||
               (typeof arg) === 'function') {

      randomString = randomString || Random.id();
      var commentString = randomString + '_' + (commentUid++);
      push('<!--', commentString, '-->');
      componentsToRender = componentsToRender || {};
      componentsToRender[commentString] = arg;
    } else if (arg.attrs) {
      // `{attrs: functionOrDictionary }`
      // attrs object inserts zero or more `name="value"` items
      // into the HTML, and can reactively update them later.
      // You can have multiple attrs objects in a tag, but they
      // can't specify any of the same attributes (i.e. if `{{foo}}`
      // and `{{bar}}` in the same tag declare a same-named attribute,
      // they won't cooperate).
      var elemId = null;

      var manager = new AttributeManager(arg.attrs);

      if (manager.isReactive()) {
        var elemId = elementUid++;
        // don't call the `push` helper, go around it
        strs.push(' data-meteorui-id', curDataAttrNumber,
                  '="', elemId, '" ');
        if (curDataAttrNumber > maxDataAttrNumber) {
          if (! dataAttrs) {
            dataAttrs = [];
            attrManagersToWire = {};
          }
          dataAttrs[curDataAttrNumber-1] =
            'data-meteorui-id' + curDataAttrNumber;
          maxDataAttrNumber = curDataAttrNumber;
        }
        curDataAttrNumber++;
        greaterThanEndsTag = true;

        attrManagersToWire[elemId] = manager;
      }

      // don't call the `push` helper, go around it
      strs.push(' ', manager.getInitialHTML(), ' ');

    } else {
      throw new Error("Expected HTML string, Component, function, or attrs spec, found: " + arg);
    }
  };

  var buf = {};
  buf.write = function (/*args*/) {
    var ret;
    for (var i = 0; i < arguments.length; i++)
      ret = handle(arguments[i]);
    return ret;
  };

  buf.getHtml = function () {
    return strs.join('');
  };

  buf.build = function (component) {
    var html = buf.getHtml();

    var range = component.dom;
    // assert: range is empty.
    var start = range.getFirstNode();
    var nextNode = start.nextSibling;
    // jQuery does fancy html-to-DOM compat stuff here:
    $(start).after(html);
    // now the DOM elements are physically inside the DomRange,
    // but they haven't been added yet (so they aren't tracked
    // and UI hooks haven't been called; they are foreign
    // matter).

    var wire = function (n) {
      // returns what ended up in the place of `n`:
      // component, node, or null
      if (n.nodeType === 8) { // COMMENT
        if (componentsToRender) {
          var kind = componentsToRender[n.nodeValue];
          if (kind || kind === null) {
            var comp = UI.renderTo(
              kind, null,
              n.parentNode, n, component);
            n.parentNode.removeChild(n);
            delete componentsToRender[n.nodeValue];
            return comp; // may be null
          }
        }
      } else if (n.nodeType === 1) { // ELEMENT
        if (attrManagersToWire) {
          // detect elements with reactive attributes
          for (var i = 0; i < maxDataAttrNumber; i++) {
            var attrName = dataAttrs[i];
            var elemId = n.getAttribute(attrName);
            if (elemId) {
              var mgr = attrManagersToWire[elemId];
              if (mgr) {
                mgr.wire(n);
                // XXX bad to do this immediately for
                // some reason?  we used to delay it using
                // `onNextBuilt`
                mgr.start();
              }
              n.removeAttribute(attrName);
            }
          }
        }
      }
      return n;
    };

    // walk nodes and replace comments with Components
    var walk = function (parentNode) {
      // TODO -- this is `recurse` except it just calls `wire`
      // for the hard stuff.
    };

    // top level
    for (var n = start.nextSibling, m;
         n && n !== nextNode;
         n = m) {
      m = n.nextSibling;
      var result = wire(n);
      if (result) {
        if (result.dom)
          // XXX won't be necessary when DomRange takes
          // components in:
          result = result.dom;
        range.add(result);
        if (result.firstChild)
          walk(result);
      }
    }


    var recurse = function (parent) {
      var n = parent.firstChild;
      while (n) {
        var next = n.nextSibling;
        if (n.nodeType === 8) { // COMMENT
          if (componentsToRender) {
            var comp = componentsToRender[n.nodeValue];
            if (comp) {
              if (! comp.isInited) {
                component.add(comp);
              } else if (comp.parent !== component) {
                throw new Error("Component used in render must be a child " +
                                "(or addable as one)");
              }
              comp._attach(parent, n);
              parent.removeChild(n);
              delete componentsToRender[n.nodeValue];
            }
          }
        } else if (n.nodeType === 1) { // ELEMENT
          if (attrManagersToWire) {
            // detect elements with reactive attributes
            for (var i = 0; i < maxDataAttrNumber; i++) {
              var attrName = dataAttrs[i];
              var elemId = n.getAttribute(attrName);
              if (elemId) {
                var mgr = attrManagersToWire[elemId];
                if (mgr) {
                  mgr.wire(n, component);
                  // note: this callback will be called inside
                  // the build autorun, so its internal
                  // autorun will be stopped on rebuild
                  component._onNextBuilt((function (mgr) {
                    return function () { mgr.start(); };
                  })(mgr));
                }
                n.removeAttribute(attrName);
              }
            }
          }

          // recurse through DOM
          recurse(n);
        }
        n = next;
      }
    };

    if (componentsToRender || attrManagersToWire)
      recurse(root);

    // We should have attached all specified components, but
    // if the comments we generated somehow didn't turn into
    // comments (due to bad HTML) we won't have found them,
    // in which case we clean them up here just to be safe.
    //
    // XXXX revisit when there's "destroy" again
//    if (componentsToRender)
//      for (var k in componentsToRender)
//        componentsToRender[k].destroy();

    // aid GC
    componentsToRender = null;
    attrManagersToWire = null;
  };

  return buf;
};
