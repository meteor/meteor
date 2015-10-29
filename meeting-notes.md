## Initial meeting about guide website

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
