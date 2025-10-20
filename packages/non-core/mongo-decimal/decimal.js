import { CBOR } from 'meteor/harry97:cbor';
import { Decimal } from 'decimal.js';

Decimal.prototype.typeName = function() {
  return 'Decimal';
};

Decimal.prototype.toJSONValue = function () {
  return this.toJSON();
};

Decimal.prototype.clone = function () {
  return Decimal(this.toString());
};

CBOR.addType('Decimal', function (str) {
  return Decimal(str);
});

export { Decimal };
