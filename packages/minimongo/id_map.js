LocalCollection._IdMap = function () {
  var self = this;
  IdMap.call(self, LocalCollection._idStringify, LocalCollection._idParse);
};

LocalCollection._IdMap.prototype = IdMap.prototype;

