import React from 'react';
import { ApolloProvider, ApolloClient, InMemoryCache } from '@apollo/client';
import { Hello } from './Hello.jsx';
import { Info } from './Info.jsx';

const client = new ApolloClient({
  uri: '/graphql',
  cache: new InMemoryCache(),
  /* Uncomment this for accounts use
  request: operation =>
    operation.setContext(() => ({
      headers: {
        authorization: Accounts._storedLoginToken()
      }
    }))
   */
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
