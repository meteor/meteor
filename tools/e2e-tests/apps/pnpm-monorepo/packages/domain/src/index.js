import Color from 'color';

// `color` is an external npm dependency of this workspace package. It pulls a
// multi-level transitive tree that pnpm never hoists to the app's node_modules:
//   color -> color-convert -> color-name
//   color -> color-string -> simple-swizzle -> is-arrayish
// Computing the value at module load means a broken transitive resolution fails
// the build instead of silently passing.
const accentHex = Color('rgb(64, 224, 208)').hex();

const createMessage = (target, value) => {
  return `domain:${target}:${value}`;
};

export const createClientMessage = value => {
  return createMessage('client', value);
};

export const createServerMessage = value => {
  return createMessage('server', value);
};

export const accentColor = accentHex;
