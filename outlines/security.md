# Security

1. Main concept: Security surface area of a Meteor app
    1. The way to security is to understand the attack surface, and guard against all possible attacks
    2. Conclusion: Never Trust The Client - anyone can call all of your app's endpoints, not just the client you wrote. There's no way to guard against this, so you may as well not even try. Consider projects like SnapchatFS
    3. It's not always clear where the server ends and the client begins in a Meteor app, but it's important to be aware of that for security
2. Methods
    1. Don't write generic methods, make sure you know what each argument is exactly, and what it could do
    2. Rate limiting as a first line of defense against brute force
    3. Make sure method side effects don't give away information. For example, returning how many items were affected should only tell the user about documents they should be able to access
    4. Use this.userId, never take the current user as an argument in a method
    5. Always include the user ID and any prerequisites in the selector part of every update query, in case that stuff changed since you did the security check. This is the only way to do "atomic" updates in Mongo.
    6. Check types, use audit-argument-checks and check-checker
3. Publications
    1. Most of the points about methods are still relevant!
    2. Publications re-run when the user ID changes (describe this in detail)
    3. Don't let people pass arbitrary queries into publications, this is bad both for performance and securityu. this includes not taking arbitrary options, so make sure to validate any sort or limit data that comes from the client, and impose a max limit.
    4. Make sure to filter the data using specific queries and field projections so that the client can't get anything sensitive
4. Served files
    1. Your source code can contain secret information. If you have code with secret stuff in it:
        1. Consider putting the secrets in settings
        2. If that's not possible, make sure the file is in private/ or server/ so that it's not exposed to the client
        3. Any settings files should be in private or a dotted folder like .config? This saves you from a poorly-coded .json build plugin exposing your file
5. Secret keys in settings.json
    1. Have a different settings file for each environment
    2. Don't keep them in source control? If not, then where? LastPass?
    3. Server only vs. client/server settings
6. Roles and permissions
    1. alanning:roles
    2. Ownership of documents and having different permission levels per-document
7. SSL is absolutely crucial for any serious app
    1. How to set up SSL in different environments (perhaps, part of the deployment chapter)
8. Common mistakes/checklist [cite Josh Owens checklist here!]
    1. insecure
    2. autopublish
    3. filtering fields and data in publications
    4. publishing user documents with sensitive data
    5. exposing information through method side effects, like number updated - can be fixed via rate limiting
    6. use specific selectors - for example, always include the user ID
    7. secure the data, not the routes - redirecting away from a client-side route does nothing for security, it's just for UX
    8. check types everywhere it is reasonable to do so
        1. methods
        2. publications
    9. don't use user profile field unless you really know what you're doing
        1. deny updates to user collection! **is this a code item?**
    10. don't use {{{ ... }}} unless you really know what you are doing
    11. don't ever trust user IDs passed from the client, and make sure anything that takes a user ID as an argument isn't callable from the client. Use this.userId inside methods
    12. audit-argument-checks
        1. Also, check-checker - investigate which? both?
        2. check-checker should use the Meteor 1.2 linter API **code item**
    13. browser policy
        1. But know that not all browsers support it so it's mostly a convenience/extra layer thing
    14. make sure secret keys aren't in source code
    15. No allow/deny **code item to disable allow/deny**
    16. Use package scan as a safety net
