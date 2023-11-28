import { ApolloServer, ExpressContext } from 'apollo-server';
import { WebApp } from 'meteor/webapp';
import { getUser } from 'meteor/apollo';
import { LinksCollection } from '/imports/api/links';
import typeDefs from '/imports/apollo/schema.graphql';
import express, { Request, Response } from 'express';
import { ApolloServerExpressConfig } from 'apollo-server-express';
import { json } from 'body-parser';

interface Link {
  id: string;
  url: string;
}

const resolvers = {
  Query: {
    getLink: async (obj: any, { id }: { id: string }): Promise<Link | null> => LinksCollection.findOne(id),
    getLinks: async (): Promise<Link[]> => LinksCollection.find().fetch()
  }
};

const context = async ({ req }: ExpressContext): Promise<{ user: any }> => ({
  user: await getUser(req.headers.authorization)
});

const server = new ApolloServer({
  cache: 'bounded',
  typeDefs,
  resolvers
} as ApolloServerExpressConfig);

export async function startApolloServer(): Promise<void> {
  await server.listen();

  WebApp.connectHandlers.use(
    '/graphql',                                     // Configure the path as you want.
    express()                                       // Create new Express router.
      .disable('etag')                     // We don't server GET requests, so there's no need for that.
      .disable('x-powered-by')             // A small safety measure.
      .use(json())                                  // From `body-parser`.
      .use(expressMiddleware(server, { context })), // From `@apollo/server/express4`.
  );
}