# Contributing to Meteor

Thank you for contributing to the Meteor project! Please read the guidelines below or it might be
hard for us to help you with your issue.

We are excited to have your help building Meteor &mdash; both the platform and the
community behind it &mdash; and share in the rewards of getting in early on
something great.  Here's how you can help with bug reports and new code.

## Reporting a bug in Meteor

We welcome clear bug reports.  If you've found a bug in Meteor that
isn't a security risk, please file a report in
[our issue tracker](https://github.com/meteor/meteor/issues).

> There is a separate procedure for security-related issues.  If the
> issue you've found contains sensitive information or raises a security
> concern, email <code>security[]()@[]()meteor.com</code> instead, which
> will page the security team.

A Meteor app has many moving parts, and it's often difficult to
reproduce a bug based on just a few lines of code.  So your report
should include a reproduction recipe.  By making it as easy as possible
for others to reproduce your bug, you make it easier for your bug to be
fixed. **We may not be able to tackle an issue opened without a
reproduction recipe. If we can't, we'll close them with a pointer to this
wiki section and a request for more information.**

**A single code snippet is _not_ a reproduction recipe.**

A reproduction recipe works like this:

 * Create a new Meteor app that displays the bug with as little code as
   possible. Try to delete any code that is unrelated to the precise bug
   you're reporting, including extraneous Atmosphere packages.  Ideally, try to use
   as few source files as possible so that it's easy to see the whole reproduction
   on one screen, rather than making a large number of small files, even if that's
   not how you'd choose to structure an app.

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

 * Mention what operating system you're using and what browser (if any).

If you want to submit a pull request that fixes your bug, that's even
better.  We love getting bugfix pull requests.  Just make sure they're
written to the MDG style guide and *come with tests*.  Read further down
for more details on proposing changes to core code.

## Feature requests

As of January 2015, we do use GitHub to track feature requests from our
community. Feature request issues get the `feature` label, as well as a label
corresponding to the Meteor subproject that they are a part of.

Meteor is a big project with [many](https://www.meteor.com/projects)
[subprojects](https://github.com/meteor/meteor/labels). Right now, the project
doesn't have as many
[core developers (we're hiring!)](https://www.meteor.com/jobs/core-developer)
as subprojects, so we're not able to work on every single subproject every
month.  We use our [roadmap](https://roadmap.meteor.com/) to communicate what
we're actually working on now, and what things we might be working on soon.

Every additional feature adds a maintenance cost in addition to its value. This
cost starts with the work of writing the feature or reviewing a community pull
request. In addition to the core code change, attention needs to be paid to
documentation, tests, maintability, how the feature interacts with existing and
speculative Meteor features, cross-browser/platform support, user experience/API
considerations, etc.  Once the feature is shipped, it then becomes the core
team's responsibility to fix future bugs related to the feature.

We're happy to see pull requests for Meteor feature requests on GitHub. Even if
they don't get merged quickly, they can be helpful to other users who can use
them as temporary workarounds, and community members can help each other iterate
on making better pull requests.

But as described above, actually evaluating and merging them is real work that
always has to be weighed against [other work](https://roadmap.meteor.com/) that
Meteor users need.  So don't be surprised if feature requests and their
corresponding pull requests don't get acted on for a while or ever, especially
if they contain API changes or don't contain tests.

That said, feature requests on GitHub are still a good place for the community
to express their desires around features. We now organize issues using subproject
labels, so it's easier for a core developer to find all the feature requests for
a subproject and think of ways to holistically address multiple feature
requests.

(We will close feature requests that are entire new subprojects that are already on the
[roadmap](https://roadmap.meteor.com/); discuss them on the roadmap! Many of these projects can be
achieved (or at least prototyped) as non-core packages; the best way to influence the future of
Meteor core on these future projects is to build a package that implements it yourself.)

In general, if a feature can be implemented as an external Atmosphere package by
our community, that's better than building it in to core, since future changes
can be made directly by the community users who directly depend on the feature.


## Adding new packages to Meteor

If you have an idea for something new in Meteor, usually the best option
is to publish it as an [Atmosphere](https://atmospherejs.com/)
package.  We want to keep the core as small as possible, with just
the parts that most apps will need.  If there's a way to do something as
an Atmosphere package, we'll steer you in that direction.

Publishing your code as a separate package decouples your change from
Meteor's core release cycle so you can maintain the code independently.
It gives you and others in the community freedom to explore different
variations of your idea.  And it lets developers "vote with their feet"
to find the best way to solve a problem or add a capability.  For
example, the popular
[`iron:router`](https://atmospherejs.com/iron/router) package is
an evolution of two earlier routing solutions that were both already
available in Atmosphere.

For historical reasons, some packages that really ought to be in
Atmosphere are currently in core, like `less` and `coffeescript`.
We welcome PRs against these packages but they may not get the highest
priority. If a community-supported package providing access to the same
tool becomes popular, we'll likely start recommending that users use
that instead and deprecate these core packages, as we already have
with a few.

It's probably a good idea to write
your packages to the MDG style guide.  You can read more about that in
the next section.  In particular, two things you can get a head start on
are:

 * Your package should have tests. See the `iron:router`
   [test suite](https://github.com/EventedMind/iron-router/tree/master/test)
   as an example.

 * Meteor minifies all JS/CSS.  Packages should include only the
   original JS/CSS files, not the minified versions.

## Making changes to Meteor core

Eventually you may want to change something in a core Meteor package, or
in the `meteor` command line tool.  These changes have the highest
standards for API design, for the names of symbols, for documentation,
and for the code itself.  Be prepared for a lot of work!

It may take some study to get comfortable with Meteor's core architecture.  Each core package is
designed to stand separately.  At the same time, all the parts of core fit together to make the
distinctive Meteor development experience.  Core APIs should be consistent between the client and
the server (not always workable; we don't have fibers on the client or a DOM on the server).  We
prefer synchronous APIs wherever possible: you can use `Meteor.wrapAsync` on the server to wrap
async APIs that take a callback.  

Above all, we are concerned with two design requirements when evaluating
any change to a core package:

 1. Nothing in Meteor should harm the experience of a new Meteor
 developer.  That can be a difficult standard to reach, because we're
 concerned here with the entire experience of developing and deploying
 an application.  For example, we work hard to make sure that the Meteor
 docs don't force new users to understand advanced concepts before they
 need them.  And we think a great deal about making our APIs as
 intuitive as possible, so that you can figure out a lot of Meteor
 without first having a long reading session with the docs.

 2. Nothing in Meteor should preclude an expert from doing what they
 want.  The
  [low-level DDP API](http://docs.meteor.com/#publish_added) maps
 closely to the DDP wire protocol, for example, so that when the need arises you can
 control exactly what data gets sent to a client.  It's okay to write
 [syntactic sugar](http://en.wikipedia.org/wiki/Syntactic_sugar) that
 makes the easy stuff easy, but if your change harms the experience of
 an expert then we'll probably prefer a different approach.

We have found that writing software to meet both these standards at the
same time is hard but
incredibly rewarding.  We hope you come to feel the same way.

#### Proposing your change

You'll have the best chance of getting a change into core if you can
build consensus in the community for it and eventually get a core
developer on board.  It is very unlikely that we'll take a patch that adds a feature
without seeing some initial discussion about it.  Probably the best way
to get consensus is to join the `meteor-core` mailing list, search the
archives for anything relevant, and then post your proposal there.  It's
okay to post an idea to `meteor-core` without having a design or some
initial code &mdash; others may be interested in helping.

Another option is to come to [Devshop](https://devshop.meteor.com/) in
San Francisco, where you can sit with a core developer and work out some
of the design in person.

Most non-trivial changes need more discussion than comfortably fits
inside GitHub's issue tracker, so that is not a good place to propose a
new idea.  We will probably close most "surprise" PRs that we find there
with a note to start a discussion on `meteor-core`.

Small changes, especially if they don't affect APIs or documentation,
may not really need a thread on `meteor-core` first.  But a new feature
that's small enough not to need discussion probably isn't super
valuable.  It may not get the highest priority from the core team, or we
may just close it.

> During the runup to 1.0, we are going to focus on buttoning up the
> remaining big ticket items and closing bugs.  We'll probably have to
> defer some good ideas and smaller, uncontroversial changes until after
> 1.0 is out.

#### Submitting pull requests

Once you've hammered out a good design and gotten at least one core
developer on board, go ahead and submit a pull request.  Please follow
these guidelines:

 * Sign the [contributor's agreement](http://contribute.meteor.com/).

 * Base all your work off of the **devel** branch. The **devel** branch
   is where active development happens.  **We do not merge patches
   directly into master.**

 * Name your branch to match the feature/bug fix that you are
   submitting.

 * Limit yourself to one feature or bug fix per pull request.

 * Include tests that prove your code works.

 * Follow the
   [MDG style guide](https://github.com/meteor/meteor/wiki/Meteor-Style-Guide)
   for code and commit messages.

 * Be sure your author field in git is properly filled out with your full name
 and email address so we can credit you.

## How we respond to issues

You might be interesting in reading this [guide for core developers about responding to issues](https://meteor.hackpad.com/Responding-to-GitHub-Issues-SKE2u3tkSiH).
