# Runners

The Meteor tool process would run multiple big "parts" that should be managed:
started, stopped, restarted, monitored for crashes, etc.

The interface that Meteor tool uses is called a "runner".

Some of the runners run sub-processes. The main runner is called `run-all`, it
has sub-runners such as `run-app`, `run-mongo` and `run-proxy`. Other runners
are used for different CLI commands.

## Run Log

The output of the runners (compilation errors, state change, etc), should be
reported through the Run Log. Run Log is also something that users see in their
browsers, when their app breaks.
