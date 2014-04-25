var testDiv = document.createElement("div");
testDiv.innerHTML = "   <link/><table></table><select><!----></select>";
// Need to wrap in a div rather than directly creating SELECT to avoid
// *another* IE bug.
var testSelectDiv = document.createElement("div");
testSelectDiv.innerHTML = "<select><option selected>Foo</option></select>";
testSelectDiv.firstChild.setAttribute("name", "myname");

// Tests that, if true, indicate browser quirks present.
var quirks = {
  // IE loses initial whitespace when setting innerHTML.
  leadingWhitespaceKilled: (testDiv.firstChild.nodeType !== 3),

  // IE may insert an empty tbody tag in a table.
  tbodyInsertion: testDiv.getElementsByTagName("tbody").length > 0,

  // IE loses some tags in some environments (requiring extra wrapper).
  tagsLost: testDiv.getElementsByTagName("link").length === 0,

  // IE <= 9 loses HTML comments in <select> and <option> tags.
  commentsLost: (! testDiv.getElementsByTagName("select")[0].firstChild),

  selectValueMustBeFromAttribute: (testSelectDiv.firstChild.value !== "Foo"),

  // In IE7, setAttribute('name', foo) doesn't show up in rendered HTML.
  // (In FF3, outerHTML is undefined, but it doesn't have this quirk.)
  mustSetNameInCreateElement: (
    testSelectDiv.firstChild.outerHTML &&
      testSelectDiv.firstChild.outerHTML.indexOf("myname") === -1)
};

DomUtils = {};

DomUtils.setElementValue = function (node, value) {
  // Try to assign the value.
  node.value = value;
  if (node.value === value || node.nodeName !== 'SELECT')
    return;

  // IE (all versions) appears to only let you assign SELECT values which
  // match valid OPTION values... and moreover, the OPTION value must be
  // explicitly given as an attribute, not just as the text. So we hunt for
  // the OPTION and select it.
  var options = $(node).find('option');
  for (var i = 0; i < options.length; ++i) {
    if (DomUtils.getElementValue(options[i]) === value) {
      options[i].selected = true;
      return;
    }
  }
};

// Gets the value of an element, portably across browsers. There's a special
// case for SELECT elements in IE.
DomUtils.getElementValue = function (node) {
  if (!quirks.selectValueMustBeFromAttribute)
    return node.value;

  if (node.nodeName === 'OPTION') {
    // Inspired by jQuery.valHooks.option.get.
    var val = node.attributes.value;
    return !val || val.specified ? node.value : node.text;
  } else if (node.nodeName === 'SELECT') {
    if (node.selectedIndex < 0)
      return null;
    return DomUtils.getElementValue(node.options[node.selectedIndex]);
  } else {
    return node.value;
  }
};
