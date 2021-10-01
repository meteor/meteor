# Blaze

1. Introduction to Spacebars -- the tracker-backed handlebars like templating syntax
  1. Example of spacebars syntax, data context + helpers
  2. Data contexts and access - name lookup (`.`, `this`, `..`, `[0]`), and null values
  3. Helpers, arguments, options
  4. Inclusion of other templates + arguments, passing data contexts
  5. Helpers inside tags -- returning strings and objects, `checked={{isChecked}}`
  6. Nested helpers + sub expressions
  7. Block helpers (you can create them with templates, see 10. below)
  8. Safestrings and `{{{`
  9. Builtin block helpers
    1. `{{#if/unless}}`
    2. `{{#each .. in ..}}`
    3. `{{#let}}`
    4. Explain `{{#each}}` and `{{#with}}`, indicate that it's better not to use them.
      1. NOTE: we need to ensure that issues around lexical scope and event handlers are resolved for `{{#each .. in ..}}` and `{{#let}}`.
  10. Comments
  11. Strictness
  12. Escaping
2. Creating reusable "pure" components with Blaze / best practice (a lot of this is repeating @sanjo's boilerplate)
  1. Validating data context fits a schema
  2. Always set data contexts to `{name: doc}` rather than just `doc`. Always set a d.c on an inclusion.
  3. Use `{{#each .. in .. }}` to achieve the above
  4. Use the template instance as a component -- adding a `{{instance}}` helper to access it
  5. Use a (named / scoped on `_id` if possible) reactive dict for instance state
  6. Attach functions to the template instance (in `onCreated`) to sensibly modify state
  7. Place `const instance = Template.instance()` at the top of all helpers/event handlers that care about state
  8. Always scope DOM lookups with `this.$`
  9. Use `.js-X` in event maps
  10. Pass extra content to components with `Template.contentBlock`, or named template arguments
  11. Use the `onRendered` callback to integrate w/ 3rd party libraries
    1. Waiting on subscriptions w/ `autorun` pattern: https://github.com/meteor/guide/pull/75/files#r43545240
3. Writing "smart" components with Blaze
  1. All of section 2.
  2. Use `this.autorun` and `this.subscribe`, listening to `FlowRouter` and `this.state`
  3. Set up cursors in helpers to be passed into pure sub-components, and filtered with `cursor-utils`
    1. Why cursors are preferred to arrays.
  4. Access stores directly from helpers.
4. Reusing code between templates
  1. Prefer utilities/composition to mixins or inheritance
  2. How to write global helpers
5. Understanding Blaze
  1. When does a template re-render (when its data context changes)
  2. When does a helper-rerun? (when its data context or reactive deps change)
    1. So be careful, this can happen a lot! If your helper is expensive, consider something like https://github.com/peerlibrary/meteor-computed-field
  3. How does an each tag re-run / decide when new data should appear?
    1. How does the `{{attrs}` syntax work, some tricks on how to use it.
  4. How do name lookups work?
  5. What does the build system do exactly?
  6. What is a view?
6. Testing Blaze templates
  1. Rendering a template in a unit test
  2. Querying the DOM (general but just a pointer here)
  3. Triggering reactivity and waiting for re-rendering
  4. Simulating events w/ JQ
7. Useful Blaze utilities / other approaches
  1. https://github.com/peerlibrary/meteor-blaze-components
  2. https://github.com/raix/Meteor-handlebar-helpers
  3. Much, much more...
