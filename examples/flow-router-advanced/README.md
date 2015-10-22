## Flow Router Authorization - Advanced

This example illustrates a pattern for reuse of template-based authorization.  It also illustrates a modular way to structure your application where different sections of the application are split out into separate directories.

Authentication is handled by the app's main layout.

Authorization is handled by special wrapper templates called "controllers" which can be reused between various routes.


NOTE: The app structure and reusable, template-based authorization pattern is not specific to FlowRouter.  It can be done just as easily using IronRouter.
