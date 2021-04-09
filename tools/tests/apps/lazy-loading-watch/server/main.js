import { Meteor } from 'meteor/meteor';
import { LinksCollection } from '/imports/api/links';
import {MY_CONSTANT_SERVER} from "../infra/constants-server";
import {MY_CONSTANT_BOTH} from "../infra/constants-both";

function insertLink({ title, url }) {
  LinksCollection.insert({title, url, createdAt: new Date()});
}

console.log('Server', MY_CONSTANT_SERVER)
console.log('Server', MY_CONSTANT_BOTH)

Meteor.startup(() => {
  // If the Links collection is empty, add some data.
  if (LinksCollection.find().count() === 0) {
    insertLink({
      title: 'Do the Tutorial',
      url: 'https://www.meteor.com/tutorials/react/creating-an-app'
    });

    insertLink({
      title: 'Follow the Guide',
      url: 'http://guide.meteor.com'
    });

    insertLink({
      title: 'Read the Docs',
      url: 'https://docs.meteor.com'
    });

    insertLink({
      title: 'Discussions',
      url: 'https://forums.meteor.com'
    });
  }
});
