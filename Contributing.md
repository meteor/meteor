# Contributing to Meteor

Thank you for contributing to the Meteor project! Please read the guidelines below or it might be
hard for the community to help you with your issue or pull request.

We are excited to have your help building Meteor &mdash; both the platform and the
community behind it. Here's how you can help with bug reports and new code.

<h2 id="reporting-bug">Reporting a bug in Meteor</h2>

We welcome clear bug reports.  If you've found a bug in Meteor that
isn't a security risk, please file a report in
[our issue tracker](https://github.com/meteor/meteor/issues). Before you file your issue, look to see if it has already been reported. If so, comment, up-vote or +1 the existing issue to show that it's affecting multiple people.

> There is a separate procedure for security-related issues.  If the
> issue you've found contains sensitive information or raises a security
> concern, email <code>security[]()@[]()meteor.com</code> instead, which
> will page the security team.

A Meteor app has many moving parts, and it's often difficult to
reproduce a bug based on just a few lines of code.  So your report
should include a reproduction recipe.  By making it as easy as possible
for others to reproduce your bug, you make it easier for your bug to be
fixed. **It's likely that without a reproduction, contributors won't look into fixing your issue and it will end up being closed.**

**A single code snippet is _not_ a reproduction recipe and neither is an entire application.**

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

<h2 id="feature-requests">Feature requests</h2>

As of May 2016, we use GitHub to track feature requests. Feature request issues get the `feature` label, as well as a label
corresponding to the Meteor subproject that they are a part of.

Meteor is a big project with [many](https://www.meteor.com/projects)
[subprojects](https://github.com/meteor/meteor/labels). Right now, the project
doesn't have as many
[core developers (we're hiring!)](https://www.meteor.com/jobs/core-developer)
as subprojects, so we're not able to work on every single subproject every
month.  We use our [roadmap](Roadmap.md) to communicate the high level features we're prioritizing over the near and medium term.

Every additional feature adds a maintenance cost in addition to its value. This
cost starts with the work of writing the feature or reviewing a community pull
request. In addition to the core code change, attention needs to be paid to
documentation, tests, maintainability, how the feature interacts with existing and
speculative Meteor features, cross-browser/platform support, user experience/API
considerations, etc.  Once the feature is shipped, it then becomes the community's responsibility to fix future bugs related to the feature. In case the original author disappears, it's important that the feature has good tests and is widely used in order to be maintainable by other contributors.

For these reasons, we strongly encourage features to be implemented as [Atmosphere or npm packages](http://guide.meteor.com/writing-packages.html) rather than changes to core. Try to re-work your feature request as a minimal set of hooks to core that enable the feature to be implemented as a package.

Feature requests should be well specified and unambiguous to have the greatest chance of being worked on by a contributor.

Finally, you can show your support for features you would like by commenting with a +1 or up-voting the issue.

## Triaging issues

A great way to contribute to Meteor is by helping keep the issues in the repository clean and well organized. This process is called 'issue triage' and the steps are described [here](IssueTriage.md).

## Documentation

If you'd like to contribution to Meteor's documentation, head over to https://github.com/meteor/docs and create issues or pull requests there.

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

### Proposing your change

You'll have the best chance of getting a change into core if you can build consensus in the community for it. Start by creating a well specified feature request as a Github issue.

Help drive discussion and advocate for your feature on the Github ticket (and perhaps the forums). The higher the demand for the feature and the greater the clarity of it's specification will determine the likelihood of a core contributor prioritizing your feature by flagging it with the `pull-requests-encouraged` label.

Split features up into smaller, logically separable chunks. It is unlikely that large and complicated PRs  will be merged.

Once your feature has been labelled with `pull-requests-encouraged`, leave a comment letting people know you're working on it and you can begin work on the code.

### Submitting pull requests

Once you've hammered out a good design go ahead and submit a pull request. If your PR isn't against a bug with the `confirmed` label or a feature request with the `pull-requests-encouraged` label, don't expect your PR to be merged unless it's a trivial and obvious fix (e.g documentation). When submitting a PR, please follow
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

### Need help with your pull request?

Meteor now has groups defined to cover different areas of the codebase. If you need help getting acceptance on certain pull requests with an area of focus listed below, you can address the appropriate people in the pull request:

* Meteor Data Team - This includes DDP, tracker, mongo, accounts, etc. You can mention @data in the PR.
* Blaze - This includes Spacebars, Blaze, etc. You can mention @view-layer in the PR.
* Build tools - This includes modules, build tool changes, etc. You can mention @platform in the PR.
* Mobile integration - This includes Cordova, React Native, etc. You can mention @mobile in the PR.
* Documentation - This includes the Guide, the Docs, and any supporting material. You can mention @guide in the PR.

Including the people above is no guarantee that you will get a response, or ultimately that your pull request will be accepted. This section exists to give some minor guidance on internal Meteor Development Group team structures.

### Running tests on Meteor core

When you are working with code in the core Meteor packages, you will want to make sure you run the
full test-suite (including the tests you added) to ensure you haven't broken anything in Meteor. The
`test-packages` command will do just that for you.

The test packages command will start up a Meteor app with TinyTest setup, just connect to
http://localhost:3000 or your specified port, like you would do with a normal meteor app.

#### Run against your local meteor copy

When running `test-packages`, be sure that you use the current directory copy of Meteor instead of
the installed version. Here is the INCORRECT way: `meteor test-packages`.

The CORRECT way is to use `./meteor test-packages` to run the full test suite against the branch you
are on.

This is important because you want to make sure you are running the test-packages command against
the Meteor code on the branch you have pulled from GitHub, rather than the stable Meteor release you
have installed on your computer.

#### Running a subset of tests

You can also just run a subset of tests from one package to speed up testing time. Let's say for
example that you just want to run the Spacebars test suite. Just simple do `./meteor test-packages
./packages/spacebars-tests` and it will just run the test files from that one package. You can
examine the `package.js` file for the `onTest` block, it outlines all the test files that should be
run.
