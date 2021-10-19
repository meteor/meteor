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
    * Be careful about where you do this, the best way is to have the page component and layouts responsible for this
        * Otherwise, complications can arise when doing transitions between pages, since the parameters are changing
    * Getting the currently active route
    * Getting the parameters
    * Highlighting the currently active route
* Using the router to display templates/pages
    * Layouts
    * Using Blaze Layout
    * Most of the logic is inside a template which represents a page
        * The template is the place to do business logic, for example, showing people a screen that tells them to log in to see this content
        * Sometimes, you might want to abstract this into a layout
        * See more of these patterns in the data loading and Blaze chapters
* Changing routes
    * Getting the URL for a target route
    * Displaying a link
    * Going to a route programmatically
    * Setting individual parameters with Flow Router
    * Setting a parameter with serialized JSON data
* Redirects
    * Redirecting when a page has been moved to a different URL
    * Redirecting when data has been moved
    * Redirecting when user is not allowed to see this page
    * Redirecting a default route to a specific one
    * Redirecting after an asynchronous operation
        * Should you do this optimistically? See the UX chapter
        * Redirecting after an insert to go to the newly inserted item
        * Redirecting after a delete to go to a different page
* Special cases
    * What to do when data on this URL has been deleted - 404
* Analytics for URLs
    * Link to the production guide about analytics, not in this article
* Server-side routing
    * Blaze doesn't currently support server side rendering, but React does - link to article
    * HTTP API routes not in this article
