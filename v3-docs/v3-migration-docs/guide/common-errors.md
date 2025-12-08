# Common Errors

Below you will find a collection of documented common errors you may encounter when migrating from Meteor version 2 to version 3. Each error includes an explanation of why it happens and a recommended solution.

If there is any other issues you think should be here, please report them in our [Forums](https://forums.meteor.com/).

## Cannot Enlarge Memory Array

**Why this happens:**

This error occurs when the memory allocated for the build process is insufficient, often due to the large number of dependencies being processed in the migration to Meteor 3. As you update, the system tries to handle all dependencies, and older or larger packages may cause the build to run out of memory.

**How to solve it:**

To resolve this issue, follow these steps:

1. Temporarily reduce the number of meteor packages in your `.meteor/packages` file by removing non-essential or outdated ones.
2. Rebuild the application with the minimal set of packages.
3. Gradually add back the packages, one at a time, to identify which one(s) might be causing the issue.
4. Update or replace outdated packages as needed.

By reducing the package footprint and updating dependencies, you should be able to complete the migration without memory-related errors.

This error was lastly reported [here](https://forums.meteor.com/t/meteor-update-fails/62171).
