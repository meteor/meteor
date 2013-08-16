  <h2 id="namespacing">Namespacing</h2>

Meteor's namespacing support makes it easy to write large applications
in JavaScript. Each package that you use in your app exists in its own
separate namespace, meaning that it sees only its own global variables
and any variables provided by the packages that it specifically
uses. Here's how it works.

When you declare a top-level variable, you have a choice. You can make
the variable File Scope or Package Scope.

    // File Scope. This variable will be visible only inside this
    // one file. Other files in this app or package won't see it.
    var alicePerson = {name: "alice"};

    // Package Scope. This variable is visible to every file inside
    // of this package or app. The difference is that 'var' is
    // omitted.
    bobPerson = {name: "bob"};

Notice that this is just the normal JavaScript syntax for declaring a
variable that is local or global. Meteor scans your source code for
global variable assignments and generates a wrapper that makes sure
that your globals don't escape their appropriate namespace.

In addition to File Scope and Package Scope, there are also
Exports. An export is a variable that a package makes available to you
when you use it. For example, the `email` package exports the `Email`
variable. If your app uses the `email` package (and _only_ if it uses
the `email` package!) then your app can see `Email` and you can call
`Email.send`. Most packages have only one export, but some packages
might have two or three (for example, a package that provides several
classes that work together).

You see only the exports of the packages that you use directly. If you
use package A, and package A uses package B, then you only see package
A's exports. Package B's exports don't "leak" into your namespace just
because you used package A. This keeps each namespace nice and
tidy. Each app or package only sees their own globals plus the APIs of
the packages that they specifically asked for.

When debugging your app, your browser's JavaScript console behaves as
if it were attached to your app's namespace. You see your app's
globals and the exports of the packages that your app uses
directly. You don't see the variables from inside those packages, and
you don't see the exports of your transitive dependencies (packages
that aren't used directly by your app, but that are used by packages
that are used by your app).

If you want to look inside packages from inside your in-browser
debugger, you've got two options:

* Set a breakpoint inside package code. While stopped on that
  breakpoint, the console will be in the package's namespace. You'll
  see the package's package-scope variables, imports, and also any
  file-scope variables for the file you're stopped in.

* If a package `foo` is included in your app, regardless of whether
  your app uses it directly, its exports are available in
  `Package.foo`. For example, if the `email` package is loaded, then
  you can access `Package.email.Email.send` even from namespaces that
  don't use the `email` package directly.

When declaring functions, keep in mind that `function x () {}` is just
shorthard for `var x = function () {}` in JavaScript. Consider these
examples:

    // This is the same as 'var x = function () ...'. So x() is
    // file-scope and can be called only from within this one file.
    function x () { ... }

    // No 'var', so x() is package-scope and can be called from
    // any file inside this app or package.
    x = function () { ... }

<div class="note">
Technically speaking, globals in an app (as opposed to in a package)
are actually true globals. They can't be captured in a scope that is
private to the app code, because that would mean that they wouldn't be
visible in the console during debugging! This means that app globals
actually end up being visible in packages. That should never be a
problem for properly written package code (since the app globals will
still be properly shadowed by declarations in the packages). You
certainly shouldn't depend on this quirk, and in the future Meteor may
check for it and throw an error if you do.
</div>
