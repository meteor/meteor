### Filing Bug Reports

If you've found a bug in Meteor, file a bug report in [our issue
tracker](https://github.com/meteor/meteor/issues). If the issue contains
sensitive information or raises a security concern, email
<code>security[]()@[]()meteor.com</code> instead, which will page the
security team.

A Meteor app has many moving parts, and it's often difficult to reproduce a bug
based on just a few lines of code. If you want somebody to be able to fix a bug
(or verify a fix that you've contributed), the best way is:

* Create a new Meteor app that displays the bug with as little code as possible. Try to delete any code that is unrelated to the precise bug you're reporting.
* Create a new GitHub repository with a name like `meteor-reactivity-bug` (or if you're adding a new reproduction recipe to an existing issue, `meteor-issue-321`) and push your code to it. (Make sure to include the `.meteor/packages` file!)
* Reproduce the bug from scratch, starting with a `git clone` command. Copy and paste the entire command-line input and output, starting with the `git clone` command, into the issue description of a new GitHub issue. Also describe any web browser interaction you need to do.
* Specify what version of Meteor (`$ meteor --version`) and what web browser you used.

By making it as easy as possible for others to reproduce your bug, you make it easier for your bug to be fixed. **We're not always able to tackle issues opened without a reproduction recipe. In those cases we'll close them with a pointer to this wiki section and a request for more information.**


### Contributing code to the Meteor project

Before submitting a pull request, make sure that it follows these guidelines:

* Make sure that your branch is based off of the **devel** branch. The **devel** branch is where active development happens.  **We can't merge non-trivial patches off master.**
* Sign the [contributor's agreement](http://contribute.meteor.com/).
* Follow the [Meteor style guide](https://github.com/meteor/meteor/wiki/Meteor-Style-Guide).
* Limit yourself to one feature or bug fix per pull request.
* Name your branch to match the feature/bug fix that you are submitting.
* Write clear, descriptive commit messages.
* Describe your pull request in as much detail as possible: why this pull request is important enough for us to consider, what changes it contains, what you had to do to get it to work, how you tested it, etc.  Be detailed but be clear: use bullets, examples if needed, and simple, straightforward language.

If you're working on a big ticket item, please check in on [meteor-core](http://groups.google.com/group/meteor-core).  We'd hate to have to steer you in a different direction after you've already put in a lot of hard work.

### Package Submission Guidelines

We recommend submitting most new smart packages to [Atmosphere](https://atmosphere.meteor.com), rather than submitting a pull request.

If you submit a smart package pull request, we want to see strong community interest in the package before we include it in a Meteor release. Usage on atmosphere or comments on the pull request are great for this. This helps us keep Meteor core clean and streamlined.

* Your package should have tests. See `packages/coffeescript` or `packages/less` for examples.
* Your package should be documented. See `docs/client/packages`.
* Because the package API is still in flux, and because you can include client-side JS/CSS files directly in your project's `client/lib` directory, the bar is higher for new packages that only include client-side JS/CSS files.
* Similarly, the bar is higher for new packages that only include JS files with minimal integration. Generally, the test is whether a file can simply be put into your project's `lib` or `server/lib` directory, or if additional effort is needed to make it work.
* Meteor minifies all JS/CSS.  Packages should include only the original JS/CSS files, not the minified versions.
