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

makeRenderBuffer = function (component, options) {
  var isPreview = !! options && options.preview;

  var strs = [];
  var componentsToAttach = {};
  var randomString = Random.id();
  var commentUid = 1;

  var handle = function (arg) {
    if (typeof arg === 'string') {
      // "HTML"
      strs.push(arg);
    } else if (arg instanceof Component) {
      // Component
      var commentString = randomString + '_' + (commentUid++);
      strs.push('<!--', commentString, '-->');
      component.add(arg);
      componentsToAttach[commentString] = arg;
    } else if (arg.type) {
      // `{type: componentTypeOrFunction, args: object}`
      if (Component.isType(arg.type)) {
        handle(arg.type.create(arg.args));
      } else if (typeof arg.type === 'function') {
        var curType;
        component.autorun(function (c) {
          // capture dependencies on this line:
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
      // attrs object inserts zero or more `name="value"` items
      // into the HTML, and can reactively update them later.
      // You can have multiple attrs objects in a tag, but they
      // can't specify any of the same attributes (i.e. the right
      // thing won't happen).
      for (var attrName in arg.attrs) {
        if (! ATTRIBUTE_NAME_REGEX.test(attrName))
          throw new Error("Illegal HTML attribute name: " + attrName);
        // XXX push initial HTML into strs
        // XXX set up an autorun
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

  buf.componentsToAttach = componentsToAttach;

  return buf;
};
