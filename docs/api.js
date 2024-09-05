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
            "description": "Provides functions related to user authorization. Compatible with built-in Meteor accounts packages.\n\nRoles are accessible through `Meteor.roles` collection and documents consist of:\n - `_id`: role name\n - `children`: list of subdocuments:\n   - `_id`\n\nChildren list elements are subdocuments so that they can be easier extended in the future or by plugins.\n\nRoles can have multiple parents and can be children (subroles) of multiple roles.\n\nExample: `{_id: 'admin', children: [{_id: 'editor'}]}`\n\nThe assignment of a role to a user is stored in a collection, accessible through `RoleAssignmentCollection`.\nIt's documents consist of\n - `_id`: Internal MongoDB id\n - `role`: A role object which got assigned. Usually only contains the `_id` property\n - `user`: A user object, usually only contains the `_id` property\n - `scope`: scope name\n - `inheritedRoles`: A list of all the roles objects inherited by the assigned role."
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