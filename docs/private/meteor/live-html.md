<h2 id="livehtml">Live HTML</h2>

HTML templating is central to web applications. With Meteor's live
page update technology, you can render your HTML _reactively_, meaning
that it will update automatically to track changes in the data used to
generate it.

This optional feature works with any HTML templating library, or even
with HTML you generate manually from JavaScript. Here's an example:

    var fragment = Meteor.render(
      function () {
        var name = Session.get("name") || "Anonymous";
        return "<div>Hello, " + name + "</div>";
      });
    document.body.appendChild(fragment);

    Session.set("name", "Bob"); // page updates automatically!

[`Meteor.render`](#meteor_render) takes a rendering function, that is, a
function that returns some HTML as a string. It returns an auto-updating
`DocumentFragment`. When there is a change to data used by the rendering
function, it is re-run. The DOM nodes in the `DocumentFragment` then
update themselves in-place, no matter where they were inserted on the
page. It's completely automatic. [`Meteor.render`](#meteor_render) uses
a [reactive computation](#reactivity) to discover what data is used by the
rendering function.

Most of the time, though, you won't call these functions directly
&mdash; you'll just use your favorite templating package, such as
Handlebars or Jade. The `render` and `renderList` functions are intended
for people that are implementing new templating systems.

Meteor normally batches up any needed updates and executes them only
when your code isn't running. That way, you can be sure that the DOM
won't change out from underneath you. Sometimes you want the opposite
behavior. For example, if you've just inserted a record in the
database, you might want to force the DOM to update so you can find
the new elements using a library like jQuery. In that case, call
[`Deps.flush`](#deps_flush) to bring the DOM up to date
immediately.

When live-updating DOM elements are taken off the screen, they are automatically
cleaned up &mdash; their callbacks are torn down, any associated database
queries are stopped, and they stop updating. For this reason, you never have to
worry about the [zombie
templates](http://lostechies.com/derickbailey/2011/09/15/zombies-run-managing-page-transitions-in-backbone-apps/)
that plague hand-written update logic. To protect your elements from cleanup,
just make sure that they are on-screen before your code returns to the event loop,
or before any call you make to [`Deps.flush`](#deps_flush).

Another thorny problem in hand-written applications is element
preservation. Suppose the user is typing text into an `<input>`
element, and then the area of the page that includes that element is
redrawn. The user could be in for a bumpy ride, as the focus, the
cursor position, the partially entered text, and the accented
character input state will be lost when the `<input>` is recreated.

This is another problem that Meteor solves for you. You can specify
elements to preserve when templates are re-rendered with the
[`preserve`](#template_preserve) directive on the template. Meteor will
preserve these elements even when their enclosing template is
rerendered, but will still update their children and copy over any
attribute changes.
