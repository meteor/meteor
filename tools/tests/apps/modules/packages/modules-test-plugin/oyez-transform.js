module.exports = function () {
  return {
    visitor: {
      StringLiteral: function (path) {
        if (path.node.value === "OYEZ") {
          path.node.value = "ASDF";
        }
      }
    }
  };
};
