import React from 'react';
import { Hello } from './Hello.jsx';
import { Info } from './Info.jsx';

export const Home = () => (
  <div>
    <h1>Welcome to Meteor!</h1>
    <Hello/>
    <Info/>
  </div>
);
