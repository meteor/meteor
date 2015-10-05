YUI.add("yuidoc-meta", function(Y) {
   Y.YUIDoc = { meta: {
    "classes": [
        "Roles",
        "UIHelpers"
    ],
    "modules": [
        "Roles",
        "UIHelpers"
    ],
    "allModules": [
        {
            "displayName": "Roles",
            "name": "Roles",
            "description": "Provides functions related to user authorization. Compatible with built-in Meteor accounts packages."
        },
        {
            "displayName": "UIHelpers",
            "name": "UIHelpers",
            "description": "Convenience functions for use on client.\n\nNOTE: You must restrict user actions on the server-side; any\nclient-side checks are strictly for convenience and must not be\ntrusted."
        }
    ]
} };
});