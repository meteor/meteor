## Contributing to Meteor

We hope you will join us in building Meteor -- both the platform and the
community behind it -- and share in the rewards of getting in early on
something great.

Please see our
[contributing guidelines](https://github.com/meteor/meteor/wiki/Contributing-to-Meteor)
on GitHub for more details on how to file a bug report or submit a
pull request.

### Bug reports

If you've found a bug in Meteor that isn't a security risk, you can file
a report in
[our issue tracker](https://github.com/meteor/meteor/issues).

> There is a separate procedure for security-related issues.  If the
> issue you've found contains sensitive information or raises a security
> concern, email <code>security[]()@[]()meteor.com</code> instead, which
> will page the security team.

Please don't use GitHub issues for feature requests or proposals.  Most
additions deserve a fair bit of discussion, which doesn't work super
well inside a GitHub issue.  Read on for how to get changes into Meteor.

A Meteor app has many moving parts, and it's often difficult to
reproduce a bug based on just a few lines of code.  So your report
should include a reproduction recipe.  By making it as easy as possible
for others to reproduce your bug, you make it easier for your bug to be
fixed. **We may not be able to tackle an issue opened without a
reproduction recipe. If we can't, we'll close them it a pointer to this
wiki section and a request for more information.**

A reproduction recipe works like this:

 * Create a new Meteor app that displays the bug with as little code as
   possible. Try to delete any code that is unrelated to the precise bug
   you're reporting, including extraneous Atmosphere packages.

 * Create a new GitHub repository with a name like
   `meteor-reactivity-bug` (or if you're adding a new reproduction
   recipe to an existing issue, `meteor-issue-321`) and push your code
   to it. (Make sure to include the `.meteor/packages` and `.meteor/release` files!)

 * Reproduce the bug from scratch, starting with a `git clone`
   command. Copy and paste the entire command-line input and output,
   starting with the `git clone` command, into the issue description of
   a new GitHub issue. Also describe any web browser interaction you
   need to do.

 * If you reproduced the issue using a checkout of Meteor instead of using
   a released version that was pinned with a `.meteor/release` file,
   specify what commit in the Meteor repository was checked out.

If you want to submit a pull request that fixes your bug, that's even
better.  We love getting bugfix pull requests.  Just make sure they're
written to the MDG style guide and *come with tests*.  Read further down
for more details on proposing changes to core code.

### Pull requests

Before submitting a pull request, please read the
[contributing guidelines](https://github.com/meteor/meteor/wiki/Contributing-to-Meteor)
on GitHub.  In brief:

* If possible, publish new features as separate packages on
  [Atmosphere](https://atmosphere.meteor.com).

* Most changes to core packages should be discussed first on
  [`meteor-core`](https://groups.google.com/group/meteor-core), where
  you can build consensus and work out most of the design.  Submit a
  pull request once you have a core developer on board.
  
* The `meteor-core` list is also a fine place to request new features
  without a specific proposal.  GitHub issues aren't as good place for
  those that sort of thing: we'll close "feature request" issues.
