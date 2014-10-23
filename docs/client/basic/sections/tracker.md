{{#template name="basicTracker"}}

<h2 id="tracker"><span>Tracker</span></h2>

Meteor has a simple dependency tracking system which allows it to
automatically rerun templates and other computations whenever
[`Session`](#session) variables, database queries, and other data
sources change.

Unlike most other systems, you don't have to manually declare these dependencies
&mdash; it "just works". The mechanism is simple and efficient. Once you've
initialized a computation with `Tracker.autorun`, whenever you call a function
that supports reactive updates, Tracker automatically records that this data was
accessed. Later, when the data changes, the computation is rerun automatically.
This is how a template knows how to re-render whenever the data in its
[helpers](#template_helpers) changes.

{{> autoApiBox "Tracker.autorun" }}

`Tracker.autorun` allows you to run a function that depends on reactive data
sources, in such a way that if there are changes to the data later,
the function will be rerun.

For example, you can monitor one `Session` variable and set another:

```
Tracker.autorun(function () {
  var celsius = Session.get("celsius");
  Session.set("fahrenheit",  * 9/5 + 32);
});
```

Or you can wait for a session variable to have a certain value, and do
something the first time it does, calling `stop` on the computation to
prevent further rerunning:

```
// This computation will wait for a session variable to become true,
// then run exactly once.
Tracker.autorun(function (computation) {
  if (Session.get("shouldAlert")) {
    computation.stop();
    alert("Oh no!");
  }
});
```

The function is invoked immediately, at which point it may alert and
stop right away if `shouldAlert` is already true.  If not, the
function is run again when `shouldAlert` becomes true.

If the initial run of an autorun throws an exception, the computation
is automatically stopped and won't be rerun.

To learn more about how Tracker works and to explore advanced ways to use it,
visit the <a href="http://manual.meteor.com/#tracker"> Tracker</a> chapter in the
<a href="http://manual.meteor.com/">Meteor Manual</a>, which describes it in
complete detail.

{{/template}}