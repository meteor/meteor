import { ApolloServer } from '@apollo/server';
import { WebApp } from 'meteor/webapp';
import { getUser } from 'meteor/apollo';
import { LinksCollection } from '/imports/api/links';
import typeDefs from '/imports/apollo/schema.graphql';
import express from 'express';
import { expressMiddleware } from '@apollo/server/express4';
import { json } from 'body-parser';

const resolvers = {
  Query: {
    getLink: async (obj, { id }) => LinksCollection.findOne(id),
    getLinks: async () => LinksCollection.find().fetch()
  }
};

const context = async ({ req }) => ({
  user: await getUser(req.headers.authorization)
})

const server = new ApolloServer({
  cache: 'bounded',
  typeDefs,
  resolvers,
});

export async function startApolloServer() {
  await server.start();

  WebApp.handlers.use(
    '/graphql',                                     // Configure the path as you want.
    express()                                       // Create new Express router.
      .disable('etag')                              // We don't server GET requests, so there's no need for that.
      .disable('x-powered-by')                      // A small safety measure.
      .use(json())                                  // From `body-parser`.
      .use(expressMiddleware(server, { context }))  // From `@apollo/server/express4`.
  );
}
