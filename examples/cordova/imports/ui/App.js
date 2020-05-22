import React from 'react';
import {Hello} from './Hello';
import {Info} from './Info';
import {User} from "./User";

export const App = () => (
  <div>
    <h1>Welcome to Meteor!</h1>
    <Hello/>
    <Info/>
    <User/>
  </div>
);
