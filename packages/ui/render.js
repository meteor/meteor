var Component = UIComponent;

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

_UI.encodeSpecialEntities = function (text, isQuoted) {
  // Encode Unicode characters to HTML entities.
  //
  // This implementation just encodes the characters that otherwise
  // wouldn't parse (like `<`) and passes the rest through.  You'd
  // need to do something different if you care about HTML entities as
  // a way to embed special characters in ASCII.
  return text.replace(isQuoted ? ESCAPED_CHARS_QUOTED_REGEX :
                      ESCAPED_CHARS_UNQUOTED_REGEX, escapeOne);
};

var ATTRIBUTE_NAME_REGEX = /^[^\s"'>/=/]+$/;

// takes a known-to-be non-function, asserts it is
// a string or an array, and produces a string
var stringifyAttrValue = function (v) {
  if (typeof v === 'string')
    return v;
  else if (typeof v.length === 'number')
    return Array.prototype.join.call(v, ' ');
  else
    throw new Error("Expected string or array for attr value");
};

var GT_OR_QUOTE = /[>'"]/;

makeRenderBuffer = function (component, options) {
  var isPreview = !! options && options.preview;

  var strs = [];
  var componentsToAttach = {};
  var randomString = Random.id();
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
  var dataAttrs = [];
  var greaterThanEndsTag = false;

  var elementsToWire = {};

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
    if (typeof arg === 'string') {
      // "HTML"
      push(arg);
    } else if (arg instanceof Component) {
      // Component
      var commentString = randomString + '_' + (commentUid++);
      push('<!--', commentString, '-->');
      component.add(arg);
      componentsToAttach[commentString] = arg;
    } else if (arg.type) {
      // `{type: componentTypeOrFunction, args: object}`
      if (Component.isType(arg.type)) {
        handle(arg.type.create(arg.args));
      } else if (typeof arg.type === 'function') {
        var curType;
        component.autorun(function (c) {
          // capture dependencies of this line:
          var type = arg.type();
          if (c.firstRun) {
            curType = type;
          } else if (component.stage !== Component.BUILT ||
                     ! component.hasChild(curChild)) {
            c.stop();
          } else if (type !== curType) {
            var oldChild = curChild;
            curType = type;
            // don't capture any dependencies here
            Deps.nonreactive(function () {
              curChild = curType.create(arg.args);
              component.replaceChild(oldChild, curChild);
            });
          }
        });
        var curChild = curType.create(arg.args);
        handle(curChild);
      } else {
        throw new Error("Expected 'type' to be Component or function");
      }
    } else if (arg.attrs) {
      // `{attrs: { name1: string, array, or function, ... }}`
      // attrs object inserts zero or more `name="value"` items
      // into the HTML, and can reactively update them later.
      // You can have multiple attrs objects in a tag, but they
      // can't specify any of the same attributes (i.e. the right
      // thing won't happen).
      var elemId = null;
      for (var attrName in arg.attrs) {
        if (! ATTRIBUTE_NAME_REGEX.test(attrName))
          throw new Error("Illegal HTML attribute name: " + attrName);
        // the declared property of `attrs`, which may
        // be a string or array, or a function that returns
        // one.
        var attrValue = arg.attrs[attrName];
        // the current value, which may be an array or a string.
        var initialValue;

        if (typeof attrValue === 'function') {
          // calculate the initial value without reactivity.
          // once the element exists, recalculate it with
          // an autorun.
          Deps.nonreactive(function () {
            initialValue = attrValue();
          });

          if (! elemId) {
            elemId = elementUid++;
            // don't call the `push` helper, go around it
            strs.push('data-meteorui-id', curDataAttrNumber,
                      '="', elemId, '" ');
            if (curDataAttrNumber > maxDataAttrNumber) {
              dataAttrs[curDataAttrNumber-1] =
                'data-meteorui-id' + curDataAttrNumber;
              maxDataAttrNumber = curDataAttrNumber;
            }
            curDataAttrNumber++;
            greaterThanEndsTag = true;
          }

          var info = (elementsToWire[elemId] ||
                      (elementsToWire[elemId] = {}));

          info[attrName] = {
            attrName: attrName,
            attrValueFunc: attrValue,
            initialValue: initialValue
          };

        } else {
          initialValue = attrValue;
        }

        if (initialValue != null) {
          var stringValue = stringifyAttrValue(initialValue);

          // don't call the `push` helper, go around it
          strs.push(' ', attrName, '="',
                    _UI.encodeSpecialEntities(stringValue, true),
                    '" ');
        }

        // XXX make attr update hookable
      }
    } else {
      throw new Error("Expected HTML string, Component, component spec or attrs spec");
    }
  };

  var buf = function (/*args*/) {
    for (var i = 0; i < arguments.length; i++)
      handle(arguments[i]);
  };

  buf.getHtml = function () {
    return strs.join('');
  };

  buf.wireUpDOM = function (root) {
    var start = root.firstChild;
    var end = root.lastChild;

    // walk div and replace comments with Components

    var recurse = function (parent) {
      var n = parent.firstChild;
      while (n) {
        var next = n.nextSibling;
        if (n.nodeType === 8) { // COMMENT
          var comp = componentsToAttach[n.nodeValue];
          if (comp) {
            if (parent === root) {
              if (n === root.firstChild)
                start = comp;
              if (n === root.lastChild)
                end = comp;
            }
            comp.attach(parent, n);
            parent.removeChild(n);
            delete componentsToAttach[n.nodeValue];
          }
        } else if (n.nodeType === 1) { // ELEMENT
          var elemId, callback;
          // detect elements with reactive attributes
          for (var i = 0; i < maxDataAttrNumber; i++) {
            var attrName = dataAttrs[i];
            var elemId = n.getAttribute(attrName);
            if (elemId) {
              var info = elementsToWire[elemId];
              if (info)
                info._element = n;
              n.removeAttribute(attrName);
            }
          }

          // recurse through DOM
          recurse(n);
        }
        n = next;
      }
    };

    recurse(root);

    // We should have attached all specified components, but
    // if the comments we generated somehow didn't turn into
    // comments (due to bad HTML) we won't have found them,
    // in which case we clean them up here just to be safe.
    for (var k in componentsToAttach)
      componentsToAttach[k].destroy();

    // aid GC
    componentsToAttach = null;

    // onNextBuilt callbacks run within the build
    // computation and are stopped on rebuild.
    component._onNextBuilt(function () {
      for (var k in elementsToWire) {
        var infoObj = elementsToWire[k];
        if (infoObj._element) {
          // element found during DOM traversal
          for (var attrName in infoObj) {
            // XXXX putting _element on the dictionary is not right
            if (attrName === '_element')
              continue;
            component.autorun(function (c) {
              // note: it's not safe to access `attrName`
              // and `infoObj` from this closure, except
              // during firstRun when they have their original
              // values.
              if (c.firstRun) {
                c.element = infoObj._element;
                c.info = infoObj[attrName];
                c.curValue = c.info.initialValue;
              }
              var info = c.info;
              if (component.stage !== Component.BUILT ||
                  ! component.containsElement(c.element)) {
                c.stop();
                return;
              }
              // capture dependencies of this line:
              var newValue = info.attrValueFunc();

              var oldValue = c.curValue;
              if (newValue == null) {
                if (oldValue != null)
                  c.element.removeAttribute(info.attrName);
              } else {
                var newStringValue = stringifyAttrValue(newValue);
                if (oldValue == null) {
                  c.element.setAttribute(
                    info.attrName, newStringValue);
                } else {
                  var oldStringValue =
                        stringifyAttrValue(oldValue);
                  if (newStringValue !== oldStringValue) {
                    c.element.setAttribute(
                      info.attrName, newStringValue);
                  }
                }
              }

              c.curValue = newValue;
            });
          }
        }
      }
      elementsToWire = null;
    });

    return {
      // start and end will both be null if div is empty
      start: start,
      end: end
    };

  };

  return buf;
};
