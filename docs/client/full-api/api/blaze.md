{{#template name="apiBlaze"}}

<h2 id="blaze"><span>Blaze</span></h2>

Blaze is the package that makes reactive templates possible.
You can use the Blaze API directly in order to render templates programmatically
and manipulate "Views," the building blocks of reactive templates. For more
information, check out the [Blaze project page](https://www.meteor.com/blaze).

{{> autoApiBox "Blaze.render"}}

When you render a template, the callbacks added with
[`onCreated`](#template_onCreated) are invoked immediately, before evaluating
the content of the template.  The callbacks added with
[`onRendered`](#template_onRendered) are invoked after the View is rendered and
inserted into the DOM.

The rendered template
will update reactively in response to data changes until the View is
removed using [`Blaze.remove`](#blaze_remove) or the View's
parent element is removed by Meteor or jQuery.

{{#warning}}
If the View is removed by some other mechanism
besides Meteor or jQuery (which Meteor integrates with by default),
the View may continue to update indefinitely.  Most users will not need to
manually render templates and insert them into the DOM, but if you do,
be mindful to always call [`Blaze.remove`](#blaze_remove) when the View is
no longer needed.
{{/warning}}

{{> autoApiBox "Blaze.renderWithData"}}

`Blaze.renderWithData(Template.myTemplate, data)` is essentially the same as
`Blaze.render(Blaze.With(data, function () { return Template.myTemplate; }))`.

{{> autoApiBox "Blaze.remove"}}

Use `Blaze.remove` to remove a template or View previously inserted with
`Blaze.render`, in such a way that any behaviors attached to the DOM by
Meteor are cleaned up.  The rendered template or View is now considered
["destroyed"](#template_onDestroyed), along with all nested templates and
Views.  In addition, any data assigned via
jQuery to the DOM nodes is removed, as if the nodes were passed to
jQuery's `$(...).remove()`.

As mentioned in [`Blaze.render`](#blaze_render), it is important to "remove"
all content rendered via `Blaze.render` using `Blaze.remove`, unless the
parent node of `renderedView` is removed by a Meteor reactive
update or with jQuery.

`Blaze.remove` can be used even if the DOM nodes in question have already
been removed from the document, to tell Blaze to stop tracking and
updating these nodes.

{{> autoApiBox "Blaze.getData"}}

{{> autoApiBox "Blaze.toHTML"}}

Rendering a template to HTML loses all fine-grained reactivity.  The
normal way to render a template is to either include it from another
template (`{{dstache}}> myTemplate}}`) or render and insert it
programmatically using `Blaze.render`.  Only occasionally
is generating HTML useful.

Because `Blaze.toHTML` returns a string, it is not able to update the DOM
in response to reactive data changes.  Instead, any reactive data
changes will invalidate the current Computation if there is one
(for example, an autorun that is the caller of `Blaze.toHTML`).

{{> autoApiBox "Blaze.toHTMLWithData"}}

{{> autoApiBox "Blaze.View"}}

Behind every template or part of a template &mdash; a template tag, say, like `{{dstache}}foo}}` or `{{dstache}}#if}}` &mdash; is
a View object, which is a reactively updating region of DOM.

Most applications do not need to be aware of these Views, but they offer a
way to understand and customize Meteor's rendering behavior for more
advanced applications and packages.

You can obtain a View object by calling [`Blaze.render`](#blaze_render) on a
template, or by accessing [`template.view`](#template_view) on a template
instance.

At the heart of a View is an [autorun](#tracker_autorun) that calls the View's
`renderFunction`, uses the result to create DOM nodes, and replaces the
contents of the View with these new DOM nodes.  A View's content may consist
of any number of consecutive DOM nodes (though if it is zero, a placeholder
node such as a comment or an empty text node is automatically supplied).  Any
reactive dependency established by `renderFunction` causes a full recalculation
of the View's contents when the dependency is invalidated.  Templates, however,
are compiled in such a way that they do not have top-level dependencies and so
will only ever render once, while their parts may re-render many times.

When a `Blaze.View` is constructed by calling the constructor, no hooks
are fired and no rendering is performed.  In particular, the View is
not yet considered to be "created."  Only when the View is actually
used, by a call to `Blaze.render` or `Blaze.toHTML` or by inclusion in
another View, is it "created," right before it is rendered for the
first time.  When a View is created, its `.parentView` is set if
appropriate, and then the `onViewCreated` hook is fired.  The term
"unrendered View" means a newly constructed View that has not been
"created" or rendered.

The "current View" is kept in [`Blaze.currentView`](#blaze_currentview) and
is set during View rendering, callbacks, autoruns, and template event
handlers.  It affects calls such as [`Template.currentData()`](#template_currentdata).

The following properties and methods are available on Blaze.View:

<dl class="objdesc">
{{#dtdd name="name" type="String" id="view_name"}}
  The name of this type of View.  View names may be used to identify
particular kinds of Views in code, but more often they simply aid in
debugging and comprehensibility of the View tree.  Views generated
by Meteor have names like "Template.foo" and "if".
{{/dtdd}}

{{#dtdd name="parentView" type="View or null" id="view_parentview"}}
  The enclosing View that caused this View to be rendered, if any.
{{/dtdd}}

{{#dtdd name="isCreated" type="Boolean" id="view_iscreated"}}
  True if this View has been called on to be rendered by `Blaze.render`
  or `Blaze.toHTML` or another View.  Once it becomes true, never
  becomes false again.  A "created" View's `.parentView` has been
  set to its final value.  `isCreated` is set to true before
  `onViewCreated` hooks are called.
{{/dtdd}}

{{#dtdd name="isRendered" type="Boolean" id="view_isrendered"}}
  True if this View has been rendered to DOM by `Blaze.render` or
  by the rendering of an enclosing View.  Conversion to HTML by
  `Blaze.toHTML` doesn't count.  Once true, never becomes false.
{{/dtdd}}

{{#dtdd name="isDestroyed" type="Boolean" id="view_isdestroyed"}}
  True if this View has been destroyed, such as by `Blaze.remove()` or
  by a reactive update that removes it.  A destroyed View's autoruns
  have been stopped, and its DOM nodes have generally been cleaned
  of all Meteor reactivity and possibly dismantled.
{{/dtdd}}

{{#dtdd name="renderCount" type="Integer" id="view_rendercount"}}
  The number of times the View has been rendered, including the
  current time is the View is in the process of being rendered
  or re-rendered.
{{/dtdd}}

{{#dtdd name="autorun(runFunc)" id="view_autorun"}}
  Like [`Tracker.autorun`](#tracker_autorun), except that the autorun is
  automatically stopped when the View is destroyed, and the
  [current View](#blaze_currentview) is always set when running `runFunc`.
  There is no relationship to the View's internal autorun or render
  cycle.  In `runFunc`, the View is bound to `this`.
{{/dtdd}}

{{#dtdd name="onViewCreated(func)" id="view_onviewcreated"}}
  If the View hasn't been created yet, calls `func` when the View
  is created.  In `func`, the View is bound to `this`.

  This hook is the basis for the [`created`](#template_created)
  template callback.
{{/dtdd}}

{{#dtdd name="onViewReady(func)" id="view_onviewready"}}
  Calls `func` when the View is rendered and inserted into the DOM,
  after waiting for the end of
  [flush time](#tracker_afterflush).  Does not fire if the View
  is destroyed at any point before it would fire.
  May fire multiple times (if the View re-renders).
  In `func`, the View is bound to `this`.

  This hook is the basis for the [`rendered`](#template_rendered)
  template callback.
{{/dtdd}}

{{#dtdd name="onViewDestroyed(func)" id="view_onviewdestroyed"}}
  If the View hasn't been destroyed yet, calls `func` when the
  View is destroyed.  A View may be destroyed without ever becoming
  "ready."  In `func`, the View is bound to `this`.

  This hook is the basis for the [`destroyed`](#template_destroyed)
  template callback.
{{/dtdd}}

{{#dtdd name="firstNode()" type="DOM node" id="view_firstnode"}}
The first node of the View's rendered content.  Note that this may
be a text node.  Requires that the View be rendered.
If the View rendered to zero DOM nodes, it may be a placeholder
node (comment or text node).  The DOM extent of a View consists
of the nodes between `view.firstNode()` and `view.lastNode()`,
inclusive.
{{/dtdd}}

{{#dtdd name="lastNode()" type="DOM node" id="view_lastnode"}}
The last node of the View's rendered content.

See [`firstNode()`](#view_firstnode).
{{/dtdd}}

{{#dtdd name="template" type="Template" id="view_template"}}
For Views created by invoking templates, the original Template
object.  For example, `Blaze.render(Template.foo).template === Template.foo`.
{{/dtdd}}

{{#dtdd name="templateInstance()" type="Template instance"
id="view_templateinstance"}} For Views created by invoking templates,
returns the [template instance](#template_inst) object for this
particular View.  For example, in a [`created`](#template_created)
callback, `this.view.templateInstance() === this`.

Template instance objects have fields like `data`, `firstNode`, and
`lastNode` which are not reactive and which are also not automatically
kept up to date.  Calling `templateInstance()` causes these fields to
be updated.

{{/dtdd}}

</dl>

{{> autoApiBox "Blaze.currentView"}}

The "current view" is used by [`Template.currentData()`](#template_currentdata) and
[`Template.instance()`](#template_instance) to determine
the contextually relevant data context and template instance.

{{> autoApiBox "Blaze.getView"}}

If you don't specify an `element`, there must be a current View or an
error will be thrown.  This is in contrast to
[`Blaze.currentView`](#blaze_currentview).

{{> autoApiBox "Blaze.With"}}

Returns an unrendered View object you can pass to `Blaze.render`.

Unlike `{{dstache}}#with}}` (as used in templates), `Blaze.With` has no "else" case, and
a falsy value for the data context will not prevent the content from
rendering.

{{> autoApiBox "Blaze.If"}}

Returns an unrendered View object you can pass to `Blaze.render`.

Matches the behavior of `{{dstache}}#if}}` in templates.

{{> autoApiBox "Blaze.Unless"}}

Returns an unrendered View object you can pass to `Blaze.render`.

Matches the behavior of `{{dstache}}#unless}}` in templates.

{{> autoApiBox "Blaze.Each"}}

Returns an unrendered View object you can pass to `Blaze.render`.

Matches the behavior of `{{dstache}}#each}}` in templates.

{{> autoApiBox "Blaze.Template"}}

Templates defined by the template compiler, such as `Template.myTemplate`,
are objects of type `Blaze.Template` (aliased as `Template`).

In addition to methods like `events` and `helpers`, documented as part of
the [Template API](#templates_api), the following fields and methods are
present on template objects:

<dl class="objdesc">

{{#dtdd name="viewName" type="String" id="template_viewname"}}
  Same as the constructor argument.
{{/dtdd}}

{{#dtdd name="renderFunction" type="Function" id="template_renderfunction"}}
  Same as the constructor argument.
{{/dtdd}}

{{#dtdd name="constructView()" id="template_constructview"}}
  Constructs and returns an unrendered View object.  This method is invoked
  by Meteor whenever the template is used, such as by `Blaze.render` or by
  `{{dstache}}> foo}}` where `foo` resolves to a Template object.

  `constructView()` constructs a View using `viewName` and `renderFunction`
  as constructor arguments, and then configures it as a template
  View, setting up `view.template`, `view.templateInstance()`, event maps, and so on.
{{/dtdd}}

</dl>

{{> autoApiBox "Blaze.isTemplate"}}

{{> apiBoxTitle name="Renderable Content" id="renderable_content"}}

A value is *renderable content* if it is one of the following:

* A [template object](#templates_api) like `Template.myTemplate`
* An unrendered [View](#blaze_view) object, like the return value of `Blaze.With`
* `null` or `undefined`

{{#note}}
Internally, renderable content includes objects representing HTML tags
as well, but these objects are not yet part of the officially-supported,
public API.
{{/note}}

{{/template}}
