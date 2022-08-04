import { ApolloServer } from 'apollo-server-express';
import { WebApp } from 'meteor/webapp';
import { getUser } from 'meteor/apollo';
import { LinksCollection } from '/imports/api/links';
import typeDefs from '/imports/apollo/schema.graphql';

const resolvers = {
  Query: {
    getLink: async (obj, { id }) => LinksCollection.findOne(id),
    getLinks: async () => LinksCollection.find().fetch()
  }
};

const server = new ApolloServer({
  cache: 'bounded',
  typeDefs,
  resolvers,
  context: async ({ req }) => ({
    user: await getUser(req.headers.authorization)
  })
});

export async function startApolloServer() {
  await server.start();
  const app = WebApp.connectHandlers;

  server.applyMiddleware({
    app,
    cors: true
  });
}
