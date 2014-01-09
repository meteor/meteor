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

function Person (name, dob, address) {
  this.name = name;
  this.dob = dob;
  this.address = address;
}

Person.prototype = {
  constructor: Person,

  clone: function () {
    return new Person(this.name, this.dob, this.address);
  },

  equals: function (other) {
    return EJSON.stringify(this) == EJSON.stringify(other);
  },

  typeName: function () {
    return "Person";
  },

  toJSONValue: function () {
    return {
      name: this.name,
      dob: EJSON.toJSONValue(this.dob),
      address: EJSON.toJSONValue(this.address)
    };
  }
}

_.extend(Person, {
  fromJSONValue: function(value) {
    return new Person(
      value.name,
      EJSON.fromJSONValue(value.dob),
      EJSON.fromJSONValue(value.address)
    );
  }
});

EJSON.addType("Person", Person.fromJSONValue);

_.extend(EJSONTest, {
  Address: Address,
  Person: Person
});