import React, { useState } from 'react';
import { Meteor } from 'meteor/meteor';

export const Hello = () => {
  const [counter, setCounter] = useState(0);

  const increment = () => {
    setCounter(counter + 1);
    Meteor.call('links.insert', {
      title: `Link #${counter + 1}`,
      url: `https://example.com/${counter + 1}`,
    });
  };

  return (
    <div>
      <button onClick={increment}>Click Me</button>
      <p>You've pressed the button {counter} times.</p>
    </div>
  );
};
