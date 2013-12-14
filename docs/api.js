YUI.add("yuidoc-meta", function(Y) {
   Y.YUIDoc = { meta: {
    "classes": [
        "HandlebarsHelpers",
        "Roles"
    ],
    "modules": [
        "HandlebarsHelpers",
        "Roles"
    ],
    "allModules": [
        {
            "displayName": "HandlebarsHelpers",
            "name": "HandlebarsHelpers",
            "description": "Convenience functions for use on client.\n\nNOTE: You must restrict user actions on the server-side; any\nclient-side checks are strictly for convenience and must not be\ntrusted."
        },
        {
            "displayName": "Roles",
            "name": "Roles",
            "description": "Provides functions related to user authorization. Compatible with built-in Meteor accounts packages."
        }
    ]
} };
});