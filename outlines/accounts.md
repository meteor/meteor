1. What does Meteor do for you?
    1. Standardized concept of userId in DDP
    2. accounts-base package that has a standard user database, and can be plugged with different login systems
2. The fastest way to get set up for a prototype- accounts-ui
    1. List of easy to set up login providers, code examples
    2. Read more about accounts user interfaces later
3. Password login
    1. accounts-password gives you password login with username, email, or both
    2. How to require username, email, or both
    3. Dealing with multiple email addresses
    4. The case insensitivity issues - working with Meteor 1.2+ password accounts. Basically, don't access Meteor.users directly.
    5. Email flows
        1. Enrollment email
        2. Reset password
        3. Verify email
        4. How to customize emails
4. OAuth login
    1. Meteor has core packages for some of the most common login services
    2. Facebook
    3. GitHub
    4. Google
    5. Twitter
    6. Meetup
    7. Meteor Developer Accounts
    8. Building your own OAuth login handler
5. The useraccounts package for a production-grade login UI
    1. Pick the right package based on your CSS framework
    2. Get help from splendido to flesh out this section - just the basics, then link to the docs
    3. Figure out what to do about useraccounts and adding fields to profile
6. Adding custom data about users
    1. Why it's not great to add to the default user collection
        1. How to disable profile
    2. Creating a new collection called UserProfiles and denormalizing the right data there
    3. Using a collection helper to get the profile for a user
7. Allowing the same user to log in through different methods - “account merging”
    1. Update the existing account using requestCredential
    2. There's a community project in progress to make this simpler
8. Authentication, roles, and permissions
    1. Read about roles and permissions in the security article
    2. Read about hiding certain views from people in the Routing chapter (XXX perhaps we should move that stuff here instead?)
