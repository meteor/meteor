{{#template name="basicTracker"}}

<h2 id="tracker"><span>Tracker</span></h2>

Meteor has a simple dependency tracking system which allows it to
automatically rerun templates and other functions whenever
[`Session`](#session) variables, database queries, and other data
sources change.

Unlike most other systems, you don't have to manually declare these dependencies
&mdash; it "just works." The mechanism is simple and efficient. Once you've
initialized a computation with `Tracker.autorun`, whenever you call a Meteor function that returns data, `Tracker` automatically records which data were
accessed. Later, when this data changes, the computation is rerun automatically.
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
  Session.set("fahrenheit", celsius * 9/5 + 32);
});
```

Or you can wait for a session variable to have a certain value, and do
something the first time it does. If you want to prevent further rerunning
of the function, you can call `stop` on the computation object that is
passed as the first parameter to the callback function:

```
// Initialize a session variable called "counter" to 0
Session.set("counter", 0);

// The autorun function runs but does not alert (counter: 0)
Tracker.autorun(function (computation) {
  if (Session.get("counter") === 2) {
    computation.stop();
    alert("counter reached two");
  }
});

// The autorun function runs but does not alert (counter: 1)
Session.set("counter", Session.get("counter") + 1);

// The autorun function runs and alerts "counter reached two"
Session.set("counter", Session.get("counter") + 1);

// The autorun function no longer runs (counter: 3)
Session.set("counter", Session.get("counter") + 1);
```

The first time `Tracker.autorun` is called, the callback function is
invoked immediately, at which point it alerts and stops right away if
`counter === 2` already. In this example, `Session.get("counter") === 0`
when `Tracker.autorun` is called, so nothing happens the first time, and
the function is run again each time `counter` changes, until
`computation.stop()` is called after `counter` reaches `2`.

If the initial run of an autorun throws an exception, the computation
is automatically stopped and won't be rerun.

To learn more about how `Tracker` works and to explore advanced ways to
use it, visit the <a href="http://manual.meteor.com/#tracker">Tracker</a>
chapter in the <a href="http://manual.meteor.com/">Meteor Manual</a>,
which describes it in much more detail.

{{/template}}
