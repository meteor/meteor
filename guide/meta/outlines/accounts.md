1. What does Meteor do for you?
    1. Standardized concept of userId in DDP
    2. accounts-base package that has a standard user database, and can be plugged with different login systems
2. The fastest way to get set up for a prototype: accounts-ui
    1. List of easy to set up login providers, code examples
    2. Read more about accounts user interfaces later
5. The useraccounts package for a production-grade login UI
    1. Pick the right package based on your CSS framework
    2. Get help from splendido to flesh out this section - just the basics, then link to the docs
    3. Figure out what to do about useraccounts and adding fields to profile
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
        5. Generating HTML or text emails on the server using template strings
4. OAuth login
    1. Meteor has core packages for some of the most common login services
    2. Facebook
    3. GitHub
    4. Google
    5. Twitter
    6. Meetup
    7. Meteor Developer Accounts
    8. Getting extra data from the OAuth services
    8. Building your own OAuth login handler [XXX not done, perhaps to be filled in later]
3. Accessing user data
    1. Meteor.userId() and Meteor.user() on the client
    2. this.userId on the server
    3. Meteor.users collection
6. Adding custom data about users
    1. Adding new top-level fields onto the users collection
    2. How and why to disable profile
    3. Publishing custom user data
    4. Why top-level fields are better than nested objects in DDP (link to collections/schema article)
    5. Security concerns - don't accidentally publish secret data to the client
7. Allowing the same user to log in through different methods - “account merging”
    1. Update the existing account using requestCredential
    2. accounts-meld in case you want to do more complicated things, but make sure you understand the risk!
        1. Check out this package for security
    2. There's a community project in progress to make this simpler
8. Authentication, roles, and permissions
    1. alanning:roles
    2. Read about hiding certain views from people in the Routing chapter
