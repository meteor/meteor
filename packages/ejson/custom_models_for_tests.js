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

function Holder (content) {
  this.content = content;
}

Holder.prototype = {
  constructor: Holder,

  typeName: function () {
    return "Holder";
  },

  toJSONValue: function () {
    return this.content;
  }
}

_.extend(Holder, {
  fromJSONValue: function(value) {
    return new Holder(value);
  }
});

EJSON.addType("Holder", Holder.fromJSONValue);

_.extend(EJSONTest, {
  Address: Address,
  Person: Person,
  Holder: Holder
});