const enabled = !process.env.DISABLE_REACT_FAST_REFRESH;
const babelPlugin = enabled ?
  require('react-refresh/babel') :
  null;

ReactFastRefresh = {
  babelPlugin,
};
