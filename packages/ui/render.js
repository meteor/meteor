
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

// Instantiate `comp` with `props` by calling extend, or,
// in the special case where `comp` is an already-inited
// component, just return it.  In this latter case, the
// `props` argument must be falsy.
constructify = function (comp, props) {
  if (! comp)
    throw new Error("No such component");
  if (props)
    // comp had better be uninited! (or will throw)
    return comp.extend(props);
  else if (comp.isInited)
    return comp;
  else
    return comp.extend();
};

makeRenderBuffer = function (component, options) {
  var isPreview = !! options && options.preview;

  var strs = [];
  var componentsToAttach = null; // {}
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

  var handleComponent = function (comp) {
    randomString = randomString || Random.id();
    var commentString = randomString + '_' + (commentUid++);
    push('<!--', commentString, '-->');
    componentsToAttach = componentsToAttach || {};
    componentsToAttach[commentString] = comp;
    return comp;
  };

  var handle = function (arg) {
    if (arg == null) {
      // nothing to do
    } else if (typeof arg === 'string') {
      // "HTML"
      push(arg);
    } else if (UI.isComponent(arg)) {
      // Component
      if (! arg.isInited)
        arg = arg.extend();

      return handleComponent(arg);
    } else if ((typeof arg === 'function') || arg.child) {
      // `componentFunction`, or
      // `{child: componentOrFunction, props: object}`

      // In `{child: comp}` with no `props`, it's ok
      // for `comp` to be already inited.  This lets
      // you write `{{> foo}}` to insert already-inited
      // `foo`, with cooperation from the template
      // compiler (i.e. not emitting an empty props object).

      // `curComp` holds the latest value of the `child`
      // function if `componentOrFunction` is a function,
      // or else the value itself if it is not.
      // In the case where `curComp`
      // is uninited and we instantiate a copy, `curComp`
      // is not that copy, it's the original component used
      // as a prototype.
      var curComp, props;
      if (typeof arg === 'function') {
        curComp = arg;
        props = null;
      } else {
        curComp = arg.child;
        props = arg.props;
      }

      if (typeof curComp === 'function') {
        var compFunc = curComp;
        // use `Deps.autorun`, not `component.autorun`,
        // because we *do* want to be stopped when the
        // enclosing computation is invalidated (i.e.
        // the rebuilder computation).
        Deps.autorun(function (c) {
          // capture dependencies of this line:
          var comp = compFunc();
          if (c.firstRun) {
            // right away
            curComp = comp;
          } else {
            // later (on subsequent runs)...
            if (! component.isBuilt ||
                component.isDestroyed ||
                ! component.hasChild(curChild)) {
              c.stop();
            } if (comp !== curComp) {
              var oldChild = curChild;
              var oldComp = curComp;
              curComp = comp;
              // don't capture any dependencies here
              Deps.nonreactive(function () {
                curChild = constructify(curComp, props);
                if (oldChild === oldComp)
                  // didn't create the oldChild, just
                  // used it!  So detach it, don't destroy it.
                  component.swapChild(oldChild, curChild);
                else
                  component.replaceChild(oldChild, curChild);
              });
            }
          }
        });
      } else if (! UI.isComponent(curComp)) {
        throw new Error("Expected function or Component");
      }
      // the autorun above closes down over this var:
      var curChild = constructify(curComp, props);
      // return something the caller of `buf.write` can't get
      // any other way if `arg` involved a componentFunction:
      // the actual component created.  If the arg we are
      // handling is the last arg to `buf.write`, it will return
      // this value.
      return handleComponent(curChild);
    } else if (arg.attrs) {
      // `{attrs: functionOrDictionary }`
      // attrs object inserts zero or more `name="value"` items
      // into the HTML, and can reactively update them later.
      // You can have multiple attrs objects in a tag, but they
      // can't specify any of the same attributes (i.e. if `{{foo}}`
      // and `{{bar}}` in the same tag declare a same-named attribute,
      // they won't cooperate).
      var elemId = null;

      var manager = new AttributeManager(component, arg.attrs);

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
      throw new Error("Expected HTML string, Component, component spec or attrs spec, found: " + arg);
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

  buf.wireUpDOM = function (root) {
    // walk div and replace comments with Components

    var recurse = function (parent) {
      var n = parent.firstChild;
      while (n) {
        var next = n.nextSibling;
        if (n.nodeType === 8) { // COMMENT
          if (componentsToAttach) {
            var comp = componentsToAttach[n.nodeValue];
            if (comp) {
              if (! comp.isInited) {
                component.add(comp);
              } else if (comp.parent !== component) {
                throw new Error("Component used in render must be a child " +
                                "(or addable as one)");
              }
              comp._attach(parent, n);
              parent.removeChild(n);
              delete componentsToAttach[n.nodeValue];
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

    if (componentsToAttach || attrManagersToWire)
      recurse(root);

    // We should have attached all specified components, but
    // if the comments we generated somehow didn't turn into
    // comments (due to bad HTML) we won't have found them,
    // in which case we clean them up here just to be safe.
    if (componentsToAttach)
      for (var k in componentsToAttach)
        componentsToAttach[k].destroy();

    // aid GC
    componentsToAttach = null;
    attrManagersToWire = null;
  };

  return buf;
};
