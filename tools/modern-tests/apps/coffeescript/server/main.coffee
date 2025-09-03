import { Meteor } from 'meteor/meteor'
import { LinksCollection } from '/imports/api/links.coffee'

insertLink = ({ title, url }) ->
  await LinksCollection.insertAsync({ title, url, createdAt: new Date() })

Meteor.startup ->
  # If the Links collection is empty, add some data.
  if await LinksCollection.find().countAsync() is 0
    await insertLink
      title: 'Do the Tutorial'
      url: 'https://react-tutorial.meteor.com/simple-todos/01-creating-app.html'

    await insertLink
      title: 'Follow the Guide'
      url: 'https://guide.meteor.com'

    await insertLink
      title: 'Read the Docs'
      url: 'https://docs.meteor.com'

    await insertLink
      title: 'Discussions'
      url: 'https://forums.meteor.com'

  # We publish the entire Links collection to all clients.
  # In order to be fetched in real-time to the clients
  Meteor.publish "links", ->
    LinksCollection.find()
