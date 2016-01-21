## Standup 20th Jan

With Zol, Sashko, Tom, Matt.

### Notes

- Guide should reflect view layer strategy. Blaze is in there and we document best practices. Guide should also document our recommendations with respect to React and Angular.
- Modules and Testing are critical.
- Modules and Blaze integration points should tie in well, make sure the situation is reasonable.
- Blaze, people have been wondering how to use the same template name, i.e this is what modules would solve.
- Might make sense to leave Blaze as it is, have a sane way to put js+css in the same dir as your html.
- Currently Templates are still global and if you use a helper that hasn't been imported code blows up at run time.
- Where do template go in an Angular 2 app? Maybe it would inform what we should do.
- Deal with how Blaze works right now, work on adding React and Angular to the guide later.
- 100% start writing about application structure.
- Avi is working on the testing stuff as we speak, Tom to sync up with him.
- Time to validate testing implementation and guide article and validate it with bigger Meteor users. Workpop. Asaf in Israel (medical app).
- What to do about forms? We're still talking about autoform and Blaze. Reason it's not in the guide is the todos app doesn't have enough forms to show much. Are we going to build new example app with lot's of forms? Definitely relevant to the view layer question. We don't have autoform for React.
- It's ok if the first version of the React chapter in the guide doesn't address as much about forms as the blaze version and/or requires more manual labour than autoform.
- Ideal outcome is in time for 1.3 we had some chapter for React and Angular 2, even if it's a short chapter. We need to document the Meteor/Angular/React bindings.
- Sashko non-negotiable article: application structure, testing (complete and awesome). Want to have: barebones React/Angular articles (to replace existing websites). Question Mark: mobile, es2015 code style, forms. Less clear that we need them immediately. We should enlist Martijn to help write mobile article.
- 1.3 is probably toward the end of February.
- This adds up according to Tom.
- Thoughts on long term maintenance? Don't know yet. In the medium term Tom feels like the natural person to be point on that, probably as a coordinator.

### Decisions

- Matt priority order: App structure, Testing, Mobile <-> React/Angular, Forms - items 1&2 are essential, others could slip to after 1.3 (good chance we'll defer mobile improvements to 1.3.1), could lean on the view team for React/Angular.
- Tom on point for app structure and testing (including updating the todos example app), view team writing Angular/React stuff with Tom's guidance. Martijn to write the mobile chapter. This is the goal for 1.3. Forms is a nice to have which can come later.
- There's more work to do with fully integrating the guide into the website, tutorials, etc.

## Standup 4th Jan

With Zol, Sashko.

### Notes

- Testing, forms and app structure blocked on more 1.3 stuff.

### Decisions

- Ignore code style article this week.
- Sashko to work on 'soft launch meta issues' cleanup ticket in the next week, then do data stuff till Tom gets back.
- Sashko to see what is left for us to be able to 1.3 preview release.
- Sashko to try and massage todos to work with 1.3 preview, commenting out tests if necessary.

## Standup 14th Dec

With Zol, Tom, Sashko.

### Agenda
- Progress, soft launch?

### Notes
- If Accounts, Deployment finished, we could be done.
- Forms sticks out.
- Reasonable to message that certain articles are blocked on 1.3
- Email to the big mailing list to see what people think. We're pretty sure on all the articles that are drafted.
- How do we make the example app presentable?
- Unknowns in forms article?
- Janky packages in todos right now, mostly around testing.
- Example app should address the set of articles we'll promote.
- Sashko can write the content but not maintain the linting config, need a lint config maintainer (Tim).

### Action Items

- 'Soft Launch' becomes promoting content so far for holiday reading, with a disclaimer that more exciting content is in the works aligning with 1.3
- Clean up todos app wrt to XXX's. Rename packages not part of the app to fork-something.
- Everything in drafts-in-progress will be drafted and promoted by the end of the week.
- Order the articles in the website.

## Standup 9th Dec

With Zol, Matt, Tom, Sashko.

Agenda:

1. Guide social promotion tasks from Dan
  1. Fix URLs [done]
  2. See if we can put up a banner reminding people it’s in progress and we’re looking for contributions
  3. Make a list of interesting nuggets to tweet about
    1. Ever wanted to know what happens when a Meteor Method is called? http://guide.meteor.com/methods.html#call-lifecycle
    2. Read our recommendations about routing in Meteor: http://guide.meteor.com/routing.html
    3. Learn how to secure your Meteor app: http://guide.meteor.com/security.html
  4. Figure out when we should do a big marketing push with the initial release
2. Talk about 7 principles with Matt
3. Mid-dec soft release, what is it?
4. Blaze?

### Notes

- App Structure and Code Style split.
- Sashko to work with Tim on code style.
- Forms not started yet.
- Tom is working on welcome outline.
- Split up testing article into Test Runner CI, and how to test methods/other individual components will go into their own section.
- Definitely in the Guide is for 1.3 mindset.
- Line up guide preview release roughly with 1.3 preview release.
- Stick to our goals of initial draft releases by mid Dec.
- Eventually move to a world where API docs are purely generated from jsdoc
- We're recommending Blaze, you can use React & Angular, not recommending them as a first choice because of existing packages.
- Where do we tell people how to use javascript? Don't need to do it in the guide, link to a great resource.
- Testing: We'll have guidance for end to end tests. Assuming modules get done nicely and have everything we need we'll have testing for the guide.
- What happens to specs for modules and testing so that guide can sync up with features that are coming.

### Action Items

- Take a crack at 250-400 words at what Meteor is from the point of a Developer. Maybe distill some updated principles.
- Quietly drop 7 prinicples under a deprecated commit.
- Matt to get design docs for testing and modules.

## Standup 2nd Dec

With Tom, Zol, Sashko and Matt

## Notes

- Outstanding product questions: Blaze, Methods, Linting.
- Setting up a process to resolve these questions.
- Matt re: 1.3. We ought to write the Guide for 1.3 . Use it to promote the things that are exciting in 1.3, e.g ES2015 modules, things that come up in a larger app,
- Dream scenario would be when we release 1.3, there is a guide in place written for it that steers people on the leading edge of what’s in 1.3 . That guide has been floating around for a while and we’ve been iterating on it and getting comments on it as the lead up to 1.3 . Feedback loop between the guide, community and product.
- Guide to steer polish of modules rather than large efforts.
- Theme that works for 1.3 - it’s the Meteor release for large apps. Targetted at the things that come up when you have a larger app.
- How do we systemize the collaboration of the Guide Team.
- Platform team is to drive the 1.3 release cycle.
- The platform team (Ben, Avi, Martin) are keen to work with the guide team.
- Guide team become customers for the platform team.
- Take plan to existing customers.
- Should we be writing a Blaze article?
- Complicated question.
- Is it a blog post?
- Bookmark the Blaze conversation - the urgency is high.
- Make a decision by the end of the week.
- Linting: Existing linter config. Would be cool to put the config and meteor integration into the Guide.
- Politics of applying linting config to the entire Meteor codebase?
- Matt is in favor of advocating for one code style.
- Leave meteor/meteor unlinted.
- Maybe style guide, linter chapter.

## Action Items

- Make a decision on Blaze by the end of the week.
- Maintain Meteor eslint style config in npm.
- Linting to go into Guide.
- Move weekly check-in to Wednesdays (this same time works).

## Standup 1st Dec

With Tom, Zol and Sashko

### Agenda

- Progress?
- Website QA

### Notes

- We'll all do a round of QA on the website before Evan completely moves onto other things.
- Merge Security and Data article in the next 24 hours.
- Sashko to clean up other cruft.
- Article draft velocity is good, easy articles are done.
- Should we write a guide on Blaze?
- Testing and App structure require too many decisions.
- Taking these 3 out will maybe have the other articles drafted by the end of the week (*Tom optimism*)
- Demoting publishing a package to an 'article idea' rather than a first class article.
- Mini-app with forms in it?
- Split Forms/Methods article into 2, Methods and Forms. Definitely get the Methods done and maybe get the Forms done, note Forms requires a mini example app.
- Remember we should make some nice diagrams some time.

### Action Items

- Tom+Sashko - UI/UX, what should we do about internationalization?
- Do we write a Blaze article? - part of discussion with Matt tomorrow.
- Sit down and resolve tiny decisions in each article to get them to draft stage.
- Tom to do Mobile (until we know more).
- Sashko to do Methods.

## Standup 23rd Nov

With Evan, Tom, Sashko, Zol

### Agenda

- Article writing cadence, how did we go last week?
- Website progress, when can we expect the TODOs finished?
- Modules collabororation with Ben, does this require more structure than ad-hoc. Are there blockers?

### Notes

- Sashko got help up with customer day and publishing method package.
- Sashko has done more than half of the security article.
- Tom has done collections and data loading along with some other code things.
- Some XXX's still around.
- Tom feels confident on everything apart from the testing article and structure article.
- Perhaps Tom and Sashko should swap on the form article.
- Tom suggests we could drop the testing and app structure articles because they're hard to write and in the air.
- The other is blaze.
- Prioritize 1.3 related articles to the end and let's calibrate our writing velocity on the less nebulus articles.
- Trade methods<->routing. 
- Tom will do Routing, UI/UX this week.
- Sashko focused on Security, Build Tool, Accounts.
- Most of the static stuff is good, 3 things left on the TODO
- Use swifttype for search integration.
- Headings should function as table of contents in a book.
- Add one more level of nesting.
- Deploy guide to guide.meteor.com, add Do Not Read banner.
- Evan will work on todos tomorrow, check most of them before holiday (goal for this week).
- Ideally after this week Evan wants to focus primarily on blaze.
- We'll QA it next week, then after another pass over these we'll be done.
- Modules converstion with Ben not an urgent issue right now because of our priorties.
- Testing is a big body of work without ownership.
- Shared document(s) regarding features Ben is planning to build. Currently no two way channel between the guide and Ben
- Let's figure out this channel of comms (to be realtime).
- Who is the product manager and who is the customer. Zol to ask Matt.

### Action Items

- Zol meet with Matt re: modules/testing product plan.

## Modules meeting 18th Nov

With Ben, Matt, Tom, Zol, and Sashko.

We talked about what would need to be supported by ES2015 modules in Meteor 1.3 for us to switch to that for the guide.

Forum post here: https://forums.meteor.com/t/ideas-from-mdg-meteor-1-3-the-meteor-guide-and-es2015-modules/13591

- **Testing**: Realistically we need a sensible way to unit test a module in a reasonably isolated way.
  - Ben: Perhaps testing just comes down to not eagerly-loading application code, and just loading the modules you want to test?
  - Tom: Whole app testing might not actually be related to modules. We should just find out if we can simulate the `meteor test-packages` experience with a module. This is basically “compile the package as usual, but also include the `onTest` files and dependencies”.
  - Ben: We could just have a “sub-app” in `test/` that is loaded when you are running tests, and those could have modules that are test-only.
  - Could we have `.meteor/packages` just specify which packages are test-only, dev-only, etc. For example, you could have `mocha` as an app dependency, but only in test mode.
  - You’d also have an eagerly-loaded test runner where you can register tests to be run.
  - `meteor test` could accept an argument that filters the tests based on the name they were registered with, or the module in which the tests are defined. Should also start a test database, etc.
  - Matt would like to see the hypothetical guide article that outlines how you write and run your tests in the module world. Then we can make sure the module system supports all of that.
  - Tom will write the testing article against an idealized module system, if we ship the guide before modules ship, we’ll just omit that section or put it in some “future” area.
- **Blaze**: How do blaze templates, which don't have any concept of `import`/`export`, work with this? Can you co-locate templates and their JS logic?
  - We could make these lazily evaluated, and only be executed when you import them
  - `{{> templateName}}` means `Template.templateName`. In module world, do we need to first `import templateName from ‘../module/templateName.html’` somehow? Answer: no, given the other discussions about Blaze/React, it's not worth making major changes to the Spacebars syntax at the moment.
  - Sashko/Matt say - it’s OK if all template files are eagerly evaluated and work as they do now. Sashko says it’s important to him that all code can be put in the `imports` directory, including templates, so that we can make the code structure nice for the guide.
  - For further discussion: How important is it that feature code (JS, HTML, CSS, images, etc) can be co-located?
- **Build plugins**: Do build plugins work as-is? how do you use modules with CoffeeScript, does this open up TypeScript? Have we compared what we are building to what is needed by the Angular/Angular2 community? What about CSS pre-processors?
  - The dependency tree is analyzed based on the output code - so as long as the CoffeeScript compiler outputs `require(‘myFile.coffee’)`, we’ll detect that dependency.
  - LESS does all of its own importing and exports CSS, which could either be added as a style tag or a JavaScript resource. The CSS pre-processor stuff isn't affected by ES2015 module work for Meteor 1.3, and will work just as before.
- **Meteor package system**: What’s it for? Should people start shipping reusable Meteor code on NPM as of 1.3?
  - Meteor packages are really good at doing totally different things on the client and the server - you can set up the full stack just by adding the package
  - For example, for DDP, you’d need to `import ‘ddp/client’` on the client and `import ‘ddp/server’` on the server if you want different functionality, but in a Meteor package you can just use `ddp` and it does the right thing.
  - `client/` and `server/` directories in NPM packages don’t have a special meaning at the moment, but they could - or we could have a special `package.json` format. Probably won't tackle this for 1.3.
  - If you don’t have the above special build system requirements, there is basically no reason you need to publish your package on Atmosphere over NPM - this also removes the need for robotic wrapper packages that just re-bundle the same code that's already on NPM.
- **Assets**: What about assets like fonts and images? In the current package system, you can organize them in `package.js`, but in a Meteor app today you'd have to put everything in `public/`. What do you do in module world?
  - Modules are about loading things that compile to JavaScript code
  - Images aren’t something you would ‘require’ since there is no JavaScript content involved
  - Perhaps you should be able to stick images anywhere in the app (not just `public/`), and have a sane way of referring to them
  - Idea from Sashko: Perhaps we want `getPathToAsset(‘../relative/path’);`, so that you can put images next to templates and refer to them without having to know the absolute path to the containing directory.
- **Apps with multiple entry points/UIs/services**: Right now, you can have lots of packages and lots of apps, is this possible with modules? Do you need to make modules into NPM packages for this? Are Meteor packages still the way to go? If so, do you still need to list all of the files?
  - Didn't have time to address this in the meeting.
- **Cordova**: Can you import Cordova plugins?
  - We don’t yet have a good mental model here yet. It would be nice if you could import a cordova plugin, and make sure the necessary side effects run.
  - These things can work like “legacy” meteor packages - the dependency scanner doesn’t need to understand them. This is one advantage over using Webpack in Meteor 1.3 - it assumes everything is a node-style JavaScript module.
- **File structure**: Do we want to keep the  `imports` directory convention proposed in the PR?
  - Ben says backwards compatibility with the existing loading logic was important to him, and `imports` is just one way to get that.
  - Other ways are special file names, special comments, etc.
  - Matt says this directory should sound more “default” and less “opting into a fancy new feature”
  - Ben said one big reason was that the LESS package picked this name. `modules` is another possibility, feels like `node_modules`. This is kind of a bike-shedding topic overall.
  - We could also have an app “control file” that just specifies entry point. Either a JSON file we can statically read, or a JavaScript file that just imports stuff inside conditionals somehow.

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

- Setup a meeting with Ben to go over the implications of modules both on the guide and vice versa. Start with Sashko's highlevel questions then work through points found in the outlines that are impacted by modules. (Sashko + Tom working on doc with questions, Zol to schedule meeting)
- Should clean up the guide repo a little bit. Make sure github issues are updated with the outlines. Get the community people back into the conversation. Post on the forums. (Sashko)
- Polish up the Method package readme and docs and post it for feedback on the forums. (Sashko)
- Create package for validation error format, get feedback. (Tom) (Blocking publishing methods)
- Ask if something like cursor-utils exists (on the forums). (Tom)
 

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
