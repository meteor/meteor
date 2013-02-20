Tinytest.add("spark - controller OO", function (test) {

  var array = [];

  var FooController = Spark.Landmark.extend({
    constructor: function () {
      array.push('a');
      Spark.Landmark.apply(this, arguments);
      array.push('b');
    }
  });

  var BarController = Spark.Landmark.extend({
    constructor: function () {
      array.push('c');
      FooController.apply(this, arguments);
      array.push('d');
    }
  });

  var bar = new BarController();
  test.equal(array.join(''), 'cabd');
});