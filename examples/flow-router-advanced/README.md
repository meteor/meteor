## Flow Router Authorization - Advanced

This example illustrates a pattern for reuse of template-based authorization.  

Slides for related talk available here: http://slides.com/alanning55/a-pattern-for-flowrouter-auth#/


Features:

* Modular directory structure - different sections of the application are split out into separate directories
* Re-usable, nestable templates for handling authorization (dubbed "auth controllers")
* Authentication handled by the app's main layout.

NOTE: The app structure and reusable, template-based authorization pattern is not unique to FlowRouter.  It can also be used with IronRouter.
