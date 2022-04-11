import React, { useState } from 'react';

export const Hello = () => {
  const [counter, setCounter] = useState(0);

  const increment = () => {
    setCounter(counter + 1);
  };

  return (
    <div className="bg-white shadow sm:rounded-lg mb-4">
      <div className="px-4 py-5 sm:p-6">
        <div className="sm:flex sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center">
              <h3 className="text-3xl text-gray-900 font-bold">
                Welcome to Meteor!
              </h3>
              <div>
                <svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 400 400"><g fill="#DE4F4F"><path d="M286.575 306.886L44.755 49.922l256.962 241.82c4.312 4.056 4.518 10.837.46 15.146-4.053 4.31-10.832 4.518-15.144.46-.15-.14-.318-.31-.458-.462M251.032 325.01L68.692 127.528 266.177 309.87c4.35 4.013 4.618 10.794.604 15.144-4.018 4.35-10.794 4.617-15.146.604-.2-.19-.413-.406-.602-.607M214.083 325.542L92.907 194.272 224.18 315.446c2.898 2.676 3.077 7.197.402 10.098-2.677 2.896-7.195 3.082-10.097.402-.136-.125-.277-.272-.402-.405M315.612 234.685L189.102 98.078 325.71 224.585c2.896 2.684 3.067 7.203.387 10.1-2.682 2.895-7.2 3.066-10.098.387-.13-.123-.268-.258-.388-.387M304.697 272.93L121.567 74.655l198.274 183.13c4.35 4.017 4.62 10.796.605 15.144-4.017 4.352-10.797 4.617-15.146.604-.205-.19-.418-.404-.603-.605M176.31 314.783l-57.647-62.695 62.692 57.65c1.453 1.334 1.547 3.596.215 5.045-1.338 1.453-3.598 1.55-5.05.215-.072-.07-.144-.143-.21-.215M311.093 189.297l-57.65-62.694 62.696 57.646c1.45 1.335 1.546 3.597.21 5.048-1.335 1.45-3.595 1.547-5.05.21-.07-.065-.143-.143-.207-.21"/></g></svg>
              </div>
            </div>
            <div className="mt-2 max-w-xl text-gray-500 text-lg">
              <p>
                You've pressed the button <b>{counter}</b> times.
              </p>
            </div>
          </div>
          <div className="mt-5 sm:mt-0 sm:ml-6 sm:flex-shrink-0 sm:flex sm:items-center">
            <button
              onClick={increment}
              type="button"
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 text-lg"
            >
              Click Me
            </button>
          </div>
        </div>
      </div>
    </div>
  )
};
