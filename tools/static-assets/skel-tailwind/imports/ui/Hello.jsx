import React, { useState } from 'react';

export const Hello = () => {
  const [counter, setCounter] = useState(0);

  const increment = () => {
    setCounter(counter + 1);
  };

  return (
    <div className="mt-4">
      <button
        onClick={increment}
        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-full"
      >
        Click Me
      </button>
      <p>You've pressed the button <b>{counter}</b> times.</p>
    </div>
  );
};
