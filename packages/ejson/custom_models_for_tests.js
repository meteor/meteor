import { EJSON } from './ejson';

class Address {
  constructor(city, state) {
    this.city = city;
    this.state = state;
  }

  typeName() {
    return 'Address';
  }

  toJSONValue() {
    return {
      city: this.city,
      state: this.state,
    };
  }
}

EJSON.addType('Address', value => new Address(value.city, value.state));

class Person {
  constructor(name, dob, address) {
    this.name = name;
    this.dob = dob;
    this.address = address;
  }

  typeName() {
    return 'Person';
  }

  toJSONValue() {
    return {
      name: this.name,
      dob: EJSON.toJSONValue(this.dob),
      address: EJSON.toJSONValue(this.address),
    };
  }
}

EJSON.addType(
  'Person',
  value => new Person(
    value.name,
    EJSON.fromJSONValue(value.dob),
    EJSON.fromJSONValue(value.address)
  )
);

class Holder {
  constructor(content) {
    this.content = content;
  }

  typeName() {
    return 'Holder';
  }

  toJSONValue() {
    return this.content;
  }
}

EJSON.addType('Holder', value => new Holder(value));

const EJSONTest = {
  Address,
  Person,
  Holder,
};

export default EJSONTest;
