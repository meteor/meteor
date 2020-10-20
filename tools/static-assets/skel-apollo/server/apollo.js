import { ApolloServer } from 'apollo-server-express';
import { WebApp } from 'meteor/webapp';
import { getUser } from 'meteor/apollo';
import { LinksCollection } from '/imports/api/links';
import typeDefs from '/imports/apollo/schema.graphql';

const resolvers = {
  Query: {
    getLink: (obj, { id }) => LinksCollection.findOne(id),
    getLinks: () => LinksCollection.find().fetch()
  }
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: async ({ req }) => ({
    user: await getUser(req.headers.authorization)
  })
});

server.applyMiddleware({
  app: WebApp.connectHandlers,
  cors: true
});
