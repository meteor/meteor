import React from 'react';
import { Hello } from './Hello.jsx';
import { Info } from './Info.jsx';

export const App = () => (
  <div className="max-w-3xl min-h-screen mx-auto sm:pt-10">
    <Hello/>
    <Info/>
  </div>
);
