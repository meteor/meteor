function Address (city, state) {
  this.city = city;
  this.state = state;
}

Address.prototype = {
  constructor: Address,

  clone: function () {
    return new Address(this.city, this.state);
  },

  equals: function (other) {
    return EJSON.stringify(this) == EJSON.stringify(other);
  },

  typeName: function () {
    return "Address";
  },

  toJSONValue: function () {
    return {
      city: this.city,
      state: this.state
    };
  }
}

EJSON.addType("Address", function fromJSONValue(value) {
  return new Address(value.city, value.state);
});

_.extend(EJSONTest, {
  Address: Address
});