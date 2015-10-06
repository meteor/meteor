# Meteor Guide Plan

This is focusing on the guide chrome and structure, not text style or content. Also it does a good deal of assuming that popular means it's pretty good. Either way, we should probably catch up to the state of the art before we try to surpass it.

## Examples

* React: https://facebook.github.io/react/docs/getting-started.html
* Rails: http://guides.rubyonrails.org/
* Django: https://docs.djangoproject.com/en/1.8/
* Ember.js: http://guides.emberjs.com/v2.0.0/templates/conditionals/
* Firebase has a great design/navigation structure. I think the three-level nav is pretty great: https://www.firebase.com/docs/android/guide/understanding-data.html
* Stripe: https://stripe.com/docs

## Observations

1. Split into pages - the fact that you can't infinitely scroll makes the information seem more digestible
2. Search isn't necessary - React and Rails don't have it. Presumably SEO is much more important.
3. There are introductory landing pages
    1. Some summarize the different parts of the framework
    2. React has a super quick getting started guide
4. Tables of contents are by theme/activity/section, not sorted by API methods. Although there is also a place to get an API reference, it's de-emphasized
    1. “Forms”
    2. “Layouts and Rendering in Rails”
    3. “Introduction to Migrations”
5. React has an “edit on GitHub” button
6. React's docs are built with Jekyll: https://github.com/facebook/react/blob/master/docs/README.md
    1. I feel like if React's docs aren't built with React, we can stomach not building our docs in Meteor
    2. Hosted on GitHub pages
7. Django and Rails have ways to get at docs for different versions, React doesn't
8. Don't really differentiate tutorials and guide articles

## Properties we want

1. Make this guide the most authoritative, honest, and reliable source of best practices for Meteor. This should be exactly the same as what you would tell a trusted friend or paying customer to do in their app.
2. Super easy to add content - there should never be a good reason to *not* put something in the guides/docs. There should be an infinite black hole of content, such that adding more content doesn't detract from what we already have.
3. Has all of the content - We should be able to replace basically all of our READMEs, wiki pages, external docs sites, tutorials, etc. with one website that has all of the MDG-produced educational content that's out there. Blog posts and similar are fine for temporary content.
4. Great SEO - Everyone just searches on Google to figure out how to do stuff. They should land on our docs if that is the best resource.
5. Versioning - There are lots of benefits to having versioned docs, in particular that we don't have to keep backcompat with the old URLs etc. This can be as simple as deploying a new site for each release of Meteor.
6. Encourage contributions - if someone got stuck on something, they should be able to suggest changes to the docs and we need a mechanism for accepting them. Also, contributing to the docs is the easiest path to starting out as an open source contributor.
7. Don't be afraid of endorsing community packages that are part of the current best practice.
8. Don't be afraid of writing down sketchy workarounds because they are embarrassing.
9. Actually user test the guide on people we consider to be in our target audience. We could partner with an existing education provider to teach a class with it.

## Things we can compromise on

1. Backwards compatibility with [docs.meteor.com](http://docs.meteor.com/) - This constraint has stopped us from innovating on the docs before. We shouldn't have to keep backcompat with all of the URLs, etc. If we figure out a way to properly version the docs such that all of the URLs are also versioned, we can avoid this problem in the future.
2. Built-in search. SEO is more important, and we should have good organization so that people can use the nav to find stuff.
3. Using Meteor. We should take the shortest path to a great experience, and we know that Meteor isn't optimized for sites with huge amounts of static content.
4. Fancy features. Most guides are just plain text, organized in pages with a table of contents. If Rails can get by with that, we can too. Let's focus on writing great content over creating a fancy UX, at least to start with.

## Questions

1. Is it better to have the docs/guides in the same repository as the code?
    1. Benefits
        1. Can be versioned together
        2. A single pull request can contain docs and code for a feature
    2. Drawbacks
        1. Only works if the entire framework is in one repo - won't scale if we have separate repos anyway
        2. Harder for people to maintain translations
        3. Harder to discover where the docs live - a lot of people don't even know they are in meteor/meteor/docs
    3. Current decision
        1. Looks like separate repo is winning!

## Technology options

1. GitHub pages
    1. Benefits
        1. Built-in continuous integration
        2. Guaranteed to load super fast and not have server-side dynamics
        3. Fairly standard for a wide variety of GitHub documentation
        4. Built for large websites with lots of markdown content
        5. Hosted by GitHub for free
        6. Restricted features mean it's easier for people to contribute
    2. Drawbacks
        1. Not JavaScript
        2. No easy way to look at versions, you only get one github pages site per repo/organization
2. Custom site
    1. Benefits
        1. We can build appropriate abstractions
        2. JavaScript
        3. Could build versioning mechanism
    2. Disadvantages
        1. Custom stack could make it harder for people to contribute (although this could be mitigated by separating the complex code from the markdown content)
3. Custom Jekyll setup
    1. Do continuous integration ourselves, with branches for different versions
4. ReadTheDocs
    1. Not an option - the existing templates are terrible
5. Readme.io
    1. Not an option - docs live online and not in the repo

## Action items

1. Sashko will figure out where we can host a continuously deployed basic Jekyll site, where we can have different versions built from different branches.
    1. Deliverable: proof of concept simple site deployed from two branches
    2. Stretch: deploy examples from pull requests
