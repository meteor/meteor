import React from 'react';
import { InMemoryCache, ApolloProvider, ApolloClient, ApolloLink, HttpLink } from '@apollo/client';
// import { MeteorAccountsLink } from 'meteor/apollo'
import { Hello } from './Hello.jsx';
import { Info } from './Info.jsx';

const cache = new InMemoryCache().restore(window.__APOLLO_STATE__);

const link = ApolloLink.from([
  // MeteorAccountsLink(),
  new HttpLink({
    uri: '/graphql'
  })
]);

const client = new ApolloClient({
  uri: '/graphql',
  cache,
  link,
});

export const App = () => (
  <ApolloProvider client={client}>
    <div>
      <h1>Welcome to Meteor! ☄</h1>
      <Hello/>
      <Info/>
    </div>
  </ApolloProvider>
);
