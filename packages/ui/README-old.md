# Meteor UI

XXX This README just talks about DomRange, and the information is out of date or may change before release.

## DomRange

- - -
**What users need to know:** DomRange is the type of object found at `component.dom` (sometimes `this.dom`).  It provides useful methods like `dom.$(selector)` and `dom.elements()`.  A DomRange represents the DOM extent of a rendered component, sort of like virtual wrapper element.
- - -

A DomRange can be conceptualized as an invisible element in the DOM tree which sits under some parent element and contains some of the element's children as members.  There's one DomRange for every template, component, or block helper in a Meteor application.  The members of a DomRange may be either nodes or other DomRanges, forming a miniature tree.  Since all the nodes in a DomRange tree are siblings in the DOM, this miniature tree occurs entirely at one DOM tree level.

For example, take the following template code:

```
<template name="posts">
  {{#each posts}}
    {{#if recent}}
      <div class="post-wrapper">
        {{> post}}
      </div>
    {{/if}}
  {{/each}}
</template>
```

Surrounding the `post-wrapper` div elements is a DomRange tree at least three levels deep, containing DomRanges for the `template`, `each`, and `if`s.  Additionally, there is a DomRange inside each div that encloses the `post` template, but because this DomRange occurs at a different level of the DOM, it doesn't interact with the others.

Compared to a real DOM element, a DomRange holds few pointers to other nodes and makes few assumptions about its members.  Member elements may be removed or re-ordered without notifying the DomRange (leading to, at worst, fewer ordering guarantees from future operations).  Essentially, a DomRange holds an unordered set of member pointers which are weak, bidirectional, and optionally labeled with names.  There are no pointers across levels of the DOM.

Meteor UI uses DomRange for all manipulation of DOM structures, and user hooks allow these operations to be customized at a fine level for the sake of animated transitions.  Constructs like `#each` call DomRange's high-level member operations like add, move, and remove, which in turn call low-level DOM operations that can be customized to suit the context (for example, a container element all of whose children should be animated in and out).

DomRanges also provide a range of other core Meteor UI functionality such as:

* Detection of removed nodes
* Event binding
* Containment and selector testing

A helper library such as jQuery provides DOM compatibility shimming and API expansion (adding features to selectors and event objects, for example).  A common interface connects DomRange to "DOM backends" like jQuery or Zepto.  Each backend requires an adaptor library which adapts names and semantics to fit DomRange's requirements.

DomRange attaches a `.$ui` property to DOM elements that makes it easy to get from an element to its immediately enclosing range.  Going in the other direction is as easy as `range.elements()`.

Given that components, not ranges, are likely to be of the most interest to the application, DomRange is designed to hang off a *host object* in a property called `.dom`.  Thus, following pointers from a DomRange to other ranges, or following `.$ui` from an element, goes to the host object if there is one, not the DomRange itself.  In this way, DomRange interoperates with components while knowing only that they have a `.dom` property.

### Host Objects

When a DomRange is created, an object called the "host" or "component" can be supplied, and this object is used in arguments and return values of DomRange methods instead of the DomRange itself.  This lets you treat a DomRange as having components as members.  For example, `myComponent.dom.get("foo")` will be a component, not a DomRange, and `myElement.$ui` will also be a component even though DomRange itself uses this pointer to find the DomRange that owns an element.

The only thing DomRange knows about components is that they are host objects for DomRanges.

### Methods

In the following method signatures, a "component" is a DomRange host object.  A "member" is a component or DOM node.

`new DomRange([component])`

Creates an empty DomRange in an offscreen document fragment.  If `component` is provided, it is used as the host of the new DomRange, and `component.dom` is set to the new DomRange.  Otherwise, the new DomRange serves as its own host and receives a `dom` property pointing to itself.

.......

### Representation

DomRange is not a tight abstraction over the DOM, it's more of a tool or machine, so it's helpful to understand how it operates before using it.  Meteor application developers do *not* need to know this level of detail unless they are doing a fair amount of custom DOM manipulation.

DomRange uses two empty text nodes as `start` and `end` markers.  (In IE 8, they must be comment nodes.)  Empty text nodes are allowed in a wide variety of DOM positions and do not affect how the DOM is displayed by the browser.  In addition, text nodes are largely ignored by libraries like jQuery and inspectors like Chrome Dev Tools.  We expect that even if a DomRange's member elements (and member elements of its descendants) are arbitrarily moved or removed without the DomRange's knowledge, the start/end markers will still be present, though their locations may carry little meaning.  (It's also possible the markers will be removed completely, for example if innerHTML is set on the parent element.)

Because a DomRange points to all its members, the start/end markers are not needed to traverse the contents of a DomRange or define which nodes it contains.  However, accurate markers are needed for DomRange methods that add or move members relative to other members, and the markers will always be accurate in the absence of foreign DOM manipulation (like elements being added, moved, or removed by jQuery).  An operation called **refresh** repositions a DomRange's start/end markers based on the positions of its members.  A DomRange is refreshed automatically at certain times when its nodes are required to be consecutive or accurate markers are important.  In some cases where nodes are reordered outside of DomRange, a manual call to refresh may be necessary as well.

#### Details of Refresh

Refreshing a DomRange generally causes it to "follow" its elements.  For example, if DomRange A contains B, which contains C, which contains a div, the initial, clean DOM will have three start markers, then the div, then three end markers.  If the div is moved to a different position (under the same parent node), refreshing A will cause all three start markers and all three end markers to snap into place around the relocated div.

An automatic refresh happens:

* When a range is removed
* When a range is moved (by its owner range)
* When a range is inserted into the document for the first time
* When a range's start marker is needed to determine the position of an added or moved sibling member

An automatic refresh does *not* happen when adding or moving a member to the end of a range, even though the end marker is used.  We don't want to refresh an entire list just to add a member to the end.  This means that if you have a DomRange with labeled members (e.g. an "each") and you perform foreign DOM manipulation that may make the end marker inaccurate (e.g. by moving elements to the end of the parent element), you should manually refresh the DomRange after doing the manipulation.

The refresh algorithm is as follows:

* Recursively refresh all member ranges
* Find the first and last node that is either a member node (but not a text node with only whitespace) or a marker of a member range
* Move the start and end markers to just before the first such node and just after the last such node
* Nodes found between members that don't belong to any DomRange may be "adopted" and made members.  This allows foreign-inserted nodes to be moved or removed along with their surroundings.
