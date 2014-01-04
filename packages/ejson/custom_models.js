function Address (city, state) {
  this.city = city;
  this.state = state;
}

Address.prototype = {
  constructor: Address,

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

  toEJSONValue: function () {
    return {
      name: this.name,
      dob: this.dob,
      address: this.address
    };
  }
}

_.extend(Person, {
  fromEJSONValue: function(value) {
    return new Person(value.name, value.dob, value.address);
  },
  typeName: 'Person'
});

EJSON.addType(Person);

_.extend(EJSONTest, {
  Address: Address,
  Person: Person
});