let counter = $state(0);

export const getCounter = () => counter;

export const addToCounter = () => {
  counter += 1;
};
