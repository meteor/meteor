// Set up collections.

// On the server, they are backed by
// a MongoDB collections named "lists" and "todos".

Lists = new Meteor.Collection("lists");
// {
//    "name" : "Meteor Principles",
//     "_id" : "8f0f0323-9a52-424b-9a24-cacf0662f0ed"
// }

Todos = new Meteor.Collection("todos");
// {
//   "list_id" : "8f0f0323-9a52-424b-9a24-cacf0662f0ed",
//     "text" : "Data on the Wire",
//     "timestamp" : 1337970786875,
//     "tags" : [
//       "Simplicity",
//       "Better UX",
//       "Fun"
//     ],
//   "_id" : "81b3c12a-5897-4da0-b7ac-11cbe2f7834e"
// }
