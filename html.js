/***
 * A convenient way to create DOM elements. ('cls' will be
 * automatically expanded to 'class', since 'class' may not appear as
 * a key of an object, even in quotes, in Safari.)
 *
 * DIV({cls: "mydiv", style: "color: blue;"}, [
 *   "Some text",
 *   A({href: "/some/location"}, ["A link"]),
 *   DIV({cls: "emptydiv"}),
 *   // if an object is inserted, the value of its 'element'
 *   // attribute will be used
 *   myView,
 *   DIV([
 *     "Both the attributes and the contents are optional",
 *     ["Lists", "are", "flattened"]
 *   })
 * ]);
 */

// XXX find a place to document the contract for *View classes -- they
// should have an attribute named 'element'

// XXX consider not requiring the contents to be wrapped in an
// array. eg: DIV({stuff: 12}, "thing1", "thing2"). backwards
// compatible with current behavior due to array flattening. could
// eliminate spurious wrapper div inserted by Layout.TwoColumnsFixedRight

// XXX allow style to be set as an object

(function () {
  var event_names = {
    blur: true,
    change: true,
    click: true,
    dblclick: true,
    error: true,
    focus: true,
    focusin: true,
    focusout: true,
    keydown: true,
    keypress: true,
    keyup: true,
    load: true,
    mousedown: true,
    mouseenter: true,
    mouseleave: true,
    mousemove: true,
    mouseout: true,
    mouseover: true,
    mouseup: true,
    resize: true,
    scroll: true,
    select: true,
    submit: true
  };

  var testDiv = document.createElement("div");
  testDiv.innerHTML = '<a style="top:1px">a</a>';
  var styleGetSetSupport = /top/.test(testDiv.firstChild.getAttribute("style"));

  // All HTML4 elements, excluding deprecated elements
  // http://www.w3.org/TR/html4/index/elements.html
  // also excluding the following elements that seem unlikely to be
  // used in the body:
  // HEAD, HTML, LINK, MAP, META, NOFRAMES, NOSCRIPT, STYLE, TITLE
  var tag_names =
    ('A ABBR ACRONYM B BDO BIG BLOCKQUOTE BR BUTTON CAPTION CITE CODE COL ' +
     'COLGROUP DD DEL DFN DIV DL DT EM FIELDSET FORM H1 H2 H3 H4 H5 H6 HR ' +
     'I IFRAME IMG INPUT INS KBD LABEL LEGEND LI OBJECT OL OPTGROUP OPTION ' +
     'P PARAM PRE Q S SAMP SCRIPT SELECT SMALL SPAN STRIKE STRONG SUB SUP ' +
     'TABLE TBODY TD TEXTAREA TFOOT TH THEAD TR TT U UL VAR').split(' ');

  for (var i = 0; i < tag_names.length; i++) {
    var tag = tag_names[i];

    // 'this' will end up being the global object (eg, 'window' on the client)
    this[tag] = (function (tag) {
      return function (arg1, arg2) {
        var attrs, contents;
        if (arg2) {
          attrs = arg1;
          contents = arg2;
        } else {
          if (arg1 instanceof Array) {
            attrs = {};
            contents = arg1;
          } else {
            attrs = arg1;
            contents = [];
          }
        }
        var elt = document.createElement(tag);
        for (var a in attrs) {
          if (a === 'cls')
            elt.setAttribute('class', attrs[a]);
          else if (a === '_for')
            elt.setAttribute('for', attrs[a]);
          else if (a === 'style' && ! styleGetSetSupport)
            elt.style.cssText = String(attrs[a]);
          else if (event_names[a]) {
            if (typeof $ === "undefined")
              throw new Error("Event binding is supported only if " +
                              "jQuery or similar is available");
            ($(elt)[a])(attrs[a]);
          }
          else
            elt.setAttribute(a, attrs[a]);
        }
        var addChildren = function (children) {
          for (var i = 0; i < children.length; i++) {
            var c = children[i];
            if (!c && c !== '')
              throw new Error("Bad value for element body: " + c);
            else if (c instanceof Array)
              addChildren(c);
            else if (typeof c === "string")
              elt.appendChild(document.createTextNode(c));
            else if ('element' in c)
              addChildren([c.element]);
            else
              elt.appendChild(c);
          };
        };
        addChildren(contents);
        return elt;
      };
    })(tag);
  };
})();
