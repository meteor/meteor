(function(){
Template.body.addContent((function() {
  var view = this;
  return [ HTML.Raw("<h1>Welcome to Meteor (one more time)!</h1>\n  "), Spacebars.include(view.lookupTemplate("hello")) ];
}));
Meteor.startup(Template.body.renderToDocument);

Template.__checkName("hello");
Template["hello"] = new Template("Template.hello", (function() {
  var view = this;
  return [ HTML.Raw("<button>Click Me</button>\n  "), HTML.P("You've pressed the button ", Blaze.View("lookup:counter", function() {
    return Spacebars.mustache(view.lookup("counter"));
  }), " times.") ];
}));

}).call(this);
