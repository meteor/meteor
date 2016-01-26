# Contributing to Mocha

Hi!  We could use your help.  Let us help you help us.  Or something.

## General

1. If you are looking for a place to begin, **please send PRs for bugfixes instead of new features**, and/or **look for issues labeled `PR PLEASE`.**

2.  **Help with documentation and the wiki is always appreciated**.

3.  Please **be courteous and constructive** when commenting on issues, commits, and pull requests.

## Bug Reports & Issues

1.  When reporting a bug, please **provide steps to reproduce**.  If possible, show code.
  
2.  Please **show all code in JavaScript**.  We don't all read `<insert-language-that-compiles-to-JavaScript-here>`.  If you do not, you will be asked to.

3.  Because Mocha works with many third-party libraries and tools, **ensure the bug you are reporting is actually within Mocha**.

4.  If you report a bug, and it is inactive for a significant amount of time, it may be closed.  **Please respond promptly to requests for more information**.

## Pull Requests

1. Before sending a large PR, it's recommended to **create an issue to propose the change**.  Nobody wants to write a book of code and throw it away.

2.  Because Mocha should be kept as maintainable as possible, its codebase must be kept slim.  Historically, *most PRs for new features are not merged*.  New features inevitably increase the size of the codebase, and thus reduce maintainability.  Only features *deemed essential* are likely to be merged--this is at the discretion of the maintainer(s).  If your PR for a feature is not merged, this doesn't necessarily mean your PR was a bad idea, wouldn't be used, or otherwise sucks.  It just means **only essential PRs for new features are likely to be merged**. 

3.  Due to the above, before creating a PR for a new feature, **create an issue to propose the feature.**

4.  Please **respect existing coding conventions**, whatever those may be.

5.  If your PR has been waiting in limbo for some time, it's very helpful to **rebase against master**, which will make it easier to merge.

6.  Please **add tests for new code**.

7.  **Always run `npm test` before sending a PR.**  If you break the tests, your PR will not be accepted until they are fixed.

## Source Control

1. Please **squash your commits** when sending a pull request.  If you are unfamiliar with this process, see [this guide](https://help.github.com/articles/about-git-rebase/).  If you have already pushed your changesets and are squashing thereafter, this may necessitate the use of a "force push".  Please [read the docs](http://git-scm.com/docs/git-push) before you attempt this. 
 
2. Please **follow the commit message conventions [outlined here](https://medium.com/code-adventures/git-conventions-a940ee20862d).**

## TL;DR

**Be kind, be diligent, look before you leap into a PR, and follow common community conventions**.

*- The Mocha Team*
