# Web Apps

Meteor allows developers to build web applications using front-end frameworks like React, Vue, Blaze, Svelte, and Solid.
This section will help you quickly set up a new MeteorJS project using React.

## Step 1: Install Meteor

Ensure you have the latest official Meteor release installed. You can find installation instructions in our [docs](/about/install.html).

## Step 2: Create a New Project

To create a new project with Meteor and React, use the command:

```shell
meteor create myapp
```

This command sets up a Meteor project with React, allowing you to start developing right away.

You can also add the `--react` option to explicitly choose React, but it's already included by default.
If you prefer TypeScript, simply add the `--typescript` option. 

```shell
meteor create myapp --typescript
```

### Additional Options

Meteor offers flags to generate different types of apps, like choosing a different front-end framework or configurations during project setup.

Additional options are available in the [Meteor CLI](/cli/#meteor-create-app-name) section.

## Step 3: Run Your Project Locally

Navigate into your project directory and start the Meteor server:

```shell
cd myapp
meteor
```

With no arguments, `meteor` runs the project in the current directory in local development mode.
Your application will be running at `http://localhost:3000/`, ready for you to begin development.

## Getting Help

You can find help for using the Meteor command line. Just run `meteor help` to see a list of common commands.
If you want detailed help about a specific command, run `meteor help <command>`. For example, `meteor help create`.

## Next Steps

- Follow the [React](/tutorials/react/index.html) or [Vue](/tutorials/vue/meteorjs3-vue3-vue-meteor-tracker.html) tutorials. New tutorials are coming soon.
- Read about [Cordova for Mobile Apps](/about/cordova.html).
- Explore the [Meteor Guide](https://guide.meteor.com/).
