function rstestError(code, message) {
  const error = new Error(`[Meteor Rstest] ${message}`);
  error.code = code;
  return error;
}

module.exports = {
  rstestError,
};
