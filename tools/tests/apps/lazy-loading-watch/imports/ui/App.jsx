import React from 'react';
import {Hello} from './Hello.jsx';
import {Info} from './Info.jsx';
import {MY_CONSTANT_CLIENT} from "../../infra/constants-client";
import {MY_CONSTANT_BOTH} from "../../infra/constants-both";

export const App = () =>
  (
    <div>
      <h1>Welcome to Meteor!</h1>
      <p>{MY_CONSTANT_CLIENT}</p>
      <p>{MY_CONSTANT_BOTH}</p>
      <Hello/>
      <Info/>
    </div>
  );
