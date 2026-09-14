import imagePublic from '@public/1x1-public.jpg';
import React from 'react';

import './main.css';
import { Hello } from './Hello.jsx';
import { Info } from './Info.jsx';
import imageGenerated from './images/1x1-js.png';

export const App = () => (
  <div>
    <h1>Welcome to Meteor!</h1>
    <Hello />
    <Info />
    <img id="image-generated" src={imageGenerated} alt="1x1 pixel imported in JS" />
    <img id="image-public" src={imagePublic} alt="1x1 pixel imported in JS" />
  </div>
);
