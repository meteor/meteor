This folder contains libs for printing output in response to CLI commands.

`progress.js` defines the lib for printing a progress-bar, so the long
operations don't look like hanging.

`console.js` exposes the `Console` singleton that should be used through-out the
tool to print messages with the right level of importance. It also knows how to
correctly repaint the progress-bar, so the two don't conflict.
