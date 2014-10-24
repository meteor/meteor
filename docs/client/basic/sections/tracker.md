{{#template name="basicTracker"}}

<h2 id="tracker"><span>Tracker</span></h2>

Meteor has a simple dependency tracking system which allows it to
automatically rerun templates and other computations whenever
[`Session`](#session) variables, database queries, and other data
sources change.

Unlike most other systems, you don't have to manually declare these dependencies
&mdash; it "just works." The mechanism is simple and efficient. Once you've
initialized a computation with `Tracker.autorun`, whenever you call a function
that supports reactive updates, the `Tracker` automatically records which data were
accessed. Later, when those data change, the computation is rerun automatically.
This is how a template knows how to re-render whenever its [helper
functions](#template_helpers) have new data to return.

{{> autoApiBox "Tracker.autorun" }}

`Tracker.autorun` allows you to run a function that depends on reactive
data sources. Whenever those data sources are updated with new data, the
function will be rerun.

For example, you can monitor one `Session` variable and set another:

```
Tracker.autorun(function () {
  var celsius = Session.get("celsius");
  Session.set("fahrenheit",  * 9/5 + 32);
});
```

Or you can wait for a session variable to have a certain value, and do
something the first time it does. If you want to prevent further rerunning
of the function, you can call `stop` on the computation object that is
passed as the first parameter to the callback function:

```
// For this example, assume shouldAlert starts out false
Session.set("shouldAlert", false);

Tracker.autorun(function (computation) {
  if (Session.get("shouldAlert")) {
    computation.stop();
    alert("Oh no!");
  }
});

// The autorun function runs but does not alert
Session.set("shouldAlert", false);

// The autorun function runs and alerts "Oh no!"
Session.set("shouldAlert", true);

// The autorun function no longer runs
Session.set("shouldAlert", "maybe?");
```

The first time `Tracker.autorun` is called, the callback function is
invoked immediately, at which point it would alert and stop right away if
`shouldAlert` had been true.  If not, the function is run again when
`shouldAlert` becomes true.

If the initial run of an autorun throws an exception, the computation
is automatically stopped and won't be rerun.

To learn more about how Tracker works and to explore advanced ways to use it,
visit the <a href="http://manual.meteor.com/#tracker">Tracker</a> chapter in the
<a href="http://manual.meteor.com/">Meteor Manual</a>, which describes it in
much more detail.

{{/template}}
