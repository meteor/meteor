import { ApolloServer } from '@apollo/server';
import { WebApp, WebAppInternals } from 'meteor/webapp';
import { getUser } from 'meteor/apollo';
import { LinksCollection } from '/imports/api/links';
import typeDefs from '/imports/apollo/schema.graphql';
import { expressMiddleware } from '@apollo/server/express4';

const express = WebAppInternals.NpmModules.express.module;

const resolvers = {
  Query: {
    getLink: async (obj, { id }) => LinksCollection.findOneAsync(id),
    getLinks: async () => LinksCollection.find().fetchAsync()
  }
};

const context = async ({ req }) => ({
  user: await getUser(req.headers.authorization)
});

const server = new ApolloServer({
  cache: 'bounded',
  typeDefs,
  resolvers,
});

export async function startApolloServer() {
  await server.start();

  WebApp.handlers.use(
    '/graphql',                                     // Configure the path as you want.
    express.json(),
    expressMiddleware(server, { context }) // From `@apollo/server/express4`
  );
}
