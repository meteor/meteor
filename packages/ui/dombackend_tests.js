
var runDivSpanBTest = function (func) {
  // Common code

  var div = document.createElement("DIV");
  var span = document.createElement("SPAN");
  var b = document.createElement("B");
  div.appendChild(span);
  span.appendChild(b);

  var buf = [];

  var func1 = function (elem) { buf.push(elem.nodeName + "1"); };
  var func2 = function (elem) { buf.push(elem.nodeName + "2"); };
  var func3 = function (elem) { buf.push(elem.nodeName + "3"); };
  var func4 = function (elem) { buf.push(elem.nodeName + "4"); };

  func(div, span, b, buf, func1, func2, func3, func4);
};

var DomBackend =  UI.DomBackend;

// Essentially test that the `node` argument has been removed from the
// DOM. The caveat is that in IE8, calling `removeChild` leaves the
// removed child with a document fragment parent, which itself has no
// parent.
var isDetachedSingleNode = function (test, node) {
  if (!node.parentNode) {
    test.ok();
  } else {
    test.equal(node.parentNode.nodeName, '#document-fragment');
    test.equal(node.parentNode.childNodes.length, 1);
    test.equal(node.parentNode.parentNode, null);
  }
};

Tinytest.add("ui - DomBackend - element removal", function (test) {
  // Test that calling removeElement on a detached element calls onRemoveElement
  // on it and its descendents. For jQuery, `removeElement` runs `$(elem).remove()`,
  // so it tests detecting a jQuery removal, as well as the stronger condition
  // that clean-up still happens on the DOM tree in the detached case.
  runDivSpanBTest(function (div, span, b, buf, func1, func2, func3, func4) {
    DomBackend.onRemoveElement(div, func1);
    DomBackend.onRemoveElement(span, func2);
    DomBackend.onRemoveElement(b, func3);
    // test second callback on same element
    DomBackend.onRemoveElement(div, func4);

    DomBackend.removeElement(div); // "remove" the (parentless) DIV

    buf.sort();
    test.equal(buf, ["B3", "DIV1", "DIV4", "SPAN2"]);

    buf.length = 0;
    DomBackend.removeElement(div);
    test.equal(buf.length, 0);
  });

  // Test that `removeElement` actually removes the element
  // (and fires appropriate callbacks).
  runDivSpanBTest(function (div, span, b, buf, func1, func2, func3, func4) {
    DomBackend.onRemoveElement(div, func1);
    DomBackend.onRemoveElement(span, func2);
    DomBackend.onRemoveElement(b, func3);
    DomBackend.onRemoveElement(div, func4);

    DomBackend.removeElement(span); // remove the SPAN

    test.equal(div.childNodes.length, 0);
    isDetachedSingleNode(test, span);

    buf.sort();
    test.equal(buf, ["B3", "SPAN2"]);

    buf.length = 0;
    DomBackend.removeElement(div); // remove the DIV
    test.equal(buf, ["DIV1", "DIV4"]);
  });

});

Tinytest.add("ui - DomBackend - element removal (jQuery)", function (test) {

  // Test with `$(elem).remove()`.
  runDivSpanBTest(function (div, span, b, buf, func1, func2, func3, func4) {
    DomBackend.onRemoveElement(div, func1);
    DomBackend.onRemoveElement(span, func2);
    DomBackend.onRemoveElement(b, func3);
    DomBackend.onRemoveElement(div, func4);

    $(span).remove(); // remove the SPAN

    test.equal(div.childNodes.length, 0);
    isDetachedSingleNode(test, span);

    buf.sort();
    test.equal(buf, ["B3", "SPAN2"]);

    buf.length = 0;
    $(div).remove(); // "remove" the DIV
    test.equal(buf, ["DIV1", "DIV4"]);
  });

  // Test that `$(elem).detach()` is NOT considered a removal.
  runDivSpanBTest(function (div, span, b, buf, func1, func2, func3, func4) {
    DomBackend.onRemoveElement(div, func1);
    DomBackend.onRemoveElement(span, func2);
    DomBackend.onRemoveElement(b, func3);
    DomBackend.onRemoveElement(div, func4);

    $(span).detach(); // detach the SPAN

    test.equal(div.childNodes.length, 0);
    isDetachedSingleNode(test, span);

    test.equal(buf, []);

    buf.length = 0;
    $(div).detach(); // "detach" the DIV
    test.equal(buf, []);
  });

});
