SeededRandom = function(seed) { // seed may be a string or any type
  if (! (this instanceof SeededRandom))
    return new SeededRandom(seed);

  seed = seed || "seed";
  this.gen = Random.create(seed).alea; // from random.js
};
SeededRandom.prototype.next = function() {
  return this.gen();
};
SeededRandom.prototype.nextBoolean = function() {
  return this.next() >= 0.5;
};
SeededRandom.prototype.nextIntBetween = function(min, max) {
  // inclusive of min and max
  return Math.floor(this.next() * (max-min+1)) + min;
};
SeededRandom.prototype.nextIdentifier = function(optLen) {
  var letters = [];
  var len = (typeof optLen === "number" ? optLen : 12);
  for(var i=0; i<len; i++)
    letters.push(String.fromCharCode(this.nextIntBetween(97, 122)));
  var x;
  return letters.join('');
};
SeededRandom.prototype.nextChoice = function(list) {
  return list[this.nextIntBetween(0, list.length-1)];
};
