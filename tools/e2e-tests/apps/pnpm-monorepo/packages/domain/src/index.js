const createMessage = (target, value) => {
  return `domain:${target}:${value}`;
};

export const createClientMessage = value => {
  return createMessage('client', value);
};

export const createServerMessage = value => {
  return createMessage('server', value);
};
