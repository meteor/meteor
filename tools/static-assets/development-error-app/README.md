# development-error-app

This app is displayed whenever a user's app is crashing, displaying the logs
in a simple browser window instead of returning the original static HTML page.
Since this is a Meteor app, the client maintains a live DDP connection and thus
can seamlessly switch over to their regular application once they've fixed the
error and the app has reloaded. The error-app shows the user a status when their main app is refreshing.
