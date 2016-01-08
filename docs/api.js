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
            "description": "Provides functions related to user authorization. Compatible with built-in Meteor accounts packages.\n\nIt uses `roles` field to `Meteor.users` documents which is an array of subdocuments with the following\nschema:\n - `_id`: role name\n - `partition`: partition name\n - `assigned`: boolean, if the role was manually assigned (set), or was automatically inferred (eg., subroles)\n\nRoles themselves are accessible throgh `Meteor.roles` collection and documents consist of:\n - `_id`: role name\n - `children`: list of subdocuments:\n   - `_id`\n\nChildren list elements are subdocuments so that they can be easier extended in the future or by plugins.\n\nRoles can have multiple parents and can be children (subroles) of multiple roles.\n\nExample: `{_id: \"admin\", children: [{_id: \"editor\"}]}`"
        },
        {
            "displayName": "UIHelpers",
            "name": "UIHelpers",
            "description": "Convenience functions for use on client.\n\nNOTE: You must restrict user actions on the server-side; any\nclient-side checks are strictly for convenience and must not be\ntrusted."
        }
    ],
    "elements": []
} };
});