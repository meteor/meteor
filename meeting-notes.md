## Standup 9th Nov

### Agenda:

- Progress.
- Meeting Matt on Thu for feedback.

## Standup 5th Nov

With Zol, Tom, Evan and Sashko

* Only a couple hours work for the code.
* Stick to 2 articles per person per week schedule.
* Aim to have complete but rough articles by mid Dec rather than better articles with some incomplete.
* Two articles will be complete by the end of next week.
* Evan has made a staging s3 bucket - http://meteor-guide-staging.s3-website-us-west-1.amazonaws.com/
* SEO is important, when folks search for something they should find hits from the latest version of the guide unless they explicitly search for a specific version.
* Master at /, other versions/branch at /version/
* If the user is not on a page for the latest version, display a banner telling them so (with a link to the latest).
* Guide will live at guide.meteor.com
* Mid next week for infrastructure part of Guide website (push to deploy)
* Use css classes for components
* We can (should) use themes to customize.
* Don't worry about Markdown consistency for the first pass. Do it later.
* We realized there are no good form examples in the Todos app.
* The two options are rewrite Microscope with forms and the guided approach or build something else.
* Revisit this Monday week after having built 2 articles.
* Schedule 2 hour meeting with Matt once Todos is done to walk through the code and outlines.


## Meeting about example app and post-outline plans 4th Nov

#### Meeting part 1 with Tom

1. Do modules solve testing the same way packages do? If so, this means we don't need package-focused apps anymore
2. Let's unprefix the file names in packages - so it's OK to just have a file called methods.js and not lists-methods.js, since the package is already called lists
3. Prefix the package names with app- instead of todos- it's silly to have a package called todos-todos
4. should stub collections be debugOnly? Open question
5. Tom has the linter running in his editor, Sashko should add it to his Atom

#### Splitting up tasks for the todos example app:

* Application Structure - Sashko
* Less / CSS / PostCSS - Sashko
* Methods - remove allow/deny - Sashko
* Using Stores + Template level subscription - Tom
* Simple Schema / Collection 2 - Tom
* Autoform - Sashko
* User Accounts - Sashko
* LaunchScreen (add to mobile article) - Sashko
* Momentum - Tom
* “Componentize” Blaze templates - Tom
* Tests - Tom
* Deploy to Galaxy w/ Kadira - Tom

**Action item:** File all of these as issues on meteor/todos

#### Meeting part 2 with Zol

1. When is an article moved to the example app column? When it is fully reflected in meteor/todos
2. Todos is the only complete example app we care about - all other code snippets can be written as we go, and don't need to be from a particular app. They will be filled in during the first draft phase.
3. Sashko took some time for on-call stuff, so we can push back the example app deadline to Monday/Tuesday
4. Zol should look at https://github.com/meteor/guide/blob/master/meeting-notes.md#initial-meeting-about-guide-website-29th-oct and meet with Evan about planning

#### Quick discussion about code tasks (labeled `code` in the guide repo)

1. Testing packages - we'll find out more as we test Todos
2. Cursor utils - shouldn't be hard
3. Complex authorization means a way to re-run publications when authorization data changes - could be easy to add a small API
4. Badge against master and devel - sashko is working on it
5. Update meteor create - we can do this after we finish the initial guide
6. Methods package - sashko is already doing this as part of Todos
7. Best JS validation library - we are going with SS, let's close it
8. Modify simple-schema to work like check, make autoform accept errors
9. Validation error format + there needs to be a “core” error package that supports it
10. Remove/rename mutator methods - not necessary if we just split by dots
11. Make dotted names is not a big deal

## Initial meeting about guide website 29th Oct

With Evan and Sashko

1. Evan has experience with Hexo, so we can get going the fastest using that
    1. You can see an example at http://vuejs.org/guide/
2. Deployment
    1. Continuously deployed from one or more branches
        1. Different branches will eventually be different versions/languages
    2. Deployment from PRs is a nice to have
    3. Deployment location - whatever is easiest
        1. Digital ocean
        2. S3
3. UI components
    1. A component for representing an external packages
        1. https://www.dropbox.com/s/w5229hslbcl7gql/Screenshot%202015-10-29%2013.46.40.png?dl=0
    2. Citing an external source or article
    3. Table of contents
        1. Could be in the sidebar, or at the top of the page
4. Navigation structure
    1. To start, two types of content
        1. Guide articles
        2. Random articles like how to install mobile stuff on Mac OS
    2. In the future, an API reference section
5. Get a design from Dom
    4. Ask him if he has time
    5. We want the navbar from meteor.com (http://meteor.com/) eventually
5. Invite Evan to checkin meeting

## Standup 26th Oct

With Zol, Tom, and Sashko

### Decisions

- Sashko/Tom will create Pull Requests with completed outlines and the other person will merge and/or discuss first. The outlines will stay in a separate
file to the finished articles.
- Todos will live in a new repo.
- All outlines dones this week.
- Example code the week after.
- Outlines will be completed before example code is written.
- Zol: Figure out how/when to get Matt's buy in.
- Zol: Check whether it's true that Evan can build the website.
- Zol: Find someone to proof/edit the english.


## Standup 16th Oct

With Zol, Tom, and Sashko

### Decisions

* Will be tracked via waffle on Github: [done](https://waffle.io/meteor/guide?label=article)
* Tool to build the website will be: MD, static website, continuous deployment, github backed, public, accept pull requests supports multiple versions. Sidebar, versions selector.
* Design/Branding will be done as a pass over the content, rather than a top-down design process.

### Approach

1. Deciding what the articles are and first pass of outline. [Done]
2. Second pass on outlines/polish - publishing decisions so far, soliciting community response with decisions and feedback. Action items/etc in GH issues. Setup waffle/etc [In progress].
3. Apply decisions to example app.
4. Content - Per article states (empty, outline, RFC, rough content, first draft). All articles in 'first draft' state == First draft milestone.

### Milestones

* All ideations initiated
* All outlines written
* First draft -> concerted effort to get feedback from everyone (Mid Dec)
* Website, CI, and tooling set up (Mid Dec)
* Visual design finalized (Mid Dec)
* Soft launch of entire site (Christmas)
* Content edited in detail, link on the homepage (Early Feb)
