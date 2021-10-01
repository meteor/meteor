## Meteor Guide “Charter”

### **Vision**

Let's get on the path to having a “Meteor Guide” – the most authoritative, honest, up-to-date, and reliable source of best practices for Meteor. This is not the docs page that describes the technology components of Meteor and their APIs. Instead, the idea is to eventually answer all questions of the form: “How do I do X in Meteor?”

### **Values**

1. Honesty - the content in the guide should be the same advice you would give a trusted friend.
2. Community - the guide should represent the aggregate experience of the Meteor community when it comes to the best way to build an app with Meteor, weighted by the vision of the platform as set by MDG.
3. Comprehensiveness - anything belongs in the guide as long as it's a reasonable thing for people to want to do with the platform. Running in Electron - yes; running on FreeBSD - no.
4. Content-focused - the guide should be in the format best optimized for general consumption, and it should be easy to access the information you want quickly and efficiently. Focus on content over technology.
5. Curation - every guide bakes in a certain set of opinions. There's no way to get around this, so MDG needs to be comfortable taking a clear and well-supported stand on certain issues.
6. Up-to-date - it should be easy to update so that we don't drag our feet on deploying new changes.
7. Realistic - the guide should address real-life use-cases and developer goals first, and avoid contrived examples. It's not about demonstrating how to use technology, it's about showing people how to get their work done.
8. Focus on the intermediate developer - the guide is not for beginners who are writing their first app, and it's not for the super hackers that can code their way out of anything. The guide is for normal developers trying to get the job done.

### **Methods**

1. :white_check_mark: Put the guide in a new repository so that it can be discussed and contributed to independently of the Meteor framework.
2. :white_check_mark: Set up a standard static site generator that will be easy for people to understand and contribute to.
3. :white_check_mark: Set up a continuous deployment system to automatically deploy changes from GitHub, so that we can't forget to deploy a new version.
4. :white_check_mark: Build in support for versioning docs via branches so that people can easily access documentation for previous Meteor releases.
5. Ensure great SEO so that people can find documentation items through Google or other search engines.
6. Don't put guide-appropriate information anywhere else, like the GitHub Wiki, READMEs, or similar, so that people don't have to guess where information might be hidden.
7. :white_check_mark: Make contributing to the guide the easiest way to contribute to the Meteor project, by adding “edit this page” buttons everywhere.
8. Be proactive in evaluating and accepting community contributions.
9. Be clear about why contributions are and are not accepted, and write these down in a living document about how to craft a great contribution to the guide.
10. Hire a technical writer to help efficiently produce great content and ensure everything is nice to read, consistent in style, and free of grammatical errors or stylistic issues.
11. :white_check_mark: Organize guide content by developer goals rather than API methods. It's possible that some sections will lack Meteor API information entirely, if the Meteor API doesn't help with any of those goals. API documentation is a separate app we'll need to built some other time.
12. :white_check_mark: Put community packages and MDG packages on a more even footing by sometimes endorsing the community solution over the MDG one when it's better.
13. Figure out a way to user test the guide to see if it helps developers achieve their goals.
14. Loop in every framework developer to get input on the parts of the framework with which they are most familiar.
15. Add a section to each article that has related links that people can submit - for example links to packages that people have written to help with a certain task, or how-to articles on someone's blog. Heading could be “other articles on the web”.

### **Obstacles**

1. Historical reluctance to endorse community packages
2. Changes to the Meteor API can make large parts of the guide outdated quickly
3. Large amount of existing source material in random locations - GitHub Wiki, etc
4. Maintaining high quality and cohesion in the face of numerous authors and contributions
5. Getting engineers to write docs/guides as part of our process and culture
6. Lack of clear guidance from the framework on many topics, such as testing and app architecture

### **Goals**

1. :white_check_mark: Develop a skeleton for a guide app, with nice styles and a clear path to adding more content [firm]
2. :white_check_mark: Have continuous deployment set up for at least two branches of the new guide repository [firm]
3. Migrate all existing content onto the guide website from docs.meteor.com, GitHub Wiki, and READMEs (I'm looking at you, Spacebars) [firm]
4. Hire one technical writer
5. :white_check_mark: Have an “edit on GitHub” button on every single page
6. Review every guide contribution within one week of submission and give a conclusive response
7. Accept 50 community pull requests
