<h2 id="whatismeteor">What is Meteor?</h2>

Meteor is two things:

* A _library of packages_: pre-written, self-contained modules that
you might need in your app.<br>
There are about a dozen core Meteor
packages that most any app will use (for example `webapp`, which
handles incoming HTTP connections, and `templating`, which lets you
make HTML templates that automatically update live as data changes).
Then there are optional packages like `email`, which lets your app
send emails, or the Meteor Accounts series (`account-password`,
`accounts-facebook`, `accounts-ui`, and others) which provide a
full-featured user account system that you can drop right into your
app. And beyond these "official" packages, there are hundreds of
community-written packages in [Atmosphere](https://atmosphere.meteor.com/),
one of which might do just what you need.

* A _command-line tool_ called `meteor`.<br>
`meteor` is a build tool analogous to `make`, `rake`, or the non-visual parts of
Visual Studio. It gathers up all of the source files and assets in your
application, carries out any necessary build steps (such as compiling
[CoffeeScript](http://coffeescript.org), minifying CSS, building
[npm](https://npmjs.org/) modules, or generating source maps), fetches the
packages used by your app, and outputs a standalone, ready-to-run application
bundle. In development mode it can do all of this interactively, so that
whenever you change a file you immediately see the changes in your browser. It's
super easy to use out of the box, but it's also extensible: you can add support
for new languages and compilers by adding build plugin packages to your app.

The key idea in the Meteor package system is that _everything should
work identically in the browser and on the server_ (wherever it makes
sense, of course: browsers can't send email and servers can't capture
mouse events). Our whole ecosystem has been built from the ground up
to support this.

{{#note}}
`meteor` cannot yet fetch packages from Atmosphere. If you are using
Atmosphere packages you should take a look at
[Meteorite](http://oortcloud.github.io/meteorite/), a tool that will
help you download and manage your Atmosphere packages.

In Meteor 1.0, the `meteor` build tool will have full support for
Atmosphere.
{{/note}}
