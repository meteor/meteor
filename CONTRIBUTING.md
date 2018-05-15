# Contributing to Meteor

We are excited to have your help building Meteor &mdash; both the platform and the community behind it. Please read the project overview and guidelines for contributing bug reports and new code, or it might be hard for the community to help you with your issue or pull request.

## Project overview

Before we jump into detailed guidelines for opening and triaging issues and submitting pull requests, here is some information about how our project is structured and resources you should refer to as you start contributing.

### Ways to contribute

There are many ways to contribute to the Meteor Project. Here’s a list of technical contributions with increasing levels of involvement and required knowledge of Meteor’s code and operations.  
- [Reporting a bug](CONTRIBUTING.md#reporting-a-bug-in-meteor)
- [Triaging issues](ISSUE_TRIAGE.md)
- [Contributing to documentation](CONTRIBUTING.md#documentation)
- [Finding work](CONTRIBUTING.md#finding-work)
- [Submitting pull requests](CONTRIBUTING.md#making-changes-to-meteor-core)
- [Reviewing pull requests](CONTRIBUTING.md#reviewer)
- [Maintaining a community package](CONTRIBUTING.md#community-package-maintainer)

There are also several ways to contribute to the Meteor Project outside of GitHub, like organizing or speaking at [Meetups](https://www.meetup.com/topics/meteor/) and events and helping to moderate our [forums](https://forums.meteor.com/).

If you can think of any changes to the project, [documentation](https://github.com/meteor/docs), or [guide](https://github.com/meteor/guide) that would improve the contributor experience, let us know by opening an issue in the correct repository!

### Finding work

We curate specific issues that would make great pull requests for community contributors by applying the `pull-requests-encouraged` label ([bugs](https://github.com/meteor/meteor/issues?q=is%3Aopen+is%3Aissue+label%3Apull-requests-encouraged) / [feature requests](https://github.com/meteor/meteor-feature-requests/issues?q=is%3Aopen+is%3Aissue+label%3Apull-requests-encouraged)).

Issues which *also* have the `confirmed` label ([bugs](https://github.com/meteor/meteor/issues?q=is%3Aissue%20is%3Aopen%20label%3Apull-requests-encouraged%20label%3Aconfirmed) / [feature requests](https://github.com/meteor/meteor-feature-requests/issues?q=is%3Aissue%20is%3Aopen%20label%3Apull-requests-encouraged%20label%3Aconfirmed)) are considered to have their details clear enough to begin working on.

Any issue which does not have the `confirmed` label still requires discussion on implementation details but input and positive commentary is welcome!  Any pull request opened on an issue which is not `confirmed` is still welcome, however the pull-request is more likely to be sent back for reworking than a `confirmed` issue.  If in doubt about the best way to implement something, please create additional conversation on the issue.

Please note that `pull-requests-encouraged` issues with low activity will often be closed without being implemented. These issues are tagged with an additional [`not-implemented`](https://github.com/meteor/meteor/issues?utf8=✓&q=label%3Apull-requests-encouraged+label%3Anot-implemented) label, and can still be considered good candidates to work on. If you're interested in working on a closed and `not-implemented` issue, please let us know by posting on that issue.

### Project roles

We’ve just begun to create more defined project roles for Meteor. Here are descriptions of the existing project roles, along with the current contributors taking on those roles today.

#### Issue Triager

Issue Triagers are members of the community that meet with us weekly to help triage Meteor’s open issues and bug reports. Once you’ve begun triaging issues regularly on your own, we will invite you to join our dedicated Slack channel to participate in these regular coordination sessions.

Current Issue Triagers:
- [@hwillson](https://github.com/hwillson)
- [@laosb](https://github.com/laosb)
- [@abernix](https://github.com/abernix)
- [@lorensr](https://github.com/lorensr)

#### Reviewer

Our most regular and experienced Issue Triagers sometimes move on to doing code reviews for pull requests, and have input into which pull requests should be merged.

Current Reviewers:
- [@hwillson](https://github.com/hwillson)
- [@lorensr](https://github.com/lorensr)
- [@abernix](https://github.com/abernix)

#### Core Committer

For now, the only contributors with commit access to meteor/meteor are employees of Meteor Development Group, the company that sponsors the Meteor project. We're actively exploring adding non-MDG core committers who have distinguished themselves in other contribution areas.  

Project Lead: [@benjamn](https://github.com/benjamn)

Current Core Committers:
- [@abernix](https://github.com/abernix)
- [@glasser](https://github.com/glasser)
- [@stubailo](https://github.com/stubailo)

#### Documentation Maintainer

Documentation Maintainers are regular documentation contributors that have been given the ability to merge docs changes on [meteor/docs](https://github.com/meteor/docs).

Current Documentation Maintainers:
- [@abernix](https://github.com/abernix)
- [@lorensr](https://github.com/lorensr)

#### Community Package Maintainer:

Community package maintainers are community members who maintain packages outside of Meteor core. This requires code to be extracted from meteor/meteor, and entails a high level of responsibility. For this reason, community maintainers generally (and currently) must first become an advanced contributor to Meteor core and have 4-5 non-trivial pull requests merged that went through the proper contribution work-flow. At that point, core contributors may make the case for breaking out a particular core package, and assist in the technical process around doing so.

Current Community Package Maintainers:
- [@mitar](https://github.com/mitar) for [Blaze](https://github.com/meteor/blaze)

#### Community Manager

The community manager helps to coordinate resources, documentation, events, and other supportive work needed to ensure the health of the Meteor project.

Current Community Manager:
- [@theadactyl](https://github.com/theadactyl)

### Tracking project work

Right now, the best place to track the work being done on Meteor is to take a look at the latest release milestone [here](https://github.com/meteor/meteor/milestones).  Also, the [Meteor Roadmap](Roadmap.md) contains high-level information on the current priorities of the project.

## Reporting a bug in Meteor
<a name="reporting-bug"></a>

We welcome clear bug reports.  If you've found a bug in Meteor that
isn't a security risk, please file a report in
[our issue tracker](https://github.com/meteor/meteor/issues). Before you file your issue, **search** to see if it has already been reported. If so, up-vote (using GitHub reactions) or add additional helpful details to the existing issue to show that it's affecting multiple people.

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
written with the [correct style](DEVELOPMENT.md#code-style) and *come with tests*.  Read further down
for more details on proposing changes to core code.

## Feature requests

Feature requests are tracked in the [meteor/meteor-feature-requests](https://github.com/meteor/meteor-feature-requests) repository, and include a label that corresponds to the Meteor subproject that they are a part of.

Meteor is a big project with [many sub-projects](https://github.com/meteor/meteor/tree/devel/packages).
There aren't as many [core developers (we're hiring!)](https://www.meteor.io/jobs/)
as there are sub-projects, so we're not able to work on every single sub-project every
month.  We use our [roadmap](Roadmap.md) to communicate the high-level features we're currently prioritizing.

Every additional feature adds a maintenance cost in addition to its value. This
cost starts with the work of writing the feature or reviewing a community pull
request. In addition to the core code change, attention needs to be paid to
documentation, tests, maintainability, how the feature interacts with existing and
speculative Meteor features, cross-browser/platform support, user experience/API
considerations, etc.  Once the feature is shipped, it then becomes the community's responsibility to fix future bugs related to the feature. In case the original author disappears, it's important that the feature has good tests and is widely used in order to be maintainable by other contributors.

For these reasons, we strongly encourage features to be implemented as [Atmosphere or npm packages](http://guide.meteor.com/writing-packages.html) rather than changes to core. Try to re-work your feature request as a minimal set of hooks to core that enable the feature to be implemented as a package.

Feature requests should be well specified and unambiguous to have the greatest chance of being worked on by a contributor.

Finally, you can show your support for (or against!) features by using [GitHub reactions](https://github.com/blog/2119-add-reactions-to-pull-requests-issues-and-comments) or by adding meaningful details which help the feature definition become more clear.  Please do not comment with "+1" since it creates a lot of noise (e-mails, notifications, etc.).

## Triaging issues

A great way to contribute to Meteor is by helping keep the issues in the repository clean and well organized. This process is called 'issue triage' and the steps are described [here](ISSUE_TRIAGE.md).

## Documentation

If you'd like to contribute to Meteor's documentation, head over to https://github.com/meteor/docs and create issues or pull requests there.

## Blaze

Blaze lives in its [own repository](https://github.com/meteor/blaze/) with its own [issue tracker and feature prioritization](https://github.com/meteor/blaze/issues/) and is not tracked within Meteor core.

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
 concerned with the entire experience of developing and deploying
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
same time is hard but incredibly rewarding.  We hope you come to feel the same way.

### Understanding the core

For more information about how to work with Meteor core, take a look at the [Development](DEVELOPMENT.md) document which explains many important details, including how to [run from a checkout](DEVELOPMENT.md#running-from-a-git-checkout), [run tests](DEVELOPMENT.md#tests), and more.

### Proposing your change

You'll have the best chance of getting a change into core if you can build consensus in the community for it. Start by creating a well specified feature request as a Github issue, in the [meteor/meteor-feature-requests](https://github.com/meteor/meteor-feature-requests) repository.

Help drive discussion and advocate for your feature on the Github ticket (and perhaps the forums). The higher the demand for the feature and the greater the clarity of it's specification will determine the likelihood of a core contributor prioritizing your feature by flagging it with the `pull-requests-encouraged` label.

Split features up into smaller, logically separate chunks. It is unlikely that large and complicated PRs will be merged.

Once your feature has been labelled with `pull-requests-encouraged`, leave a comment letting people know you're working on it and you can begin work on the code.

### Submitting pull requests

Once you've come up with a good design, go ahead and submit a pull request (PR). If your PR isn't against a bug with the `confirmed` label or a feature request with the `pull-requests-encouraged` label, don't expect your PR to be merged unless it's a trivial and obvious fix (e.g. documentation). When submitting a PR, please follow these guidelines:

 * Sign the [contributor's agreement](http://contribute.meteor.com/).

 * Base all your work off of the **devel** branch. The **devel** branch
   is where active development happens.  **We do not merge pull requests
   directly into master.**

 * Name your branch to match the feature/bug fix that you are
   submitting.

 * Limit yourself to one feature or bug fix per pull request.

 * Include tests that prove your code works.

 * Follow appropriate style for
   [code contributions](DEVELOPMENT.md#code-style)
   and
   [commit messages](DEVELOPMENT.md#commit-messages)

 * Be sure your author field in git is properly filled out with your full name
 and email address so we can credit you.

### Need help with your pull request?

If you need help with a pull request, you should start by asking questions in the issue which it pertains to.  If you feel that your pull request is almost ready or needs feedback which can only be demonstrated with code, go ahead and open a pull-request with as much progress as possible.  By including a "[Work in Progress]" note in the subject, project contributors will know you need help!

Submitting a pull request is no guarantee it will be accepted, but contributors will do their best to help move your pull request toward release.
