Tinytest.add("livedocument - assembly", function(test) {

  var doTest = function(calc) {
    var frag = Meteor.ui._doc.materialize(
      calc(function(str, expected) {
        return Meteor.ui._doc.annotate(str);
      }));
    var groups = [];
    var html = calc(function(str, expected, noRange) {
      if (arguments.length > 1)
        str = expected;
      if (! noRange)
        groups.push(str);
      return str;
    });
    test.equal(WrappedFrag(frag).html(), html);

    var actualGroups = [];
    var tempRange = new Meteor.ui._LiveRange(Meteor.ui._TAG, frag);
    tempRange.visit(function(isStart, rng) {
      if (! isStart)
        actualGroups.push(Meteor.ui._rangeToHtml(rng));
    });
    test.equal(actualGroups.join(','), groups.join(','));
  };

  doTest(function(A) { return "<p>Hello</p>"; });
  doTest(function(A) { return "<td>Hello</td><td>World</td>"; });
  doTest(function(A) { return "<td>"+A("Hello")+"</td>"; });
  doTest(function(A) { return A("<td>"+A("Hello")+"</td>"); });
  doTest(function(A) { return A(A(A(A(A(A("foo")))))); });
  doTest(
    function(A) { return "<div>Yo"+A("<p>Hello "+A(A("World")),"<p>Hello World</p>")+
                  "</div>"; });
  doTest(function(A) {
    return A("<ul>"+A("<li>one","<li>one</li>")+
             A("<li>two","<li>two</li>")+
             A("<li>three","<li>three</li>"),
             "<ul><li>one</li><li>two</li><li>three</li></ul>"); });

  doTest(function(A) {
    return A("<table>"+A("<tr>"+A("<td>"+A("Hi")+"</td>")+"</tr>")+"</table>",
             "<table><tbody><tr><td>Hi</td></tr></tbody></table>");
  });

  test.throws(function() {
    doTest(function(A) {
      var z = A("Hello");
      return z+z;
    });
  });

  doTest(function(A) {
    return '<div foo="'+A('bar', 'bar', true)+'">Hello</div>';
  });
});