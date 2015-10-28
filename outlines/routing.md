# Routing

* What is routing, and how it's different in a client-rendered app
    * Uses for the URL
        * Bookmarking
        * Sharing
        * Back/forward
    * It's a useful serialization of some share-able, bookmarkable client-side state
        * Not everything needs to be a route - consider that you can just store JavaScript variables, or use local storage for temporary information
    * Routing is not related to data loading or authorization in a client-side app. For those, go see the security and data loading chapters
* Flow Router intro
* Creating routes
    * How to define a basic route
    * How to accept route parameters and URL pattern matching
    * When to use query parameters vs. path parameters
* Getting information about the current route
    * Getting the parameters
    * Highlighting the currently active route
* Using the router to display templates/pages
    * Layouts
    * Using Blaze Layout
    * Most of the logic is inside a template which represents a page. Read more in the data loading and Blaze chapters
* Changing routes
    * Getting the URL for a target route
    * Displaying a link
    * Going to a route programmatically
* Redirects
    * Redirecting when a page has been moved to a different URL
    * Redirecting when data has been moved
    * Redirecting when user is not allowed to see this page
    * Redirecting a default route to a specific one
    * Redirecting after an insert to go to the newly inserted item
    * Redirecting after a delete to go to a different page
* Special cases
    * What to do when data on this URL has been deleted - 404
* Analytics for URLs
    * Link to the production guide about analytics, not in this article
* Server-side routing
    * Blaze doesn't currently support server side rendering, but React does - link to article
    * HTTP API routes not in this article
