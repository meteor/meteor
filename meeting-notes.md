## Standup 16th Nov

With Tom, Zol and Sashko.

### Agenda:

- Progress, will we get this done by mid Dec?
- Aligning the guide with M1.3 and vice versa.
- Plan around testing & M1.3, what's the low hanging fruit and who does it?
- Blaze.

### Notes:

- Some chapter are easier and will definitely be done on time. 
- Tests, i8n, etc - shouldn't try to have real world coverage.
- Cut scope instead of pushing back the date.
- Do we cut scope by not doing articles?
- Let's re-visit next week when we've had a chance to do some writing.
- Incorporate Matt's feedback on the app structure chapter by revisiting outlines (ex modules).
- Current guide is sort of a requirements for modules.
- Proceed as plan on the Blaze chapter.
- Method package. Good feedback from Robert on the README.

### Action items:

- Setup a meeting with Ben to go over the implications of modules both on the guide and vice versa. Start with Sashko's highlevel questions then work through points found in the outlines that are impacted by modules.
- Should clean up the guide repo a little bit. Make sure github issues are updated with the outlines. Get the community people back into the conversation. Post on the forums.
- Polish up the Method package readme and docs and post it for feedback on the forums.
- Create package for validation error format, get feedback.
- Ask if something like cursor-utils exists (on the forums).
 

## Standup 12th Nov

With Zol, Tom, Sashko and Matt

### Agenda:

- Feedback and sign off on outlines so far.

### Notes

- Matt found it hard to read the outlines and conclude if it was correct.
- No mention of jobs or workers.
- Move deployment to a more prominent place in the guide.
- Feels like about the right amount of stuff.
- Maybe there's a good way to prioritize the issues.
- Guide is sort of targetted at 1.3 but since modules aren't there yet guide still targets 1.2.
- We should be opinionated in the guide.
- Clear point of view about what kind of app you're building (e.g MVP) is missing.
- Rails guide has something like this, maybe we're missing an intro section.
- Be aggressive about ES2015, a lot of people don't know it so we should be really upfront. Highlight the linter and our linting rules.
- Looking at article ordering...
- Flag save() in Collections & Modles and come back to it
- Should forms and methods go in the same section?

*Matt's Ordering for articles (TBD):*
- App Structure
- Collections and Schemas (migrations)
- Data Loading/Publications
- Methods (stubs, optimistic UI)
- Routing
- UI-UX / Blaze in here somewhere
- Everything else...

- Detailed walk through.
- *App Structure:*
- 1. Sounds great.
- Things seem reasonable but we're just going to have to see the text.
- 2. ok.
- 3. This is a bummer for Matt, that the small & medium apps are different. Modules could unify this. Matt wishes instead of S, M, L we had a taxonomy that didn't make you classify your app in one of these categories.
- We should fold modules into the mix early on.
- 1. Let's not target something that doesn't exist yet
- 2. We believe modules are the correct thing to document in the guide.
- 3. Let's make sure we aren't making any bad decisions on modules that would be obvious if we applied the guide to our current module plan.
- Rather than small medium large, Matt would be comfortable if there was a recommended app structure and progressive enhancement.
- ** Speak to Ben ** Matt would delay M1.3 into Jan if it meant writing the guide first would tell us how to solve the load order problem and hook we need to write app tests.
- 7ii) Tell people just to use submodules for private packages with local package. Put PACKAGE_DIRS in the package chapter (if at all).
- We can link out to other articles on the web, e.g for large app structure.
- Section 7 seems like a separate article to Matt.
- *Collections:*
- Matt thinks we didn't like Collection2
- Can we put Collection2 in core?
- Matt is surprised that designing your schema doesn't come earlier.
- 4. custom mutators belongs in the methods chapter.
- 8,9 are all just links. Matt and Tom are confused whether we're linking to things we use or are popular. 
- Consider removing 9.
- Does 7i) go higher up? 
- 8i) SimpleSchema link should go in it's own section. 
- *Data Loading*
- 1. Spot on.
- 3. Switch ii & iii.
- 4 i, ii) About right.
- ! The guide should have a server performance article. E.g it's really easy to write slow queries. !
- 5. Looks good. Perhaps shouldn't be in this section.
- Move 5&6 out of here.
- 7ii) Investigate, actually use publish-composite
- Remove 7iii)
- Matt suggests a section called using the low level publish API.
- Turn 9ii) into 11 so it's side by side with 10.
- *Forms and Methods*
- Maybe there's two parts to this, the distinction between defining them and calling them.
- ! 1ii) Get the package out to the broader community. ! Prioritize wrapping it up along with a forum post.
- 1-7 seems about right. Better discussed with some content around it.
- Thing Matt would push on hard is seeing what we can line up with 1.3, especially a half reasonable story with modules as the best structure for all apps, and if this happens to give us a good story for testing that's great.
- ! write up a sketch/proposal for fixing app testing !
- Go all in on ES15, this is the opportunity for us to lay down what a proper ES15 app looks like.
- Let's get another 2 hours on the calendar for next week.


## Standup 9th Nov

With Zol, Tom, Evan and Sashko

### Agenda:

- Progress.
- Thoughts on testing.
- Meeting Matt on Thu for feedback.

### Notes

- Deployment is merged to master. CirclCI is set up to push to s3 on a push to master. Branches with the version prefix will be pushed to deploy. Edit circle.yaml to push a specific branch. 
- QA push to deploy.
- Open issues in Github for feature requests. Use the 'website' label.
- Each article should have the title meta block. Use relative links when linking to content.
- Functional site with navbars and decent styling by the end of the week. Presentable.
- Tom: most of the big ticket conversion is done. Big ticket item left on todos is testing - unfortunately there is actually not much out there in for testing, lack of mocks. We could build stuff that would fill significant gaps. PR against Meteor out there that enables method mocking, this is required in addition to mocking publications as well as ... Todos app has some unit tests but not great coverage. End-end tests with Gagarin seems like a good approach.
- Open question on building unit test infrastructure?
- Leave testing questions till after the guide.
- Still on track to have todos done by Wed.
- Remember we want an iterative process.
- Tom to get gagarin, selenium, CI done. Identify the risks and try to eliminate the largest one.
- On track for 2 articles drafted this week.

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
