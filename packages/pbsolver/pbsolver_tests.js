Tinytest.add("pbsolver - basic", function (test) {
  var solver = new PBSolver();
  test.equal(solver._countLines("foo"), 1);
  test.equal(solver._countLines("foo\nbar"), 2);
  test.equal(solver._countLines("\nfoo\n\nbar\n\n"), 2);
  test.equal(solver._countLines(""), 0);
  test.equal(solver._countLines("\n"), 0);
});

Tinytest.add("pbsolver - solve with clauses", function (test) {
  var solver = new PBSolver();
  var exactlyOneOfTheseThree = function (a, b, c) {
    solver.addClause([a, b, c]); // at least one
    solver.addClause([], [a, b]); // not(A) or not(B)
    solver.addClause([], [b, c]); // etc
    solver.addClause([], [a, c]); // etc
  };
  exactlyOneOfTheseThree('11', '12', '13');
  exactlyOneOfTheseThree('21', '22', '23');
  exactlyOneOfTheseThree('31', '32', '33');
  exactlyOneOfTheseThree('11', '21', '31');
  exactlyOneOfTheseThree('12', '22', '32');
  exactlyOneOfTheseThree('13', '23', '33');
  solver.addClause(['12']);
  solver.addClause([], ['21']);
  test.equal(solver.solve(), ['12', '23', '31']);
});

Tinytest.add("pbsolver - solve with constraints", function (test) {
  var solver = new PBSolver();
  var exactlyOneOfTheseThree = function (a, b, c) {
    solver.addConstraint([a, b, c], 1, '=', 1);
  };
  exactlyOneOfTheseThree('11', '12', '13');
  exactlyOneOfTheseThree('21', '22', '23');
  exactlyOneOfTheseThree('31', '32', '33');
  exactlyOneOfTheseThree('11', '21', '31');
  exactlyOneOfTheseThree('12', '22', '32');
  exactlyOneOfTheseThree('13', '23', '33');
  solver.addClause(['12']);
  solver.addClause([], ['21']);
  test.equal(solver.solve(), ['12', '23', '31']);
});

Tinytest.add("pbsolver - solve with exactlyOne", function (test) {
  var solver = new PBSolver();
  solver.exactlyOne(['11', '12', '13']);
  solver.exactlyOne(['21', '22', '23']);
  solver.exactlyOne(['31', '32', '33']);
  solver.exactlyOne(['11', '21', '31']);
  solver.exactlyOne(['12', '22', '32']);
  solver.exactlyOne(['13', '23', '33']);
  solver.isTrue('12');
  solver.isFalse('21');
  test.equal(solver.solve(), ['12', '23', '31']);
});

Tinytest.add("pbsolver - eight queens", function (test) {
  var boardSquare = function (r, c) {
    return String(r) + String(c);
  };

  var solver = new PBSolver();
  var nums = _.range(1, 9); // 1..8
  _.each(nums, function (x) {
    // one per row x, one per column x
    solver.exactlyOne(_.map(nums, function (y) {
      return boardSquare(x, y);
    }));
    solver.exactlyOne(_.map(nums, function (y) {
      return boardSquare(y, x);
    }));
  });

  // At most one queen per diagonal.  A diagonal
  // consists of squares whose row + column sums
  // to a constant, or the horizontal flip of
  // such a set of squares.
  for (var flip = 0; flip <= 1; flip++) {
    for (var sum = 2; sum <= 16; sum++) {
      var vars = [];
      for (var r = 1; r <= sum-1; r++) {
        var c = sum - r;
        if (flip)
          c = 9-c;
        if (r >= 1 && r <= 8 && c >= 1 && c <= 8) {
          vars.push(boardSquare(r,c));
        }
      }
      solver.atMostOne(vars);
    }
  }

  var solution = solver.solve();

  // solution might be, for example,
  // ["16", "24", "31", "45", "58", "62", "77", "83"]
  test.equal(solution.length, 8);
  test.isTrue(/^([1-8][1-8],){7}[1-8][1-8]$/.test(solution.join(',')));
  var assertEightDifferent = function (transformFunc) {
    test.equal(_.uniq(_.map(solution, transformFunc)).length, 8);
  };
  // queens occur in eight different rows, eight different columns
  assertEightDifferent(function (queen) { return queen.charAt(0); });
  assertEightDifferent(function (queen) { return queen.charAt(1); });
  // queens' row/col have eight different sums, eight different differences
  assertEightDifferent(function (queen) {
    return Number(queen.charAt(0)) - Number(queen.charAt(1));
  });
  assertEightDifferent(function (queen) {
    return Number(queen.charAt(0)) + Number(queen.charAt(1));
  });
});

Tinytest.add("pbsolver - genVar", function (test) {
  var solver = new PBSolver();
  var a = solver.genVar();
  var b = solver.genVar();
  var c = solver.genVar();

  solver.implies(a, "1");
  solver.notPImpliesNotQ(a, "1");
  solver.impliesNot(a, "2");
  solver.implies(a, "3");

  solver.implies(b, "2");
  solver.implies(b, "4");

  solver.impliesNot(c, "3");
  solver.impliesNot(c, "5");

  // Forced to choose two of a, b, c, we must choose
  // b and c, because they each conflict with a.
  solver.addConstraint([a, b, c], 1, '=', 2);

  test.equal(solver.solve(), ["2", "4"]);
});


Tinytest.add("pbsolver - Sudoku", function (test) {
  var v = function (row, col, value) {
    return row + "," + col + "=" + value;
  };

  var solver = new PBSolver();

  // All rows, columns, and digits are 0-based internally.
  for (var x = 0; x < 9; x++) {
    // Find the top-left of box x. For example, Box 0 has a top-left
    // of (0,0).  Box 3 has a top-left of (3,0).
    var boxRow = Math.floor(x/3)*3;
    var boxCol = (x%3)*3;
    for (var y = 0; y < 9; y++) {
      var numberInEachSquare = [];
      var columnHavingYInRowX = [];
      var rowHavingYInColumnX = [];
      var squareHavingYInBoxX = [];
      for (var z = 0; z < 9; z++) {
        numberInEachSquare.push(v(x,y,z));
        columnHavingYInRowX.push(v(x,z,y));
        rowHavingYInColumnX.push(v(z,x,y));
        squareHavingYInBoxX.push(v(
          boxRow + Math.floor(z/3),
          boxCol + (z%3),
          y));
      }
      solver.exactlyOne(numberInEachSquare);
      solver.exactlyOne(columnHavingYInRowX);
      solver.exactlyOne(rowHavingYInColumnX);
      solver.exactlyOne(squareHavingYInBoxX);
    }
  }

  // Input a pretty hard Sudoku from here:
  // http://www.menneske.no/sudoku/eng/showpuzzle.html?number=6903541
  var puzzle = [
    "....839..",
    "1......3.",
    "..4....7.",
    ".42.3....",
    "6.......4",
    "....7..1.",
    ".2.......",
    ".8...92..",
    "...25...6"
  ];
  for (var r = 0; r < 9; r++) {
    var str = puzzle[r];
    for (var c = 0; c < 9; c++) {
      // zero-based digit
      var digit = str.charCodeAt(c) - 49;
      if (digit >= 0 && digit < 9) {
        solver.isTrue(v(r, c, digit));
      }
    }
  }

  var solution = solver.solve();
  var solutionString = _.map(solution, function (v) {
    return String(Number(v.slice(-1)) + 1);
  }).join('').match(/.{9}/g).join('\n');
  test.equal(solutionString, [
    "765483921",
    "198726435",
    "234915678",
    "842531769",
    "617892354",
    "359674812",
    "926147583",
    "581369247",
    "473258196"
  ].join('\n'));
});

Tinytest.add("pbsolver - optimize", function (test) {
  var solver = new PBSolver();
  var points = [[3,5], [2,4], [2,1], [4,2], [5,1]];
  solver.exactlyOne(_.map(points, function (p) {
    return p.join(',');
  }));

  var costVectorMap = {};
  _.each(points, function (p) {
    costVectorMap[p.join(',')] = p;
  });

  // should find lexically smallest one
  test.equal(solver.optimize(costVectorMap), ['2,1']);
});

Tinytest.add("pbsolver - toy packages", function (test) {

  var withSolver = function (func) {

    var solver = new PBSolver();

    _.each(allPackageVersions, function (versions, package) {
      versions = _.map(versions, function (v) {
        return package + "@" + v;
      });
      // e.g. atMostOne(["foo@1.0.0", "foo@1.0.1", "foo@2.0.0"])
      solver.atMostOne(versions);
      // e.g. equalsOr("foo", ["foo@1.0.0", ...])
      solver.equalsOr(package, versions);
    });

    _.each(dependencies, function (depMap, packageVersion) {
      _.each(depMap, function (compatibleVersions, package2) {
        // e.g. implies("bar@1.2.4", "foo")
        solver.implies(packageVersion, package2);
        // Now ban all incompatible versions of package2 if
        // we select this packageVersion
        _.each(allPackageVersions[package2], function (v) {
          if (! _.contains(compatibleVersions, v)) {
            solver.impliesNot(packageVersion,
                              package2 + "@" + v);
          }
        });
      });
    });

    var solve = function (optionalCosts) {
      var solution = (optionalCosts ? solver.optimize(optionalCosts) :
                      solver.solve());
      if (! solution) {
        return solution; // null
      } else {
        // only return variables like "foo@1.0.0", not "foo"
        return _.filter(solution, function (v) {
          return v.indexOf('@') >= 0;
        });
      }
    };

    func(solver, solve);
  };

  var allPackageVersions = {
    'foo': ['1.0.0', '1.0.1', '2.0.0'],
    'bar': ['1.2.3', '1.2.4', '1.2.5'],
    'baz': ['3.0.0']
  };

  // Exact dependencies.
  var dependencies = {
    'bar@1.2.3': { foo: ['1.0.0'] },
    'bar@1.2.4': { foo: ['1.0.1'] },
    'bar@1.2.5': { foo: ['2.0.0'] },
    'baz@3.0.0': { foo: ['1.0.0', '1.0.1'],
                   bar: ['1.2.4', '1.2.5'] }
  };

  withSolver(function (solver, solve) {
    // Ask for "bar@1.2.5", get both it and "foo@2.0.0"
    solver.isTrue("bar@1.2.5");
    test.equal(solve(), ["bar@1.2.5", "foo@2.0.0"]);
  });

  withSolver(function (solver, solve) {
    // Ask for "foo@1.0.1" and *some* version of bar!
    solver.isTrue("foo@1.0.1");
    solver.isTrue("bar");
    test.equal(solve(), ["bar@1.2.4", "foo@1.0.1"]);
  });

  withSolver(function (solver, solve) {
    // Ask for versions that can't be combined
    solver.isTrue("foo@1.0.1");
    solver.isTrue("bar@1.2.3");
    test.equal(solve(), null);
  });

  withSolver(function (solver, solve) {
    // Ask for baz, automatically get versions of foo and bar
    // such that foo satisfies bar's dependency!
    solver.isTrue("baz");
    test.equal(solve(), ["bar@1.2.4",
                         "baz@3.0.0",
                         "foo@1.0.1"]);
  });

  withSolver(function (solver, solve) {
    // pick earliest versions
    solver.isTrue("foo");
    solver.isTrue("bar");
    test.equal(solve({ "foo@1.0.0": [0],
                       "foo@1.0.1": [1],
                       "foo@2.0.0": [2],
                       "bar@1.2.3": [0],
                       "bar@1.2.4": [1],
                       "bar@1.2.5": [2] }),
               ["bar@1.2.3", "foo@1.0.0"]);
  });

  withSolver(function (solver, solve) {
    // pick latest versions
    solver.isTrue("foo");
    solver.isTrue("bar");
    test.equal(solve({ "foo@1.0.0": [2],
                       "foo@1.0.1": [1],
                       "foo@2.0.0": [0],
                       "bar@1.2.3": [2],
                       "bar@1.2.4": [1],
                       "bar@1.2.5": [0] }),
               ["bar@1.2.5", "foo@2.0.0"]);
  });

  withSolver(function (solver, solve) {
    // pick earliest versions (but give solver a
    // cost vector with extra stuff)
    solver.isTrue("foo");
    solver.isTrue("bar");
    test.equal(solve({ "foo@1.0.0": [1, 0],
                       "foo@1.0.1": [1, 1],
                       "foo@2.0.0": [1, 2],
                       "bar@1.2.3": [2, 0],
                       "bar@1.2.4": [2, 1],
                       "bar@1.2.5": [2, 2] }),
               ["bar@1.2.3", "foo@1.0.0"]);
  });

  withSolver(function (solver, solve) {
    // pick latest versions (but give solver a
    // bigger vector to work with)
    solver.isTrue("foo");
    solver.isTrue("bar");
    test.equal(solve({ "foo@1.0.0": [1, 2],
                       "foo@1.0.1": [1, 1],
                       "foo@2.0.0": [1, 0],
                       "bar@1.2.3": [2, 2],
                       "bar@1.2.4": [2, 1],
                       "bar@1.2.5": [2, 0] }),
               ["bar@1.2.5", "foo@2.0.0"]);
  });

});

Tinytest.add("pbsolver - buggy optimization", function (test) {
  var solver = new PBSolver();
  solver.equalsOr("data-mapper", ["data-mapper 1.2.0"]);
  solver.atMostOne(["dm-transactions 1.0.1","dm-transactions 1.0.2","dm-transactions 1.1.0","dm-transactions 1.2.0"]);
  solver.equalsOr("dm-transactions", ["dm-transactions 1.0.1","dm-transactions 1.0.2","dm-transactions 1.1.0","dm-transactions 1.2.0"]);
  solver.atMostOne(["dm-constraints 0.9.11","dm-constraints 0.10.0","dm-constraints 0.10.1","dm-constraints 0.10.2","dm-constraints 1.0.1","dm-constraints 1.0.2","dm-constraints 1.1.0","dm-constraints 1.2.0"]);
  solver.equalsOr("dm-constraints", ["dm-constraints 0.9.11","dm-constraints 0.10.0","dm-constraints 0.10.1","dm-constraints 0.10.2","dm-constraints 1.0.1","dm-constraints 1.0.2","dm-constraints 1.1.0","dm-constraints 1.2.0"]);
  solver.atMostOne(["dm-types 0.9.11","dm-types 0.10.0","dm-types 0.10.1","dm-types 0.10.2","dm-types 1.1.0","dm-types 1.2.0","dm-types 1.2.1","dm-types 1.2.2"]);
  solver.equalsOr("dm-types", ["dm-types 0.9.11","dm-types 0.10.0","dm-types 0.10.1","dm-types 0.10.2","dm-types 1.1.0","dm-types 1.2.0","dm-types 1.2.1","dm-types 1.2.2"]);
  solver.atMostOne(["multi-json 0.0.2","multi-json 0.0.3","multi-json 0.0.4","multi-json 0.0.5","multi-json 1.8.4","multi-json 1.9.0","multi-json 1.9.1","multi-json 1.9.2"]);
  solver.equalsOr("multi-json", ["multi-json 0.0.2","multi-json 0.0.3","multi-json 0.0.4","multi-json 0.0.5","multi-json 1.8.4","multi-json 1.9.0","multi-json 1.9.1","multi-json 1.9.2"]);
  solver.atMostOne(["json 0.4.0","json 0.4.1","json 0.4.2","json 0.4.3","json 1.7.6","json 1.7.7","json 1.8.0","json 1.8.1"]);
  solver.equalsOr("json", ["json 0.4.0","json 0.4.1","json 0.4.2","json 0.4.3","json 1.7.6","json 1.7.7","json 1.8.0","json 1.8.1"]);
  solver.atMostOne(["stringex 1.3.3","stringex 1.4.0","stringex 1.5.0","stringex 1.5.1","stringex 2.4.1","stringex 2.4.2","stringex 2.5.0","stringex 2.5.1"]);
  solver.equalsOr("stringex", ["stringex 1.3.3","stringex 1.4.0","stringex 1.5.0","stringex 1.5.1","stringex 2.4.1","stringex 2.4.2","stringex 2.5.0","stringex 2.5.1"]);
  solver.atMostOne(["uuidtools 0.1.1","uuidtools 0.1.2","uuidtools 0.1.3","uuidtools 0.1.4","uuidtools 1.0.4","uuidtools 1.0.5","uuidtools 1.0.6","uuidtools 1.0.7","uuidtools 2.1.1","uuidtools 2.1.2","uuidtools 2.1.3","uuidtools 2.1.4"]);
  solver.equalsOr("uuidtools", ["uuidtools 0.1.1","uuidtools 0.1.2","uuidtools 0.1.3","uuidtools 0.1.4","uuidtools 1.0.4","uuidtools 1.0.5","uuidtools 1.0.6","uuidtools 1.0.7","uuidtools 2.1.1","uuidtools 2.1.2","uuidtools 2.1.3","uuidtools 2.1.4"]);
  solver.atMostOne(["launchy 0.4.2"]);
  solver.equalsOr("launchy", ["launchy 0.4.2"]);
  solver.atMostOne(["rspec 0.20.0","rspec 1.20.0","rspec 2.20.0","rspec 3.20.0"]);
  solver.equalsOr("rspec", ["rspec 0.20.0","rspec 1.20.0","rspec 2.20.0","rspec 3.20.0"]);
  solver.atMostOne(["rake 12.0.0"]);
  solver.equalsOr("rake", ["rake 12.0.0"]);
  solver.atMostOne(["json-pure 1.7.6","json-pure 1.7.7","json-pure 1.8.0","json-pure 1.8.1"]);
  solver.equalsOr("json-pure", ["json-pure 1.7.6","json-pure 1.7.7","json-pure 1.8.0","json-pure 1.8.1"]);
  solver.atMostOne(["fastercsv 0.1.8","fastercsv 0.1.9","fastercsv 0.2.0","fastercsv 0.2.1","fastercsv 1.5.1","fastercsv 1.5.3","fastercsv 1.5.4","fastercsv 1.5.5"]);
  solver.equalsOr("fastercsv", ["fastercsv 0.1.8","fastercsv 0.1.9","fastercsv 0.2.0","fastercsv 0.2.1","fastercsv 1.5.1","fastercsv 1.5.3","fastercsv 1.5.4","fastercsv 1.5.5"]);
  solver.atMostOne(["bcrypt-ruby 1.0.0","bcrypt-ruby 2.1.1","bcrypt-ruby 2.1.2","bcrypt-ruby 2.1.3","bcrypt-ruby 2.1.4","bcrypt-ruby 3.1.2","bcrypt-ruby 3.1.3","bcrypt-ruby 3.1.4","bcrypt-ruby 3.1.5"]);
  solver.equalsOr("bcrypt-ruby", ["bcrypt-ruby 1.0.0","bcrypt-ruby 2.1.1","bcrypt-ruby 2.1.2","bcrypt-ruby 2.1.3","bcrypt-ruby 2.1.4","bcrypt-ruby 3.1.2","bcrypt-ruby 3.1.3","bcrypt-ruby 3.1.4","bcrypt-ruby 3.1.5"]);
  solver.atMostOne(["bcrypt 3.1.3","bcrypt 3.1.6","bcrypt 3.1.7"]);
  solver.equalsOr("bcrypt", ["bcrypt 3.1.3","bcrypt 3.1.6","bcrypt 3.1.7"]);
  solver.atMostOne(["addressable 0.1.0","addressable 0.1.1","addressable 0.1.2","addressable 1.0.1","addressable 1.0.2","addressable 1.0.3","addressable 1.0.4","addressable 2.3.3","addressable 2.3.4","addressable 2.3.5","addressable 2.3.6"]);
  solver.equalsOr("addressable", ["addressable 0.1.0","addressable 0.1.1","addressable 0.1.2","addressable 1.0.1","addressable 1.0.2","addressable 1.0.3","addressable 1.0.4","addressable 2.3.3","addressable 2.3.4","addressable 2.3.5","addressable 2.3.6"]);
  solver.atMostOne(["dm-validations 0.9.11","dm-validations 0.10.0","dm-validations 0.10.1","dm-validations 0.10.2","dm-validations 1.0.1","dm-validations 1.0.2","dm-validations 1.1.0","dm-validations 1.2.0"]);
  solver.equalsOr("dm-validations", ["dm-validations 0.9.11","dm-validations 0.10.0","dm-validations 0.10.1","dm-validations 0.10.2","dm-validations 1.0.1","dm-validations 1.0.2","dm-validations 1.1.0","dm-validations 1.2.0"]);
  solver.atMostOne(["dm-timestamps 0.9.11","dm-timestamps 0.10.0","dm-timestamps 0.10.1","dm-timestamps 0.10.2","dm-timestamps 1.0.1","dm-timestamps 1.0.2","dm-timestamps 1.1.0","dm-timestamps 1.2.0"]);
  solver.equalsOr("dm-timestamps", ["dm-timestamps 0.9.11","dm-timestamps 0.10.0","dm-timestamps 0.10.1","dm-timestamps 0.10.2","dm-timestamps 1.0.1","dm-timestamps 1.0.2","dm-timestamps 1.1.0","dm-timestamps 1.2.0"]);
  solver.atMostOne(["dm-serializer 0.9.11","dm-serializer 0.10.0","dm-serializer 0.10.1","dm-serializer 0.10.2","dm-serializer 1.1.0","dm-serializer 1.2.0","dm-serializer 1.2.1","dm-serializer 1.2.2"]);
  solver.equalsOr("dm-serializer", ["dm-serializer 0.9.11","dm-serializer 0.10.0","dm-serializer 0.10.1","dm-serializer 0.10.2","dm-serializer 1.1.0","dm-serializer 1.2.0","dm-serializer 1.2.1","dm-serializer 1.2.2"]);
  solver.atMostOne(["dm-migrations 0.9.11","dm-migrations 0.10.0","dm-migrations 0.10.1","dm-migrations 0.10.2","dm-migrations 1.0.1","dm-migrations 1.0.2","dm-migrations 1.1.0","dm-migrations 1.2.0"]);
  solver.equalsOr("dm-migrations", ["dm-migrations 0.9.11","dm-migrations 0.10.0","dm-migrations 0.10.1","dm-migrations 0.10.2","dm-migrations 1.0.1","dm-migrations 1.0.2","dm-migrations 1.1.0","dm-migrations 1.2.0"]);
  solver.atMostOne(["dm-aggregates 0.9.11","dm-aggregates 0.10.0","dm-aggregates 0.10.1","dm-aggregates 0.10.2","dm-aggregates 1.0.1","dm-aggregates 1.0.2","dm-aggregates 1.1.0","dm-aggregates 1.2.0"]);
  solver.equalsOr("dm-aggregates", ["dm-aggregates 0.9.11","dm-aggregates 0.10.0","dm-aggregates 0.10.1","dm-aggregates 0.10.2","dm-aggregates 1.0.1","dm-aggregates 1.0.2","dm-aggregates 1.1.0","dm-aggregates 1.2.0"]);
  solver.atMostOne(["dm-core 0.9.11","dm-core 0.10.0","dm-core 0.10.1","dm-core 0.10.2","dm-core 1.0.2","dm-core 1.1.0","dm-core 1.2.0","dm-core 1.2.1"]);
  solver.equalsOr("dm-core", ["dm-core 0.9.11","dm-core 0.10.0","dm-core 0.10.1","dm-core 0.10.2","dm-core 1.0.2","dm-core 1.1.0","dm-core 1.2.0","dm-core 1.2.1"]);
  solver.atMostOne(["data-objects 0.10.11","data-objects 0.10.12","data-objects 0.10.13","data-objects 0.10.14"]);
  solver.equalsOr("data-objects", ["data-objects 0.10.11","data-objects 0.10.12","data-objects 0.10.13","data-objects 0.10.14"]);
  solver.atMostOne(["capistrano 1.3.1","capistrano 1.4.0","capistrano 1.4.1","capistrano 1.4.2","capistrano 2.15.2","capistrano 2.15.3","capistrano 2.15.4","capistrano 2.15.5","capistrano 3.0.0","capistrano 3.0.1","capistrano 3.1.0"]);
  solver.equalsOr("capistrano", ["capistrano 1.3.1","capistrano 1.4.0","capistrano 1.4.1","capistrano 1.4.2","capistrano 2.15.2","capistrano 2.15.3","capistrano 2.15.4","capistrano 2.15.5","capistrano 3.0.0","capistrano 3.0.1","capistrano 3.1.0"]);
  solver.atMostOne(["net-ssh-gateway 1.0.0","net-ssh-gateway 1.0.1","net-ssh-gateway 1.1.0","net-ssh-gateway 1.2.0"]);
  solver.equalsOr("net-ssh-gateway", ["net-ssh-gateway 1.0.0","net-ssh-gateway 1.0.1","net-ssh-gateway 1.1.0","net-ssh-gateway 1.2.0"]);
  solver.atMostOne(["echoe 1.0.0"]);
  solver.equalsOr("echoe", ["echoe 1.0.0"]);
  solver.atMostOne(["net-scp 1.0.4","net-scp 1.1.0","net-scp 1.1.1","net-scp 1.1.2"]);
  solver.equalsOr("net-scp", ["net-scp 1.0.4","net-scp 1.1.0","net-scp 1.1.1","net-scp 1.1.2"]);
  solver.atMostOne(["highline 0.3.0","highline 0.4.0","highline 0.5.0","highline 0.6.1","highline 1.6.18","highline 1.6.19","highline 1.6.20","highline 1.6.21"]);
  solver.equalsOr("highline", ["highline 0.3.0","highline 0.4.0","highline 0.5.0","highline 0.6.1","highline 1.6.18","highline 1.6.19","highline 1.6.20","highline 1.6.21"]);
  solver.atMostOne(["net-sftp 0.5.0","net-sftp 0.9.0","net-sftp 1.0.0","net-sftp 1.0.1","net-sftp 1.1.0","net-sftp 1.1.1","net-sftp 2.0.5","net-sftp 2.1.0","net-sftp 2.1.1","net-sftp 2.1.2"]);
  solver.equalsOr("net-sftp", ["net-sftp 0.5.0","net-sftp 0.9.0","net-sftp 1.0.0","net-sftp 1.0.1","net-sftp 1.1.0","net-sftp 1.1.1","net-sftp 2.0.5","net-sftp 2.1.0","net-sftp 2.1.1","net-sftp 2.1.2"]);
  solver.atMostOne(["net-ssh 0.5.0","net-ssh 0.6.0","net-ssh 0.9.0","net-ssh 1.1.1","net-ssh 1.1.2","net-ssh 1.1.3","net-ssh 1.1.4","net-ssh 2.6.7","net-ssh 2.6.8","net-ssh 2.7.0","net-ssh 2.8.0"]);
  solver.equalsOr("net-ssh", ["net-ssh 0.5.0","net-ssh 0.6.0","net-ssh 0.9.0","net-ssh 1.1.1","net-ssh 1.1.2","net-ssh 1.1.3","net-ssh 1.1.4","net-ssh 2.6.7","net-ssh 2.6.8","net-ssh 2.7.0","net-ssh 2.8.0"]);
  solver.implies("data-mapper 1.2.0", "dm-core");
  solver.impliesNot("data-mapper 1.2.0", "dm-core 0.9.11");
  solver.impliesNot("data-mapper 1.2.0", "dm-core 0.10.0");
  solver.impliesNot("data-mapper 1.2.0", "dm-core 0.10.1");
  solver.impliesNot("data-mapper 1.2.0", "dm-core 0.10.2");
  solver.impliesNot("data-mapper 1.2.0", "dm-core 1.0.2");
  solver.impliesNot("data-mapper 1.2.0", "dm-core 1.1.0");
  solver.implies("data-mapper 1.2.0", "dm-aggregates");
  solver.impliesNot("data-mapper 1.2.0", "dm-aggregates 0.9.11");
  solver.impliesNot("data-mapper 1.2.0", "dm-aggregates 0.10.0");
  solver.impliesNot("data-mapper 1.2.0", "dm-aggregates 0.10.1");
  solver.impliesNot("data-mapper 1.2.0", "dm-aggregates 0.10.2");
  solver.impliesNot("data-mapper 1.2.0", "dm-aggregates 1.0.1");
  solver.impliesNot("data-mapper 1.2.0", "dm-aggregates 1.0.2");
  solver.impliesNot("data-mapper 1.2.0", "dm-aggregates 1.1.0");
  solver.implies("data-mapper 1.2.0", "dm-constraints");
  solver.impliesNot("data-mapper 1.2.0", "dm-constraints 0.9.11");
  solver.impliesNot("data-mapper 1.2.0", "dm-constraints 0.10.0");
  solver.impliesNot("data-mapper 1.2.0", "dm-constraints 0.10.1");
  solver.impliesNot("data-mapper 1.2.0", "dm-constraints 0.10.2");
  solver.impliesNot("data-mapper 1.2.0", "dm-constraints 1.0.1");
  solver.impliesNot("data-mapper 1.2.0", "dm-constraints 1.0.2");
  solver.impliesNot("data-mapper 1.2.0", "dm-constraints 1.1.0");
  solver.implies("data-mapper 1.2.0", "dm-migrations");
  solver.impliesNot("data-mapper 1.2.0", "dm-migrations 0.9.11");
  solver.impliesNot("data-mapper 1.2.0", "dm-migrations 0.10.0");
  solver.impliesNot("data-mapper 1.2.0", "dm-migrations 0.10.1");
  solver.impliesNot("data-mapper 1.2.0", "dm-migrations 0.10.2");
  solver.impliesNot("data-mapper 1.2.0", "dm-migrations 1.0.1");
  solver.impliesNot("data-mapper 1.2.0", "dm-migrations 1.0.2");
  solver.impliesNot("data-mapper 1.2.0", "dm-migrations 1.1.0");
  solver.implies("data-mapper 1.2.0", "dm-transactions");
  solver.impliesNot("data-mapper 1.2.0", "dm-transactions 1.0.1");
  solver.impliesNot("data-mapper 1.2.0", "dm-transactions 1.0.2");
  solver.impliesNot("data-mapper 1.2.0", "dm-transactions 1.1.0");
  solver.implies("data-mapper 1.2.0", "dm-serializer");
  solver.impliesNot("data-mapper 1.2.0", "dm-serializer 0.9.11");
  solver.impliesNot("data-mapper 1.2.0", "dm-serializer 0.10.0");
  solver.impliesNot("data-mapper 1.2.0", "dm-serializer 0.10.1");
  solver.impliesNot("data-mapper 1.2.0", "dm-serializer 0.10.2");
  solver.impliesNot("data-mapper 1.2.0", "dm-serializer 1.1.0");
  solver.implies("data-mapper 1.2.0", "dm-timestamps");
  solver.impliesNot("data-mapper 1.2.0", "dm-timestamps 0.9.11");
  solver.impliesNot("data-mapper 1.2.0", "dm-timestamps 0.10.0");
  solver.impliesNot("data-mapper 1.2.0", "dm-timestamps 0.10.1");
  solver.impliesNot("data-mapper 1.2.0", "dm-timestamps 0.10.2");
  solver.impliesNot("data-mapper 1.2.0", "dm-timestamps 1.0.1");
  solver.impliesNot("data-mapper 1.2.0", "dm-timestamps 1.0.2");
  solver.impliesNot("data-mapper 1.2.0", "dm-timestamps 1.1.0");
  solver.implies("data-mapper 1.2.0", "dm-validations");
  solver.impliesNot("data-mapper 1.2.0", "dm-validations 0.9.11");
  solver.impliesNot("data-mapper 1.2.0", "dm-validations 0.10.0");
  solver.impliesNot("data-mapper 1.2.0", "dm-validations 0.10.1");
  solver.impliesNot("data-mapper 1.2.0", "dm-validations 0.10.2");
  solver.impliesNot("data-mapper 1.2.0", "dm-validations 1.0.1");
  solver.impliesNot("data-mapper 1.2.0", "dm-validations 1.0.2");
  solver.impliesNot("data-mapper 1.2.0", "dm-validations 1.1.0");
  solver.implies("data-mapper 1.2.0", "dm-types");
  solver.impliesNot("data-mapper 1.2.0", "dm-types 0.9.11");
  solver.impliesNot("data-mapper 1.2.0", "dm-types 0.10.0");
  solver.impliesNot("data-mapper 1.2.0", "dm-types 0.10.1");
  solver.impliesNot("data-mapper 1.2.0", "dm-types 0.10.2");
  solver.impliesNot("data-mapper 1.2.0", "dm-types 1.1.0");
  solver.implies("dm-transactions 1.0.1", "dm-core");
  solver.impliesNot("dm-transactions 1.0.1", "dm-core 0.9.11");
  solver.impliesNot("dm-transactions 1.0.1", "dm-core 0.10.0");
  solver.impliesNot("dm-transactions 1.0.1", "dm-core 0.10.1");
  solver.impliesNot("dm-transactions 1.0.1", "dm-core 0.10.2");
  solver.implies("dm-transactions 1.0.2", "dm-core");
  solver.impliesNot("dm-transactions 1.0.2", "dm-core 0.9.11");
  solver.impliesNot("dm-transactions 1.0.2", "dm-core 0.10.0");
  solver.impliesNot("dm-transactions 1.0.2", "dm-core 0.10.1");
  solver.impliesNot("dm-transactions 1.0.2", "dm-core 0.10.2");
  solver.implies("dm-transactions 1.1.0", "dm-core");
  solver.impliesNot("dm-transactions 1.1.0", "dm-core 0.9.11");
  solver.impliesNot("dm-transactions 1.1.0", "dm-core 0.10.0");
  solver.impliesNot("dm-transactions 1.1.0", "dm-core 0.10.1");
  solver.impliesNot("dm-transactions 1.1.0", "dm-core 0.10.2");
  solver.impliesNot("dm-transactions 1.1.0", "dm-core 1.0.2");
  solver.implies("dm-transactions 1.2.0", "dm-core");
  solver.impliesNot("dm-transactions 1.2.0", "dm-core 0.9.11");
  solver.impliesNot("dm-transactions 1.2.0", "dm-core 0.10.0");
  solver.impliesNot("dm-transactions 1.2.0", "dm-core 0.10.1");
  solver.impliesNot("dm-transactions 1.2.0", "dm-core 0.10.2");
  solver.impliesNot("dm-transactions 1.2.0", "dm-core 1.0.2");
  solver.impliesNot("dm-transactions 1.2.0", "dm-core 1.1.0");
  solver.implies("dm-constraints 0.9.11", "dm-core");
  solver.impliesNot("dm-constraints 0.9.11", "dm-core 0.10.0");
  solver.impliesNot("dm-constraints 0.9.11", "dm-core 0.10.1");
  solver.impliesNot("dm-constraints 0.9.11", "dm-core 0.10.2");
  solver.impliesNot("dm-constraints 0.9.11", "dm-core 1.0.2");
  solver.impliesNot("dm-constraints 0.9.11", "dm-core 1.1.0");
  solver.impliesNot("dm-constraints 0.9.11", "dm-core 1.2.0");
  solver.impliesNot("dm-constraints 0.9.11", "dm-core 1.2.1");
  solver.implies("dm-constraints 0.10.1", "dm-core");
  solver.impliesNot("dm-constraints 0.10.1", "dm-core 0.9.11");
  solver.impliesNot("dm-constraints 0.10.1", "dm-core 0.10.0");
  solver.impliesNot("dm-constraints 0.10.1", "dm-core 0.10.2");
  solver.impliesNot("dm-constraints 0.10.1", "dm-core 1.0.2");
  solver.impliesNot("dm-constraints 0.10.1", "dm-core 1.1.0");
  solver.impliesNot("dm-constraints 0.10.1", "dm-core 1.2.0");
  solver.impliesNot("dm-constraints 0.10.1", "dm-core 1.2.1");
  solver.implies("dm-constraints 0.10.2", "dm-core");
  solver.impliesNot("dm-constraints 0.10.2", "dm-core 0.9.11");
  solver.impliesNot("dm-constraints 0.10.2", "dm-core 0.10.0");
  solver.impliesNot("dm-constraints 0.10.2", "dm-core 0.10.1");
  solver.implies("dm-constraints 1.0.1", "dm-core");
  solver.impliesNot("dm-constraints 1.0.1", "dm-core 0.9.11");
  solver.impliesNot("dm-constraints 1.0.1", "dm-core 0.10.0");
  solver.impliesNot("dm-constraints 1.0.1", "dm-core 0.10.1");
  solver.impliesNot("dm-constraints 1.0.1", "dm-core 0.10.2");
  solver.implies("dm-constraints 1.0.1", "dm-migrations");
  solver.impliesNot("dm-constraints 1.0.1", "dm-migrations 0.9.11");
  solver.impliesNot("dm-constraints 1.0.1", "dm-migrations 0.10.0");
  solver.impliesNot("dm-constraints 1.0.1", "dm-migrations 0.10.1");
  solver.impliesNot("dm-constraints 1.0.1", "dm-migrations 0.10.2");
  solver.implies("dm-constraints 1.0.2", "dm-core");
  solver.impliesNot("dm-constraints 1.0.2", "dm-core 0.9.11");
  solver.impliesNot("dm-constraints 1.0.2", "dm-core 0.10.0");
  solver.impliesNot("dm-constraints 1.0.2", "dm-core 0.10.1");
  solver.impliesNot("dm-constraints 1.0.2", "dm-core 0.10.2");
  solver.implies("dm-constraints 1.0.2", "dm-migrations");
  solver.impliesNot("dm-constraints 1.0.2", "dm-migrations 0.9.11");
  solver.impliesNot("dm-constraints 1.0.2", "dm-migrations 0.10.0");
  solver.impliesNot("dm-constraints 1.0.2", "dm-migrations 0.10.1");
  solver.impliesNot("dm-constraints 1.0.2", "dm-migrations 0.10.2");
  solver.impliesNot("dm-constraints 1.0.2", "dm-migrations 1.0.1");
  solver.implies("dm-constraints 1.1.0", "dm-core");
  solver.impliesNot("dm-constraints 1.1.0", "dm-core 0.9.11");
  solver.impliesNot("dm-constraints 1.1.0", "dm-core 0.10.0");
  solver.impliesNot("dm-constraints 1.1.0", "dm-core 0.10.1");
  solver.impliesNot("dm-constraints 1.1.0", "dm-core 0.10.2");
  solver.impliesNot("dm-constraints 1.1.0", "dm-core 1.0.2");
  solver.implies("dm-constraints 1.2.0", "dm-core");
  solver.impliesNot("dm-constraints 1.2.0", "dm-core 0.9.11");
  solver.impliesNot("dm-constraints 1.2.0", "dm-core 0.10.0");
  solver.impliesNot("dm-constraints 1.2.0", "dm-core 0.10.1");
  solver.impliesNot("dm-constraints 1.2.0", "dm-core 0.10.2");
  solver.impliesNot("dm-constraints 1.2.0", "dm-core 1.0.2");
  solver.impliesNot("dm-constraints 1.2.0", "dm-core 1.1.0");
  solver.implies("dm-types 0.9.11", "dm-core");
  solver.impliesNot("dm-types 0.9.11", "dm-core 0.10.0");
  solver.impliesNot("dm-types 0.9.11", "dm-core 0.10.1");
  solver.impliesNot("dm-types 0.9.11", "dm-core 0.10.2");
  solver.impliesNot("dm-types 0.9.11", "dm-core 1.0.2");
  solver.impliesNot("dm-types 0.9.11", "dm-core 1.1.0");
  solver.impliesNot("dm-types 0.9.11", "dm-core 1.2.0");
  solver.impliesNot("dm-types 0.9.11", "dm-core 1.2.1");
  solver.implies("dm-types 0.9.11", "addressable");
  solver.impliesNot("dm-types 0.9.11", "addressable 0.1.0");
  solver.impliesNot("dm-types 0.9.11", "addressable 0.1.1");
  solver.impliesNot("dm-types 0.9.11", "addressable 0.1.2");
  solver.impliesNot("dm-types 0.9.11", "addressable 1.0.1");
  solver.impliesNot("dm-types 0.9.11", "addressable 1.0.2");
  solver.impliesNot("dm-types 0.9.11", "addressable 1.0.3");
  solver.impliesNot("dm-types 0.9.11", "addressable 1.0.4");
  solver.implies("dm-types 0.10.1", "dm-core");
  solver.impliesNot("dm-types 0.10.1", "dm-core 0.9.11");
  solver.impliesNot("dm-types 0.10.1", "dm-core 0.10.0");
  solver.impliesNot("dm-types 0.10.1", "dm-core 0.10.2");
  solver.impliesNot("dm-types 0.10.1", "dm-core 1.0.2");
  solver.impliesNot("dm-types 0.10.1", "dm-core 1.1.0");
  solver.impliesNot("dm-types 0.10.1", "dm-core 1.2.0");
  solver.impliesNot("dm-types 0.10.1", "dm-core 1.2.1");
  solver.implies("dm-types 0.10.2", "bcrypt-ruby");
  solver.impliesNot("dm-types 0.10.2", "bcrypt-ruby 1.0.0");
  solver.impliesNot("dm-types 0.10.2", "bcrypt-ruby 2.1.1");
  solver.implies("dm-types 0.10.2", "dm-core");
  solver.impliesNot("dm-types 0.10.2", "dm-core 0.9.11");
  solver.impliesNot("dm-types 0.10.2", "dm-core 0.10.0");
  solver.impliesNot("dm-types 0.10.2", "dm-core 0.10.1");
  solver.implies("dm-types 0.10.2", "fastercsv");
  solver.impliesNot("dm-types 0.10.2", "fastercsv 0.1.8");
  solver.impliesNot("dm-types 0.10.2", "fastercsv 0.1.9");
  solver.impliesNot("dm-types 0.10.2", "fastercsv 0.2.0");
  solver.impliesNot("dm-types 0.10.2", "fastercsv 0.2.1");
  solver.implies("dm-types 0.10.2", "json-pure");
  solver.implies("dm-types 0.10.2", "uuidtools");
  solver.impliesNot("dm-types 0.10.2", "uuidtools 0.1.1");
  solver.impliesNot("dm-types 0.10.2", "uuidtools 0.1.2");
  solver.impliesNot("dm-types 0.10.2", "uuidtools 0.1.3");
  solver.impliesNot("dm-types 0.10.2", "uuidtools 0.1.4");
  solver.impliesNot("dm-types 0.10.2", "uuidtools 1.0.4");
  solver.impliesNot("dm-types 0.10.2", "uuidtools 1.0.5");
  solver.impliesNot("dm-types 0.10.2", "uuidtools 1.0.6");
  solver.impliesNot("dm-types 0.10.2", "uuidtools 1.0.7");
  solver.implies("dm-types 0.10.2", "stringex");
  solver.implies("dm-types 1.1.0", "bcrypt-ruby");
  solver.impliesNot("dm-types 1.1.0", "bcrypt-ruby 1.0.0");
  solver.impliesNot("dm-types 1.1.0", "bcrypt-ruby 2.1.1");
  solver.impliesNot("dm-types 1.1.0", "bcrypt-ruby 2.1.2");
  solver.impliesNot("dm-types 1.1.0", "bcrypt-ruby 2.1.3");
  solver.implies("dm-types 1.1.0", "dm-core");
  solver.impliesNot("dm-types 1.1.0", "dm-core 0.9.11");
  solver.impliesNot("dm-types 1.1.0", "dm-core 0.10.0");
  solver.impliesNot("dm-types 1.1.0", "dm-core 0.10.1");
  solver.impliesNot("dm-types 1.1.0", "dm-core 0.10.2");
  solver.impliesNot("dm-types 1.1.0", "dm-core 1.0.2");
  solver.implies("dm-types 1.1.0", "fastercsv");
  solver.impliesNot("dm-types 1.1.0", "fastercsv 0.1.8");
  solver.impliesNot("dm-types 1.1.0", "fastercsv 0.1.9");
  solver.impliesNot("dm-types 1.1.0", "fastercsv 0.2.0");
  solver.impliesNot("dm-types 1.1.0", "fastercsv 0.2.1");
  solver.impliesNot("dm-types 1.1.0", "fastercsv 1.5.1");
  solver.impliesNot("dm-types 1.1.0", "fastercsv 1.5.3");
  solver.implies("dm-types 1.1.0", "json");
  solver.impliesNot("dm-types 1.1.0", "json 0.4.0");
  solver.impliesNot("dm-types 1.1.0", "json 0.4.1");
  solver.impliesNot("dm-types 1.1.0", "json 0.4.2");
  solver.impliesNot("dm-types 1.1.0", "json 0.4.3");
  solver.implies("dm-types 1.1.0", "stringex");
  solver.implies("dm-types 1.1.0", "uuidtools");
  solver.impliesNot("dm-types 1.1.0", "uuidtools 0.1.1");
  solver.impliesNot("dm-types 1.1.0", "uuidtools 0.1.2");
  solver.impliesNot("dm-types 1.1.0", "uuidtools 0.1.3");
  solver.impliesNot("dm-types 1.1.0", "uuidtools 0.1.4");
  solver.impliesNot("dm-types 1.1.0", "uuidtools 1.0.4");
  solver.impliesNot("dm-types 1.1.0", "uuidtools 1.0.5");
  solver.impliesNot("dm-types 1.1.0", "uuidtools 1.0.6");
  solver.impliesNot("dm-types 1.1.0", "uuidtools 1.0.7");
  solver.impliesNot("dm-types 1.1.0", "uuidtools 2.1.1");
  solver.implies("dm-types 1.2.0", "bcrypt-ruby");
  solver.impliesNot("dm-types 1.2.0", "bcrypt-ruby 1.0.0");
  solver.impliesNot("dm-types 1.2.0", "bcrypt-ruby 2.1.1");
  solver.impliesNot("dm-types 1.2.0", "bcrypt-ruby 2.1.2");
  solver.impliesNot("dm-types 1.2.0", "bcrypt-ruby 2.1.3");
  solver.impliesNot("dm-types 1.2.0", "bcrypt-ruby 2.1.4");
  solver.implies("dm-types 1.2.0", "dm-core");
  solver.impliesNot("dm-types 1.2.0", "dm-core 0.9.11");
  solver.impliesNot("dm-types 1.2.0", "dm-core 0.10.0");
  solver.impliesNot("dm-types 1.2.0", "dm-core 0.10.1");
  solver.impliesNot("dm-types 1.2.0", "dm-core 0.10.2");
  solver.impliesNot("dm-types 1.2.0", "dm-core 1.0.2");
  solver.impliesNot("dm-types 1.2.0", "dm-core 1.1.0");
  solver.implies("dm-types 1.2.0", "fastercsv");
  solver.impliesNot("dm-types 1.2.0", "fastercsv 0.1.8");
  solver.impliesNot("dm-types 1.2.0", "fastercsv 0.1.9");
  solver.impliesNot("dm-types 1.2.0", "fastercsv 0.2.0");
  solver.impliesNot("dm-types 1.2.0", "fastercsv 0.2.1");
  solver.impliesNot("dm-types 1.2.0", "fastercsv 1.5.1");
  solver.impliesNot("dm-types 1.2.0", "fastercsv 1.5.3");
  solver.implies("dm-types 1.2.0", "multi-json");
  solver.impliesNot("dm-types 1.2.0", "multi-json 0.0.2");
  solver.impliesNot("dm-types 1.2.0", "multi-json 0.0.3");
  solver.impliesNot("dm-types 1.2.0", "multi-json 0.0.4");
  solver.impliesNot("dm-types 1.2.0", "multi-json 0.0.5");
  solver.implies("dm-types 1.2.0", "json");
  solver.impliesNot("dm-types 1.2.0", "json 0.4.0");
  solver.impliesNot("dm-types 1.2.0", "json 0.4.1");
  solver.impliesNot("dm-types 1.2.0", "json 0.4.2");
  solver.impliesNot("dm-types 1.2.0", "json 0.4.3");
  solver.implies("dm-types 1.2.0", "stringex");
  solver.implies("dm-types 1.2.0", "uuidtools");
  solver.impliesNot("dm-types 1.2.0", "uuidtools 0.1.1");
  solver.impliesNot("dm-types 1.2.0", "uuidtools 0.1.2");
  solver.impliesNot("dm-types 1.2.0", "uuidtools 0.1.3");
  solver.impliesNot("dm-types 1.2.0", "uuidtools 0.1.4");
  solver.impliesNot("dm-types 1.2.0", "uuidtools 1.0.4");
  solver.impliesNot("dm-types 1.2.0", "uuidtools 1.0.5");
  solver.impliesNot("dm-types 1.2.0", "uuidtools 1.0.6");
  solver.impliesNot("dm-types 1.2.0", "uuidtools 1.0.7");
  solver.impliesNot("dm-types 1.2.0", "uuidtools 2.1.1");
  solver.implies("dm-types 1.2.1", "bcrypt-ruby");
  solver.impliesNot("dm-types 1.2.1", "bcrypt-ruby 1.0.0");
  solver.impliesNot("dm-types 1.2.1", "bcrypt-ruby 2.1.1");
  solver.impliesNot("dm-types 1.2.1", "bcrypt-ruby 2.1.2");
  solver.impliesNot("dm-types 1.2.1", "bcrypt-ruby 2.1.3");
  solver.impliesNot("dm-types 1.2.1", "bcrypt-ruby 2.1.4");
  solver.implies("dm-types 1.2.1", "dm-core");
  solver.impliesNot("dm-types 1.2.1", "dm-core 0.9.11");
  solver.impliesNot("dm-types 1.2.1", "dm-core 0.10.0");
  solver.impliesNot("dm-types 1.2.1", "dm-core 0.10.1");
  solver.impliesNot("dm-types 1.2.1", "dm-core 0.10.2");
  solver.impliesNot("dm-types 1.2.1", "dm-core 1.0.2");
  solver.impliesNot("dm-types 1.2.1", "dm-core 1.1.0");
  solver.implies("dm-types 1.2.1", "fastercsv");
  solver.impliesNot("dm-types 1.2.1", "fastercsv 0.1.8");
  solver.impliesNot("dm-types 1.2.1", "fastercsv 0.1.9");
  solver.impliesNot("dm-types 1.2.1", "fastercsv 0.2.0");
  solver.impliesNot("dm-types 1.2.1", "fastercsv 0.2.1");
  solver.impliesNot("dm-types 1.2.1", "fastercsv 1.5.1");
  solver.impliesNot("dm-types 1.2.1", "fastercsv 1.5.3");
  solver.implies("dm-types 1.2.1", "multi-json");
  solver.impliesNot("dm-types 1.2.1", "multi-json 0.0.2");
  solver.impliesNot("dm-types 1.2.1", "multi-json 0.0.3");
  solver.impliesNot("dm-types 1.2.1", "multi-json 0.0.4");
  solver.impliesNot("dm-types 1.2.1", "multi-json 0.0.5");
  solver.implies("dm-types 1.2.1", "json");
  solver.impliesNot("dm-types 1.2.1", "json 0.4.0");
  solver.impliesNot("dm-types 1.2.1", "json 0.4.1");
  solver.impliesNot("dm-types 1.2.1", "json 0.4.2");
  solver.impliesNot("dm-types 1.2.1", "json 0.4.3");
  solver.implies("dm-types 1.2.1", "stringex");
  solver.implies("dm-types 1.2.1", "uuidtools");
  solver.impliesNot("dm-types 1.2.1", "uuidtools 0.1.1");
  solver.impliesNot("dm-types 1.2.1", "uuidtools 0.1.2");
  solver.impliesNot("dm-types 1.2.1", "uuidtools 0.1.3");
  solver.impliesNot("dm-types 1.2.1", "uuidtools 0.1.4");
  solver.impliesNot("dm-types 1.2.1", "uuidtools 1.0.4");
  solver.impliesNot("dm-types 1.2.1", "uuidtools 1.0.5");
  solver.impliesNot("dm-types 1.2.1", "uuidtools 1.0.6");
  solver.impliesNot("dm-types 1.2.1", "uuidtools 1.0.7");
  solver.impliesNot("dm-types 1.2.1", "uuidtools 2.1.1");
  solver.implies("dm-types 1.2.2", "bcrypt-ruby");
  solver.impliesNot("dm-types 1.2.2", "bcrypt-ruby 1.0.0");
  solver.impliesNot("dm-types 1.2.2", "bcrypt-ruby 2.1.1");
  solver.impliesNot("dm-types 1.2.2", "bcrypt-ruby 2.1.2");
  solver.impliesNot("dm-types 1.2.2", "bcrypt-ruby 2.1.3");
  solver.impliesNot("dm-types 1.2.2", "bcrypt-ruby 2.1.4");
  solver.implies("dm-types 1.2.2", "fastercsv");
  solver.impliesNot("dm-types 1.2.2", "fastercsv 0.1.8");
  solver.impliesNot("dm-types 1.2.2", "fastercsv 0.1.9");
  solver.impliesNot("dm-types 1.2.2", "fastercsv 0.2.0");
  solver.impliesNot("dm-types 1.2.2", "fastercsv 0.2.1");
  solver.implies("dm-types 1.2.2", "multi-json");
  solver.impliesNot("dm-types 1.2.2", "multi-json 0.0.2");
  solver.impliesNot("dm-types 1.2.2", "multi-json 0.0.3");
  solver.impliesNot("dm-types 1.2.2", "multi-json 0.0.4");
  solver.impliesNot("dm-types 1.2.2", "multi-json 0.0.5");
  solver.implies("dm-types 1.2.2", "json");
  solver.impliesNot("dm-types 1.2.2", "json 0.4.0");
  solver.impliesNot("dm-types 1.2.2", "json 0.4.1");
  solver.impliesNot("dm-types 1.2.2", "json 0.4.2");
  solver.impliesNot("dm-types 1.2.2", "json 0.4.3");
  solver.implies("dm-types 1.2.2", "stringex");
  solver.impliesNot("dm-types 1.2.2", "stringex 1.3.3");
  solver.implies("dm-types 1.2.2", "uuidtools");
  solver.impliesNot("dm-types 1.2.2", "uuidtools 0.1.1");
  solver.impliesNot("dm-types 1.2.2", "uuidtools 0.1.2");
  solver.impliesNot("dm-types 1.2.2", "uuidtools 0.1.3");
  solver.impliesNot("dm-types 1.2.2", "uuidtools 0.1.4");
  solver.impliesNot("dm-types 1.2.2", "uuidtools 1.0.4");
  solver.impliesNot("dm-types 1.2.2", "uuidtools 1.0.5");
  solver.impliesNot("dm-types 1.2.2", "uuidtools 1.0.6");
  solver.impliesNot("dm-types 1.2.2", "uuidtools 1.0.7");
  solver.implies("dm-types 1.2.2", "dm-core");
  solver.impliesNot("dm-types 1.2.2", "dm-core 0.9.11");
  solver.impliesNot("dm-types 1.2.2", "dm-core 0.10.0");
  solver.impliesNot("dm-types 1.2.2", "dm-core 0.10.1");
  solver.impliesNot("dm-types 1.2.2", "dm-core 0.10.2");
  solver.impliesNot("dm-types 1.2.2", "dm-core 1.0.2");
  solver.impliesNot("dm-types 1.2.2", "dm-core 1.1.0");
  solver.implies("stringex 1.5.0", "stringex");
  solver.implies("uuidtools 1.0.4", "rake");
  solver.implies("uuidtools 1.0.4", "rspec");
  solver.impliesNot("uuidtools 1.0.4", "rspec 0.20.0");
  solver.implies("uuidtools 1.0.5", "rake");
  solver.implies("uuidtools 1.0.5", "rspec");
  solver.impliesNot("uuidtools 1.0.5", "rspec 0.20.0");
  solver.implies("uuidtools 1.0.5", "launchy");
  solver.implies("uuidtools 1.0.6", "rake");
  solver.implies("uuidtools 1.0.6", "rspec");
  solver.impliesNot("uuidtools 1.0.6", "rspec 0.20.0");
  solver.implies("uuidtools 1.0.6", "launchy");
  solver.implies("uuidtools 1.0.7", "rake");
  solver.implies("uuidtools 1.0.7", "rspec");
  solver.impliesNot("uuidtools 1.0.7", "rspec 0.20.0");
  solver.implies("uuidtools 1.0.7", "launchy");
  solver.implies("bcrypt-ruby 3.1.3", "bcrypt");
  solver.implies("bcrypt-ruby 3.1.4", "bcrypt");
  solver.implies("bcrypt-ruby 3.1.5", "bcrypt");
  solver.implies("addressable 0.1.0", "rake");
  solver.implies("addressable 0.1.0", "rspec");
  solver.implies("addressable 0.1.1", "rake");
  solver.implies("addressable 0.1.1", "rspec");
  solver.implies("addressable 0.1.2", "rake");
  solver.implies("addressable 0.1.2", "rspec");
  solver.impliesNot("addressable 0.1.2", "rspec 0.20.0");
  solver.implies("addressable 1.0.1", "rake");
  solver.implies("addressable 1.0.1", "rspec");
  solver.impliesNot("addressable 1.0.1", "rspec 0.20.0");
  solver.implies("addressable 1.0.2", "rake");
  solver.implies("addressable 1.0.2", "rspec");
  solver.impliesNot("addressable 1.0.2", "rspec 0.20.0");
  solver.implies("addressable 1.0.3", "rake");
  solver.implies("addressable 1.0.3", "rspec");
  solver.impliesNot("addressable 1.0.3", "rspec 0.20.0");
  solver.implies("addressable 1.0.4", "rake");
  solver.implies("addressable 1.0.4", "rspec");
  solver.impliesNot("addressable 1.0.4", "rspec 0.20.0");
  solver.implies("dm-validations 0.9.11", "dm-core");
  solver.impliesNot("dm-validations 0.9.11", "dm-core 0.10.0");
  solver.impliesNot("dm-validations 0.9.11", "dm-core 0.10.1");
  solver.impliesNot("dm-validations 0.9.11", "dm-core 0.10.2");
  solver.impliesNot("dm-validations 0.9.11", "dm-core 1.0.2");
  solver.impliesNot("dm-validations 0.9.11", "dm-core 1.1.0");
  solver.impliesNot("dm-validations 0.9.11", "dm-core 1.2.0");
  solver.impliesNot("dm-validations 0.9.11", "dm-core 1.2.1");
  solver.implies("dm-validations 0.10.1", "dm-core");
  solver.impliesNot("dm-validations 0.10.1", "dm-core 0.9.11");
  solver.impliesNot("dm-validations 0.10.1", "dm-core 0.10.0");
  solver.impliesNot("dm-validations 0.10.1", "dm-core 0.10.2");
  solver.impliesNot("dm-validations 0.10.1", "dm-core 1.0.2");
  solver.impliesNot("dm-validations 0.10.1", "dm-core 1.1.0");
  solver.impliesNot("dm-validations 0.10.1", "dm-core 1.2.0");
  solver.impliesNot("dm-validations 0.10.1", "dm-core 1.2.1");
  solver.implies("dm-validations 0.10.2", "dm-core");
  solver.impliesNot("dm-validations 0.10.2", "dm-core 0.9.11");
  solver.impliesNot("dm-validations 0.10.2", "dm-core 0.10.0");
  solver.impliesNot("dm-validations 0.10.2", "dm-core 0.10.1");
  solver.implies("dm-validations 1.0.1", "dm-core");
  solver.impliesNot("dm-validations 1.0.1", "dm-core 0.9.11");
  solver.impliesNot("dm-validations 1.0.1", "dm-core 0.10.0");
  solver.impliesNot("dm-validations 1.0.1", "dm-core 0.10.1");
  solver.impliesNot("dm-validations 1.0.1", "dm-core 0.10.2");
  solver.implies("dm-validations 1.0.2", "dm-core");
  solver.impliesNot("dm-validations 1.0.2", "dm-core 0.9.11");
  solver.impliesNot("dm-validations 1.0.2", "dm-core 0.10.0");
  solver.impliesNot("dm-validations 1.0.2", "dm-core 0.10.1");
  solver.impliesNot("dm-validations 1.0.2", "dm-core 0.10.2");
  solver.implies("dm-validations 1.1.0", "dm-core");
  solver.impliesNot("dm-validations 1.1.0", "dm-core 0.9.11");
  solver.impliesNot("dm-validations 1.1.0", "dm-core 0.10.0");
  solver.impliesNot("dm-validations 1.1.0", "dm-core 0.10.1");
  solver.impliesNot("dm-validations 1.1.0", "dm-core 0.10.2");
  solver.impliesNot("dm-validations 1.1.0", "dm-core 1.0.2");
  solver.implies("dm-validations 1.2.0", "dm-core");
  solver.impliesNot("dm-validations 1.2.0", "dm-core 0.9.11");
  solver.impliesNot("dm-validations 1.2.0", "dm-core 0.10.0");
  solver.impliesNot("dm-validations 1.2.0", "dm-core 0.10.1");
  solver.impliesNot("dm-validations 1.2.0", "dm-core 0.10.2");
  solver.impliesNot("dm-validations 1.2.0", "dm-core 1.0.2");
  solver.impliesNot("dm-validations 1.2.0", "dm-core 1.1.0");
  solver.implies("dm-timestamps 0.9.11", "dm-core");
  solver.impliesNot("dm-timestamps 0.9.11", "dm-core 0.10.0");
  solver.impliesNot("dm-timestamps 0.9.11", "dm-core 0.10.1");
  solver.impliesNot("dm-timestamps 0.9.11", "dm-core 0.10.2");
  solver.impliesNot("dm-timestamps 0.9.11", "dm-core 1.0.2");
  solver.impliesNot("dm-timestamps 0.9.11", "dm-core 1.1.0");
  solver.impliesNot("dm-timestamps 0.9.11", "dm-core 1.2.0");
  solver.impliesNot("dm-timestamps 0.9.11", "dm-core 1.2.1");
  solver.implies("dm-timestamps 0.10.1", "dm-core");
  solver.impliesNot("dm-timestamps 0.10.1", "dm-core 0.9.11");
  solver.impliesNot("dm-timestamps 0.10.1", "dm-core 0.10.0");
  solver.impliesNot("dm-timestamps 0.10.1", "dm-core 0.10.2");
  solver.impliesNot("dm-timestamps 0.10.1", "dm-core 1.0.2");
  solver.impliesNot("dm-timestamps 0.10.1", "dm-core 1.1.0");
  solver.impliesNot("dm-timestamps 0.10.1", "dm-core 1.2.0");
  solver.impliesNot("dm-timestamps 0.10.1", "dm-core 1.2.1");
  solver.implies("dm-timestamps 0.10.2", "dm-core");
  solver.impliesNot("dm-timestamps 0.10.2", "dm-core 0.9.11");
  solver.impliesNot("dm-timestamps 0.10.2", "dm-core 0.10.0");
  solver.impliesNot("dm-timestamps 0.10.2", "dm-core 0.10.1");
  solver.implies("dm-timestamps 1.0.1", "dm-core");
  solver.impliesNot("dm-timestamps 1.0.1", "dm-core 0.9.11");
  solver.impliesNot("dm-timestamps 1.0.1", "dm-core 0.10.0");
  solver.impliesNot("dm-timestamps 1.0.1", "dm-core 0.10.1");
  solver.impliesNot("dm-timestamps 1.0.1", "dm-core 0.10.2");
  solver.implies("dm-timestamps 1.0.2", "dm-core");
  solver.impliesNot("dm-timestamps 1.0.2", "dm-core 0.9.11");
  solver.impliesNot("dm-timestamps 1.0.2", "dm-core 0.10.0");
  solver.impliesNot("dm-timestamps 1.0.2", "dm-core 0.10.1");
  solver.impliesNot("dm-timestamps 1.0.2", "dm-core 0.10.2");
  solver.implies("dm-timestamps 1.1.0", "dm-core");
  solver.impliesNot("dm-timestamps 1.1.0", "dm-core 0.9.11");
  solver.impliesNot("dm-timestamps 1.1.0", "dm-core 0.10.0");
  solver.impliesNot("dm-timestamps 1.1.0", "dm-core 0.10.1");
  solver.impliesNot("dm-timestamps 1.1.0", "dm-core 0.10.2");
  solver.impliesNot("dm-timestamps 1.1.0", "dm-core 1.0.2");
  solver.implies("dm-timestamps 1.2.0", "dm-core");
  solver.impliesNot("dm-timestamps 1.2.0", "dm-core 0.9.11");
  solver.impliesNot("dm-timestamps 1.2.0", "dm-core 0.10.0");
  solver.impliesNot("dm-timestamps 1.2.0", "dm-core 0.10.1");
  solver.impliesNot("dm-timestamps 1.2.0", "dm-core 0.10.2");
  solver.impliesNot("dm-timestamps 1.2.0", "dm-core 1.0.2");
  solver.impliesNot("dm-timestamps 1.2.0", "dm-core 1.1.0");
  solver.implies("dm-serializer 0.9.11", "dm-core");
  solver.impliesNot("dm-serializer 0.9.11", "dm-core 0.10.0");
  solver.impliesNot("dm-serializer 0.9.11", "dm-core 0.10.1");
  solver.impliesNot("dm-serializer 0.9.11", "dm-core 0.10.2");
  solver.impliesNot("dm-serializer 0.9.11", "dm-core 1.0.2");
  solver.impliesNot("dm-serializer 0.9.11", "dm-core 1.1.0");
  solver.impliesNot("dm-serializer 0.9.11", "dm-core 1.2.0");
  solver.impliesNot("dm-serializer 0.9.11", "dm-core 1.2.1");
  solver.implies("dm-serializer 0.10.1", "dm-core");
  solver.impliesNot("dm-serializer 0.10.1", "dm-core 0.9.11");
  solver.impliesNot("dm-serializer 0.10.1", "dm-core 0.10.0");
  solver.impliesNot("dm-serializer 0.10.1", "dm-core 0.10.2");
  solver.impliesNot("dm-serializer 0.10.1", "dm-core 1.0.2");
  solver.impliesNot("dm-serializer 0.10.1", "dm-core 1.1.0");
  solver.impliesNot("dm-serializer 0.10.1", "dm-core 1.2.0");
  solver.impliesNot("dm-serializer 0.10.1", "dm-core 1.2.1");
  solver.implies("dm-serializer 0.10.2", "dm-core");
  solver.impliesNot("dm-serializer 0.10.2", "dm-core 0.9.11");
  solver.impliesNot("dm-serializer 0.10.2", "dm-core 0.10.0");
  solver.impliesNot("dm-serializer 0.10.2", "dm-core 0.10.1");
  solver.implies("dm-serializer 0.10.2", "fastercsv");
  solver.impliesNot("dm-serializer 0.10.2", "fastercsv 0.1.8");
  solver.impliesNot("dm-serializer 0.10.2", "fastercsv 0.1.9");
  solver.impliesNot("dm-serializer 0.10.2", "fastercsv 0.2.0");
  solver.impliesNot("dm-serializer 0.10.2", "fastercsv 0.2.1");
  solver.implies("dm-serializer 0.10.2", "json-pure");
  solver.implies("dm-serializer 1.1.0", "dm-core");
  solver.impliesNot("dm-serializer 1.1.0", "dm-core 0.9.11");
  solver.impliesNot("dm-serializer 1.1.0", "dm-core 0.10.0");
  solver.impliesNot("dm-serializer 1.1.0", "dm-core 0.10.1");
  solver.impliesNot("dm-serializer 1.1.0", "dm-core 0.10.2");
  solver.impliesNot("dm-serializer 1.1.0", "dm-core 1.0.2");
  solver.implies("dm-serializer 1.1.0", "fastercsv");
  solver.impliesNot("dm-serializer 1.1.0", "fastercsv 0.1.8");
  solver.impliesNot("dm-serializer 1.1.0", "fastercsv 0.1.9");
  solver.impliesNot("dm-serializer 1.1.0", "fastercsv 0.2.0");
  solver.impliesNot("dm-serializer 1.1.0", "fastercsv 0.2.1");
  solver.impliesNot("dm-serializer 1.1.0", "fastercsv 1.5.1");
  solver.impliesNot("dm-serializer 1.1.0", "fastercsv 1.5.3");
  solver.implies("dm-serializer 1.1.0", "json");
  solver.impliesNot("dm-serializer 1.1.0", "json 0.4.0");
  solver.impliesNot("dm-serializer 1.1.0", "json 0.4.1");
  solver.impliesNot("dm-serializer 1.1.0", "json 0.4.2");
  solver.impliesNot("dm-serializer 1.1.0", "json 0.4.3");
  solver.implies("dm-serializer 1.2.0", "dm-core");
  solver.impliesNot("dm-serializer 1.2.0", "dm-core 0.9.11");
  solver.impliesNot("dm-serializer 1.2.0", "dm-core 0.10.0");
  solver.impliesNot("dm-serializer 1.2.0", "dm-core 0.10.1");
  solver.impliesNot("dm-serializer 1.2.0", "dm-core 0.10.2");
  solver.impliesNot("dm-serializer 1.2.0", "dm-core 1.0.2");
  solver.impliesNot("dm-serializer 1.2.0", "dm-core 1.1.0");
  solver.implies("dm-serializer 1.2.0", "fastercsv");
  solver.impliesNot("dm-serializer 1.2.0", "fastercsv 0.1.8");
  solver.impliesNot("dm-serializer 1.2.0", "fastercsv 0.1.9");
  solver.impliesNot("dm-serializer 1.2.0", "fastercsv 0.2.0");
  solver.impliesNot("dm-serializer 1.2.0", "fastercsv 0.2.1");
  solver.impliesNot("dm-serializer 1.2.0", "fastercsv 1.5.1");
  solver.impliesNot("dm-serializer 1.2.0", "fastercsv 1.5.3");
  solver.implies("dm-serializer 1.2.0", "multi-json");
  solver.impliesNot("dm-serializer 1.2.0", "multi-json 0.0.2");
  solver.impliesNot("dm-serializer 1.2.0", "multi-json 0.0.3");
  solver.impliesNot("dm-serializer 1.2.0", "multi-json 0.0.4");
  solver.impliesNot("dm-serializer 1.2.0", "multi-json 0.0.5");
  solver.implies("dm-serializer 1.2.0", "json");
  solver.impliesNot("dm-serializer 1.2.0", "json 0.4.0");
  solver.impliesNot("dm-serializer 1.2.0", "json 0.4.1");
  solver.impliesNot("dm-serializer 1.2.0", "json 0.4.2");
  solver.impliesNot("dm-serializer 1.2.0", "json 0.4.3");
  solver.implies("dm-serializer 1.2.0", "json-pure");
  solver.implies("dm-serializer 1.2.1", "dm-core");
  solver.impliesNot("dm-serializer 1.2.1", "dm-core 0.9.11");
  solver.impliesNot("dm-serializer 1.2.1", "dm-core 0.10.0");
  solver.impliesNot("dm-serializer 1.2.1", "dm-core 0.10.1");
  solver.impliesNot("dm-serializer 1.2.1", "dm-core 0.10.2");
  solver.impliesNot("dm-serializer 1.2.1", "dm-core 1.0.2");
  solver.impliesNot("dm-serializer 1.2.1", "dm-core 1.1.0");
  solver.implies("dm-serializer 1.2.1", "fastercsv");
  solver.impliesNot("dm-serializer 1.2.1", "fastercsv 0.1.8");
  solver.impliesNot("dm-serializer 1.2.1", "fastercsv 0.1.9");
  solver.impliesNot("dm-serializer 1.2.1", "fastercsv 0.2.0");
  solver.impliesNot("dm-serializer 1.2.1", "fastercsv 0.2.1");
  solver.impliesNot("dm-serializer 1.2.1", "fastercsv 1.5.1");
  solver.impliesNot("dm-serializer 1.2.1", "fastercsv 1.5.3");
  solver.implies("dm-serializer 1.2.1", "multi-json");
  solver.impliesNot("dm-serializer 1.2.1", "multi-json 0.0.2");
  solver.impliesNot("dm-serializer 1.2.1", "multi-json 0.0.3");
  solver.impliesNot("dm-serializer 1.2.1", "multi-json 0.0.4");
  solver.impliesNot("dm-serializer 1.2.1", "multi-json 0.0.5");
  solver.implies("dm-serializer 1.2.1", "json");
  solver.impliesNot("dm-serializer 1.2.1", "json 0.4.0");
  solver.impliesNot("dm-serializer 1.2.1", "json 0.4.1");
  solver.impliesNot("dm-serializer 1.2.1", "json 0.4.2");
  solver.impliesNot("dm-serializer 1.2.1", "json 0.4.3");
  solver.implies("dm-serializer 1.2.1", "json-pure");
  solver.implies("dm-serializer 1.2.2", "fastercsv");
  solver.impliesNot("dm-serializer 1.2.2", "fastercsv 0.1.8");
  solver.impliesNot("dm-serializer 1.2.2", "fastercsv 0.1.9");
  solver.impliesNot("dm-serializer 1.2.2", "fastercsv 0.2.0");
  solver.impliesNot("dm-serializer 1.2.2", "fastercsv 0.2.1");
  solver.implies("dm-serializer 1.2.2", "multi-json");
  solver.impliesNot("dm-serializer 1.2.2", "multi-json 0.0.2");
  solver.impliesNot("dm-serializer 1.2.2", "multi-json 0.0.3");
  solver.impliesNot("dm-serializer 1.2.2", "multi-json 0.0.4");
  solver.impliesNot("dm-serializer 1.2.2", "multi-json 0.0.5");
  solver.implies("dm-serializer 1.2.2", "json");
  solver.impliesNot("dm-serializer 1.2.2", "json 0.4.0");
  solver.impliesNot("dm-serializer 1.2.2", "json 0.4.1");
  solver.impliesNot("dm-serializer 1.2.2", "json 0.4.2");
  solver.impliesNot("dm-serializer 1.2.2", "json 0.4.3");
  solver.implies("dm-serializer 1.2.2", "json-pure");
  solver.implies("dm-serializer 1.2.2", "dm-core");
  solver.impliesNot("dm-serializer 1.2.2", "dm-core 0.9.11");
  solver.impliesNot("dm-serializer 1.2.2", "dm-core 0.10.0");
  solver.impliesNot("dm-serializer 1.2.2", "dm-core 0.10.1");
  solver.impliesNot("dm-serializer 1.2.2", "dm-core 0.10.2");
  solver.impliesNot("dm-serializer 1.2.2", "dm-core 1.0.2");
  solver.impliesNot("dm-serializer 1.2.2", "dm-core 1.1.0");
  solver.implies("dm-migrations 0.9.11", "dm-core");
  solver.impliesNot("dm-migrations 0.9.11", "dm-core 0.10.0");
  solver.impliesNot("dm-migrations 0.9.11", "dm-core 0.10.1");
  solver.impliesNot("dm-migrations 0.9.11", "dm-core 0.10.2");
  solver.impliesNot("dm-migrations 0.9.11", "dm-core 1.0.2");
  solver.impliesNot("dm-migrations 0.9.11", "dm-core 1.1.0");
  solver.impliesNot("dm-migrations 0.9.11", "dm-core 1.2.0");
  solver.impliesNot("dm-migrations 0.9.11", "dm-core 1.2.1");
  solver.implies("dm-migrations 0.10.1", "dm-core");
  solver.impliesNot("dm-migrations 0.10.1", "dm-core 0.9.11");
  solver.impliesNot("dm-migrations 0.10.1", "dm-core 0.10.0");
  solver.impliesNot("dm-migrations 0.10.1", "dm-core 0.10.2");
  solver.impliesNot("dm-migrations 0.10.1", "dm-core 1.0.2");
  solver.impliesNot("dm-migrations 0.10.1", "dm-core 1.1.0");
  solver.impliesNot("dm-migrations 0.10.1", "dm-core 1.2.0");
  solver.impliesNot("dm-migrations 0.10.1", "dm-core 1.2.1");
  solver.implies("dm-migrations 0.10.2", "dm-core");
  solver.impliesNot("dm-migrations 0.10.2", "dm-core 0.9.11");
  solver.impliesNot("dm-migrations 0.10.2", "dm-core 0.10.0");
  solver.impliesNot("dm-migrations 0.10.2", "dm-core 0.10.1");
  solver.implies("dm-migrations 1.0.1", "dm-core");
  solver.impliesNot("dm-migrations 1.0.1", "dm-core 0.9.11");
  solver.impliesNot("dm-migrations 1.0.1", "dm-core 0.10.0");
  solver.impliesNot("dm-migrations 1.0.1", "dm-core 0.10.1");
  solver.impliesNot("dm-migrations 1.0.1", "dm-core 0.10.2");
  solver.implies("dm-migrations 1.0.2", "dm-core");
  solver.impliesNot("dm-migrations 1.0.2", "dm-core 0.9.11");
  solver.impliesNot("dm-migrations 1.0.2", "dm-core 0.10.0");
  solver.impliesNot("dm-migrations 1.0.2", "dm-core 0.10.1");
  solver.impliesNot("dm-migrations 1.0.2", "dm-core 0.10.2");
  solver.implies("dm-migrations 1.1.0", "dm-core");
  solver.impliesNot("dm-migrations 1.1.0", "dm-core 0.9.11");
  solver.impliesNot("dm-migrations 1.1.0", "dm-core 0.10.0");
  solver.impliesNot("dm-migrations 1.1.0", "dm-core 0.10.1");
  solver.impliesNot("dm-migrations 1.1.0", "dm-core 0.10.2");
  solver.impliesNot("dm-migrations 1.1.0", "dm-core 1.0.2");
  solver.implies("dm-migrations 1.2.0", "dm-core");
  solver.impliesNot("dm-migrations 1.2.0", "dm-core 0.9.11");
  solver.impliesNot("dm-migrations 1.2.0", "dm-core 0.10.0");
  solver.impliesNot("dm-migrations 1.2.0", "dm-core 0.10.1");
  solver.impliesNot("dm-migrations 1.2.0", "dm-core 0.10.2");
  solver.impliesNot("dm-migrations 1.2.0", "dm-core 1.0.2");
  solver.impliesNot("dm-migrations 1.2.0", "dm-core 1.1.0");
  solver.implies("dm-aggregates 0.9.11", "dm-core");
  solver.impliesNot("dm-aggregates 0.9.11", "dm-core 0.10.0");
  solver.impliesNot("dm-aggregates 0.9.11", "dm-core 0.10.1");
  solver.impliesNot("dm-aggregates 0.9.11", "dm-core 0.10.2");
  solver.impliesNot("dm-aggregates 0.9.11", "dm-core 1.0.2");
  solver.impliesNot("dm-aggregates 0.9.11", "dm-core 1.1.0");
  solver.impliesNot("dm-aggregates 0.9.11", "dm-core 1.2.0");
  solver.impliesNot("dm-aggregates 0.9.11", "dm-core 1.2.1");
  solver.implies("dm-aggregates 0.10.1", "dm-core");
  solver.impliesNot("dm-aggregates 0.10.1", "dm-core 0.9.11");
  solver.impliesNot("dm-aggregates 0.10.1", "dm-core 0.10.0");
  solver.impliesNot("dm-aggregates 0.10.1", "dm-core 0.10.2");
  solver.impliesNot("dm-aggregates 0.10.1", "dm-core 1.0.2");
  solver.impliesNot("dm-aggregates 0.10.1", "dm-core 1.1.0");
  solver.impliesNot("dm-aggregates 0.10.1", "dm-core 1.2.0");
  solver.impliesNot("dm-aggregates 0.10.1", "dm-core 1.2.1");
  solver.implies("dm-aggregates 0.10.2", "dm-core");
  solver.impliesNot("dm-aggregates 0.10.2", "dm-core 0.9.11");
  solver.impliesNot("dm-aggregates 0.10.2", "dm-core 0.10.0");
  solver.impliesNot("dm-aggregates 0.10.2", "dm-core 0.10.1");
  solver.implies("dm-aggregates 1.0.1", "dm-core");
  solver.impliesNot("dm-aggregates 1.0.1", "dm-core 0.9.11");
  solver.impliesNot("dm-aggregates 1.0.1", "dm-core 0.10.0");
  solver.impliesNot("dm-aggregates 1.0.1", "dm-core 0.10.1");
  solver.impliesNot("dm-aggregates 1.0.1", "dm-core 0.10.2");
  solver.implies("dm-aggregates 1.0.2", "dm-core");
  solver.impliesNot("dm-aggregates 1.0.2", "dm-core 0.9.11");
  solver.impliesNot("dm-aggregates 1.0.2", "dm-core 0.10.0");
  solver.impliesNot("dm-aggregates 1.0.2", "dm-core 0.10.1");
  solver.impliesNot("dm-aggregates 1.0.2", "dm-core 0.10.2");
  solver.implies("dm-aggregates 1.1.0", "dm-core");
  solver.impliesNot("dm-aggregates 1.1.0", "dm-core 0.9.11");
  solver.impliesNot("dm-aggregates 1.1.0", "dm-core 0.10.0");
  solver.impliesNot("dm-aggregates 1.1.0", "dm-core 0.10.1");
  solver.impliesNot("dm-aggregates 1.1.0", "dm-core 0.10.2");
  solver.impliesNot("dm-aggregates 1.1.0", "dm-core 1.0.2");
  solver.implies("dm-aggregates 1.2.0", "dm-core");
  solver.impliesNot("dm-aggregates 1.2.0", "dm-core 0.9.11");
  solver.impliesNot("dm-aggregates 1.2.0", "dm-core 0.10.0");
  solver.impliesNot("dm-aggregates 1.2.0", "dm-core 0.10.1");
  solver.impliesNot("dm-aggregates 1.2.0", "dm-core 0.10.2");
  solver.impliesNot("dm-aggregates 1.2.0", "dm-core 1.0.2");
  solver.impliesNot("dm-aggregates 1.2.0", "dm-core 1.1.0");
  solver.implies("dm-core 0.9.11", "data-objects");
  solver.isFalse("dm-core 0.9.11");
  solver.implies("dm-core 0.9.11", "addressable");
  solver.impliesNot("dm-core 0.9.11", "addressable 0.1.0");
  solver.impliesNot("dm-core 0.9.11", "addressable 0.1.1");
  solver.impliesNot("dm-core 0.9.11", "addressable 0.1.2");
  solver.impliesNot("dm-core 0.9.11", "addressable 1.0.1");
  solver.impliesNot("dm-core 0.9.11", "addressable 1.0.2");
  solver.impliesNot("dm-core 0.9.11", "addressable 1.0.3");
  solver.impliesNot("dm-core 0.9.11", "addressable 1.0.4");
  solver.isFalse("dm-core 0.10.1");
  solver.implies("dm-core 0.10.1", "addressable");
  solver.impliesNot("dm-core 0.10.1", "addressable 0.1.0");
  solver.impliesNot("dm-core 0.10.1", "addressable 0.1.1");
  solver.impliesNot("dm-core 0.10.1", "addressable 0.1.2");
  solver.impliesNot("dm-core 0.10.1", "addressable 1.0.1");
  solver.impliesNot("dm-core 0.10.1", "addressable 1.0.2");
  solver.impliesNot("dm-core 0.10.1", "addressable 1.0.3");
  solver.impliesNot("dm-core 0.10.1", "addressable 1.0.4");
  solver.isFalse("dm-core 0.10.2");
  solver.implies("dm-core 0.10.2", "addressable");
  solver.impliesNot("dm-core 0.10.2", "addressable 0.1.0");
  solver.impliesNot("dm-core 0.10.2", "addressable 0.1.1");
  solver.impliesNot("dm-core 0.10.2", "addressable 0.1.2");
  solver.impliesNot("dm-core 0.10.2", "addressable 1.0.1");
  solver.impliesNot("dm-core 0.10.2", "addressable 1.0.2");
  solver.impliesNot("dm-core 0.10.2", "addressable 1.0.3");
  solver.impliesNot("dm-core 0.10.2", "addressable 1.0.4");
  solver.isFalse("dm-core 1.0.2");
  solver.implies("dm-core 1.0.2", "addressable");
  solver.impliesNot("dm-core 1.0.2", "addressable 0.1.0");
  solver.impliesNot("dm-core 1.0.2", "addressable 0.1.1");
  solver.impliesNot("dm-core 1.0.2", "addressable 0.1.2");
  solver.impliesNot("dm-core 1.0.2", "addressable 1.0.1");
  solver.impliesNot("dm-core 1.0.2", "addressable 1.0.2");
  solver.impliesNot("dm-core 1.0.2", "addressable 1.0.3");
  solver.impliesNot("dm-core 1.0.2", "addressable 1.0.4");
  solver.implies("dm-core 1.1.0", "addressable");
  solver.impliesNot("dm-core 1.1.0", "addressable 0.1.0");
  solver.impliesNot("dm-core 1.1.0", "addressable 0.1.1");
  solver.impliesNot("dm-core 1.1.0", "addressable 0.1.2");
  solver.impliesNot("dm-core 1.1.0", "addressable 1.0.1");
  solver.impliesNot("dm-core 1.1.0", "addressable 1.0.2");
  solver.impliesNot("dm-core 1.1.0", "addressable 1.0.3");
  solver.impliesNot("dm-core 1.1.0", "addressable 1.0.4");
  solver.implies("dm-core 1.2.0", "addressable");
  solver.impliesNot("dm-core 1.2.0", "addressable 0.1.0");
  solver.impliesNot("dm-core 1.2.0", "addressable 0.1.1");
  solver.impliesNot("dm-core 1.2.0", "addressable 0.1.2");
  solver.impliesNot("dm-core 1.2.0", "addressable 1.0.1");
  solver.impliesNot("dm-core 1.2.0", "addressable 1.0.2");
  solver.impliesNot("dm-core 1.2.0", "addressable 1.0.3");
  solver.impliesNot("dm-core 1.2.0", "addressable 1.0.4");
  solver.implies("dm-core 1.2.1", "addressable");
  solver.impliesNot("dm-core 1.2.1", "addressable 0.1.0");
  solver.impliesNot("dm-core 1.2.1", "addressable 0.1.1");
  solver.impliesNot("dm-core 1.2.1", "addressable 0.1.2");
  solver.impliesNot("dm-core 1.2.1", "addressable 1.0.1");
  solver.impliesNot("dm-core 1.2.1", "addressable 1.0.2");
  solver.impliesNot("dm-core 1.2.1", "addressable 1.0.3");
  solver.impliesNot("dm-core 1.2.1", "addressable 1.0.4");
  solver.implies("data-objects 0.10.11", "addressable");
  solver.impliesNot("data-objects 0.10.11", "addressable 0.1.0");
  solver.impliesNot("data-objects 0.10.11", "addressable 0.1.1");
  solver.impliesNot("data-objects 0.10.11", "addressable 0.1.2");
  solver.impliesNot("data-objects 0.10.11", "addressable 1.0.1");
  solver.impliesNot("data-objects 0.10.11", "addressable 1.0.2");
  solver.impliesNot("data-objects 0.10.11", "addressable 1.0.3");
  solver.impliesNot("data-objects 0.10.11", "addressable 1.0.4");
  solver.implies("data-objects 0.10.12", "addressable");
  solver.impliesNot("data-objects 0.10.12", "addressable 0.1.0");
  solver.impliesNot("data-objects 0.10.12", "addressable 0.1.1");
  solver.impliesNot("data-objects 0.10.12", "addressable 0.1.2");
  solver.impliesNot("data-objects 0.10.12", "addressable 1.0.1");
  solver.impliesNot("data-objects 0.10.12", "addressable 1.0.2");
  solver.impliesNot("data-objects 0.10.12", "addressable 1.0.3");
  solver.impliesNot("data-objects 0.10.12", "addressable 1.0.4");
  solver.implies("data-objects 0.10.13", "addressable");
  solver.impliesNot("data-objects 0.10.13", "addressable 0.1.0");
  solver.impliesNot("data-objects 0.10.13", "addressable 0.1.1");
  solver.impliesNot("data-objects 0.10.13", "addressable 0.1.2");
  solver.impliesNot("data-objects 0.10.13", "addressable 1.0.1");
  solver.impliesNot("data-objects 0.10.13", "addressable 1.0.2");
  solver.impliesNot("data-objects 0.10.13", "addressable 1.0.3");
  solver.impliesNot("data-objects 0.10.13", "addressable 1.0.4");
  solver.implies("data-objects 0.10.14", "addressable");
  solver.impliesNot("data-objects 0.10.14", "addressable 0.1.0");
  solver.impliesNot("data-objects 0.10.14", "addressable 0.1.1");
  solver.impliesNot("data-objects 0.10.14", "addressable 0.1.2");
  solver.impliesNot("data-objects 0.10.14", "addressable 1.0.1");
  solver.impliesNot("data-objects 0.10.14", "addressable 1.0.2");
  solver.impliesNot("data-objects 0.10.14", "addressable 1.0.3");
  solver.impliesNot("data-objects 0.10.14", "addressable 1.0.4");
  solver.implies("capistrano 1.3.1", "rake");
  solver.implies("capistrano 1.3.1", "net-ssh");
  solver.impliesNot("capistrano 1.3.1", "net-ssh 0.5.0");
  solver.impliesNot("capistrano 1.3.1", "net-ssh 0.6.0");
  solver.impliesNot("capistrano 1.3.1", "net-ssh 0.9.0");
  solver.implies("capistrano 1.3.1", "net-sftp");
  solver.impliesNot("capistrano 1.3.1", "net-sftp 0.5.0");
  solver.impliesNot("capistrano 1.3.1", "net-sftp 0.9.0");
  solver.impliesNot("capistrano 1.3.1", "net-sftp 1.0.0");
  solver.impliesNot("capistrano 1.3.1", "net-sftp 1.0.1");
  solver.implies("capistrano 1.4.0", "rake");
  solver.implies("capistrano 1.4.0", "net-ssh");
  solver.impliesNot("capistrano 1.4.0", "net-ssh 0.5.0");
  solver.impliesNot("capistrano 1.4.0", "net-ssh 0.6.0");
  solver.impliesNot("capistrano 1.4.0", "net-ssh 0.9.0");
  solver.implies("capistrano 1.4.0", "net-sftp");
  solver.impliesNot("capistrano 1.4.0", "net-sftp 0.5.0");
  solver.impliesNot("capistrano 1.4.0", "net-sftp 0.9.0");
  solver.impliesNot("capistrano 1.4.0", "net-sftp 1.0.0");
  solver.impliesNot("capistrano 1.4.0", "net-sftp 1.0.1");
  solver.implies("capistrano 1.4.1", "rake");
  solver.implies("capistrano 1.4.1", "net-ssh");
  solver.impliesNot("capistrano 1.4.1", "net-ssh 0.5.0");
  solver.impliesNot("capistrano 1.4.1", "net-ssh 0.6.0");
  solver.impliesNot("capistrano 1.4.1", "net-ssh 0.9.0");
  solver.implies("capistrano 1.4.1", "net-sftp");
  solver.impliesNot("capistrano 1.4.1", "net-sftp 0.5.0");
  solver.impliesNot("capistrano 1.4.1", "net-sftp 0.9.0");
  solver.impliesNot("capistrano 1.4.1", "net-sftp 1.0.0");
  solver.impliesNot("capistrano 1.4.1", "net-sftp 1.0.1");
  solver.implies("capistrano 1.4.2", "rake");
  solver.implies("capistrano 1.4.2", "net-ssh");
  solver.impliesNot("capistrano 1.4.2", "net-ssh 0.5.0");
  solver.impliesNot("capistrano 1.4.2", "net-ssh 0.6.0");
  solver.impliesNot("capistrano 1.4.2", "net-ssh 0.9.0");
  solver.implies("capistrano 1.4.2", "net-sftp");
  solver.impliesNot("capistrano 1.4.2", "net-sftp 0.5.0");
  solver.impliesNot("capistrano 1.4.2", "net-sftp 0.9.0");
  solver.impliesNot("capistrano 1.4.2", "net-sftp 1.0.0");
  solver.impliesNot("capistrano 1.4.2", "net-sftp 1.0.1");
  solver.implies("capistrano 2.15.2", "highline");
  solver.implies("capistrano 2.15.2", "net-ssh");
  solver.impliesNot("capistrano 2.15.2", "net-ssh 0.5.0");
  solver.impliesNot("capistrano 2.15.2", "net-ssh 0.6.0");
  solver.impliesNot("capistrano 2.15.2", "net-ssh 0.9.0");
  solver.impliesNot("capistrano 2.15.2", "net-ssh 1.1.1");
  solver.impliesNot("capistrano 2.15.2", "net-ssh 1.1.2");
  solver.impliesNot("capistrano 2.15.2", "net-ssh 1.1.3");
  solver.impliesNot("capistrano 2.15.2", "net-ssh 1.1.4");
  solver.implies("capistrano 2.15.2", "net-sftp");
  solver.impliesNot("capistrano 2.15.2", "net-sftp 0.5.0");
  solver.impliesNot("capistrano 2.15.2", "net-sftp 0.9.0");
  solver.impliesNot("capistrano 2.15.2", "net-sftp 1.0.0");
  solver.impliesNot("capistrano 2.15.2", "net-sftp 1.0.1");
  solver.impliesNot("capistrano 2.15.2", "net-sftp 1.1.0");
  solver.impliesNot("capistrano 2.15.2", "net-sftp 1.1.1");
  solver.implies("capistrano 2.15.2", "net-scp");
  solver.implies("capistrano 2.15.2", "net-ssh-gateway");
  solver.impliesNot("capistrano 2.15.2", "net-ssh-gateway 1.0.0");
  solver.impliesNot("capistrano 2.15.2", "net-ssh-gateway 1.0.1");
  solver.implies("capistrano 2.15.3", "highline");
  solver.implies("capistrano 2.15.3", "net-ssh");
  solver.impliesNot("capistrano 2.15.3", "net-ssh 0.5.0");
  solver.impliesNot("capistrano 2.15.3", "net-ssh 0.6.0");
  solver.impliesNot("capistrano 2.15.3", "net-ssh 0.9.0");
  solver.impliesNot("capistrano 2.15.3", "net-ssh 1.1.1");
  solver.impliesNot("capistrano 2.15.3", "net-ssh 1.1.2");
  solver.impliesNot("capistrano 2.15.3", "net-ssh 1.1.3");
  solver.impliesNot("capistrano 2.15.3", "net-ssh 1.1.4");
  solver.implies("capistrano 2.15.3", "net-sftp");
  solver.impliesNot("capistrano 2.15.3", "net-sftp 0.5.0");
  solver.impliesNot("capistrano 2.15.3", "net-sftp 0.9.0");
  solver.impliesNot("capistrano 2.15.3", "net-sftp 1.0.0");
  solver.impliesNot("capistrano 2.15.3", "net-sftp 1.0.1");
  solver.impliesNot("capistrano 2.15.3", "net-sftp 1.1.0");
  solver.impliesNot("capistrano 2.15.3", "net-sftp 1.1.1");
  solver.implies("capistrano 2.15.3", "net-scp");
  solver.implies("capistrano 2.15.3", "net-ssh-gateway");
  solver.impliesNot("capistrano 2.15.3", "net-ssh-gateway 1.0.0");
  solver.impliesNot("capistrano 2.15.3", "net-ssh-gateway 1.0.1");
  solver.implies("capistrano 2.15.4", "highline");
  solver.implies("capistrano 2.15.4", "net-ssh");
  solver.impliesNot("capistrano 2.15.4", "net-ssh 0.5.0");
  solver.impliesNot("capistrano 2.15.4", "net-ssh 0.6.0");
  solver.impliesNot("capistrano 2.15.4", "net-ssh 0.9.0");
  solver.impliesNot("capistrano 2.15.4", "net-ssh 1.1.1");
  solver.impliesNot("capistrano 2.15.4", "net-ssh 1.1.2");
  solver.impliesNot("capistrano 2.15.4", "net-ssh 1.1.3");
  solver.impliesNot("capistrano 2.15.4", "net-ssh 1.1.4");
  solver.implies("capistrano 2.15.4", "net-sftp");
  solver.impliesNot("capistrano 2.15.4", "net-sftp 0.5.0");
  solver.impliesNot("capistrano 2.15.4", "net-sftp 0.9.0");
  solver.impliesNot("capistrano 2.15.4", "net-sftp 1.0.0");
  solver.impliesNot("capistrano 2.15.4", "net-sftp 1.0.1");
  solver.impliesNot("capistrano 2.15.4", "net-sftp 1.1.0");
  solver.impliesNot("capistrano 2.15.4", "net-sftp 1.1.1");
  solver.implies("capistrano 2.15.4", "net-scp");
  solver.implies("capistrano 2.15.4", "net-ssh-gateway");
  solver.impliesNot("capistrano 2.15.4", "net-ssh-gateway 1.0.0");
  solver.impliesNot("capistrano 2.15.4", "net-ssh-gateway 1.0.1");
  solver.implies("capistrano 2.15.5", "highline");
  solver.implies("capistrano 2.15.5", "net-ssh");
  solver.impliesNot("capistrano 2.15.5", "net-ssh 0.5.0");
  solver.impliesNot("capistrano 2.15.5", "net-ssh 0.6.0");
  solver.impliesNot("capistrano 2.15.5", "net-ssh 0.9.0");
  solver.impliesNot("capistrano 2.15.5", "net-ssh 1.1.1");
  solver.impliesNot("capistrano 2.15.5", "net-ssh 1.1.2");
  solver.impliesNot("capistrano 2.15.5", "net-ssh 1.1.3");
  solver.impliesNot("capistrano 2.15.5", "net-ssh 1.1.4");
  solver.implies("capistrano 2.15.5", "net-sftp");
  solver.impliesNot("capistrano 2.15.5", "net-sftp 0.5.0");
  solver.impliesNot("capistrano 2.15.5", "net-sftp 0.9.0");
  solver.impliesNot("capistrano 2.15.5", "net-sftp 1.0.0");
  solver.impliesNot("capistrano 2.15.5", "net-sftp 1.0.1");
  solver.impliesNot("capistrano 2.15.5", "net-sftp 1.1.0");
  solver.impliesNot("capistrano 2.15.5", "net-sftp 1.1.1");
  solver.implies("capistrano 2.15.5", "net-scp");
  solver.implies("capistrano 2.15.5", "net-ssh-gateway");
  solver.impliesNot("capistrano 2.15.5", "net-ssh-gateway 1.0.0");
  solver.impliesNot("capistrano 2.15.5", "net-ssh-gateway 1.0.1");
  solver.isFalse("capistrano 3.0.0");
  solver.implies("capistrano 3.0.0", "rake");
  solver.isFalse("capistrano 3.0.0");
  solver.isFalse("capistrano 3.0.1");
  solver.implies("capistrano 3.0.1", "rake");
  solver.isFalse("capistrano 3.0.1");
  solver.isFalse("capistrano 3.1.0");
  solver.implies("capistrano 3.1.0", "rake");
  solver.isFalse("capistrano 3.1.0");
  solver.implies("net-ssh-gateway 1.0.0", "net-ssh");
  solver.impliesNot("net-ssh-gateway 1.0.0", "net-ssh 0.5.0");
  solver.impliesNot("net-ssh-gateway 1.0.0", "net-ssh 0.6.0");
  solver.impliesNot("net-ssh-gateway 1.0.0", "net-ssh 0.9.0");
  solver.impliesNot("net-ssh-gateway 1.0.0", "net-ssh 1.1.1");
  solver.impliesNot("net-ssh-gateway 1.0.0", "net-ssh 1.1.2");
  solver.impliesNot("net-ssh-gateway 1.0.0", "net-ssh 1.1.3");
  solver.impliesNot("net-ssh-gateway 1.0.0", "net-ssh 1.1.4");
  solver.implies("net-ssh-gateway 1.0.1", "net-ssh");
  solver.impliesNot("net-ssh-gateway 1.0.1", "net-ssh 0.5.0");
  solver.impliesNot("net-ssh-gateway 1.0.1", "net-ssh 0.6.0");
  solver.impliesNot("net-ssh-gateway 1.0.1", "net-ssh 0.9.0");
  solver.impliesNot("net-ssh-gateway 1.0.1", "net-ssh 1.1.1");
  solver.impliesNot("net-ssh-gateway 1.0.1", "net-ssh 1.1.2");
  solver.impliesNot("net-ssh-gateway 1.0.1", "net-ssh 1.1.3");
  solver.impliesNot("net-ssh-gateway 1.0.1", "net-ssh 1.1.4");
  solver.implies("net-ssh-gateway 1.0.1", "echoe");
  solver.implies("net-ssh-gateway 1.1.0", "net-ssh");
  solver.impliesNot("net-ssh-gateway 1.1.0", "net-ssh 0.5.0");
  solver.impliesNot("net-ssh-gateway 1.1.0", "net-ssh 0.6.0");
  solver.impliesNot("net-ssh-gateway 1.1.0", "net-ssh 0.9.0");
  solver.impliesNot("net-ssh-gateway 1.1.0", "net-ssh 1.1.1");
  solver.impliesNot("net-ssh-gateway 1.1.0", "net-ssh 1.1.2");
  solver.impliesNot("net-ssh-gateway 1.1.0", "net-ssh 1.1.3");
  solver.impliesNot("net-ssh-gateway 1.1.0", "net-ssh 1.1.4");
  solver.implies("net-ssh-gateway 1.2.0", "net-ssh");
  solver.impliesNot("net-ssh-gateway 1.2.0", "net-ssh 0.5.0");
  solver.impliesNot("net-ssh-gateway 1.2.0", "net-ssh 0.6.0");
  solver.impliesNot("net-ssh-gateway 1.2.0", "net-ssh 0.9.0");
  solver.impliesNot("net-ssh-gateway 1.2.0", "net-ssh 1.1.1");
  solver.impliesNot("net-ssh-gateway 1.2.0", "net-ssh 1.1.2");
  solver.impliesNot("net-ssh-gateway 1.2.0", "net-ssh 1.1.3");
  solver.impliesNot("net-ssh-gateway 1.2.0", "net-ssh 1.1.4");
  solver.implies("net-scp 1.0.4", "net-ssh");
  solver.impliesNot("net-scp 1.0.4", "net-ssh 0.5.0");
  solver.impliesNot("net-scp 1.0.4", "net-ssh 0.6.0");
  solver.impliesNot("net-scp 1.0.4", "net-ssh 0.9.0");
  solver.impliesNot("net-scp 1.0.4", "net-ssh 1.1.1");
  solver.impliesNot("net-scp 1.0.4", "net-ssh 1.1.2");
  solver.impliesNot("net-scp 1.0.4", "net-ssh 1.1.3");
  solver.impliesNot("net-scp 1.0.4", "net-ssh 1.1.4");
  solver.implies("net-scp 1.1.0", "net-ssh");
  solver.impliesNot("net-scp 1.1.0", "net-ssh 0.5.0");
  solver.impliesNot("net-scp 1.1.0", "net-ssh 0.6.0");
  solver.impliesNot("net-scp 1.1.0", "net-ssh 0.9.0");
  solver.impliesNot("net-scp 1.1.0", "net-ssh 1.1.1");
  solver.impliesNot("net-scp 1.1.0", "net-ssh 1.1.2");
  solver.impliesNot("net-scp 1.1.0", "net-ssh 1.1.3");
  solver.impliesNot("net-scp 1.1.0", "net-ssh 1.1.4");
  solver.implies("net-scp 1.1.1", "net-ssh");
  solver.impliesNot("net-scp 1.1.1", "net-ssh 0.5.0");
  solver.impliesNot("net-scp 1.1.1", "net-ssh 0.6.0");
  solver.impliesNot("net-scp 1.1.1", "net-ssh 0.9.0");
  solver.impliesNot("net-scp 1.1.1", "net-ssh 1.1.1");
  solver.impliesNot("net-scp 1.1.1", "net-ssh 1.1.2");
  solver.impliesNot("net-scp 1.1.1", "net-ssh 1.1.3");
  solver.impliesNot("net-scp 1.1.1", "net-ssh 1.1.4");
  solver.implies("net-scp 1.1.2", "net-ssh");
  solver.impliesNot("net-scp 1.1.2", "net-ssh 0.5.0");
  solver.impliesNot("net-scp 1.1.2", "net-ssh 0.6.0");
  solver.impliesNot("net-scp 1.1.2", "net-ssh 0.9.0");
  solver.impliesNot("net-scp 1.1.2", "net-ssh 1.1.1");
  solver.impliesNot("net-scp 1.1.2", "net-ssh 1.1.2");
  solver.impliesNot("net-scp 1.1.2", "net-ssh 1.1.3");
  solver.impliesNot("net-scp 1.1.2", "net-ssh 1.1.4");
  solver.implies("net-sftp 0.5.0", "net-ssh");
  solver.implies("net-sftp 0.9.0", "net-ssh");
  solver.implies("net-sftp 1.0.0", "net-ssh");
  solver.implies("net-sftp 1.0.1", "net-ssh");
  solver.impliesNot("net-sftp 1.0.1", "net-ssh 0.5.0");
  solver.impliesNot("net-sftp 1.0.1", "net-ssh 0.6.0");
  solver.impliesNot("net-sftp 1.0.1", "net-ssh 0.9.0");
  solver.implies("net-sftp 1.1.0", "net-ssh");
  solver.impliesNot("net-sftp 1.1.0", "net-ssh 0.5.0");
  solver.impliesNot("net-sftp 1.1.0", "net-ssh 0.6.0");
  solver.impliesNot("net-sftp 1.1.0", "net-ssh 0.9.0");
  solver.implies("net-sftp 1.1.1", "net-ssh");
  solver.impliesNot("net-sftp 1.1.1", "net-ssh 0.5.0");
  solver.impliesNot("net-sftp 1.1.1", "net-ssh 0.6.0");
  solver.impliesNot("net-sftp 1.1.1", "net-ssh 0.9.0");
  solver.implies("net-sftp 2.0.5", "net-ssh");
  solver.impliesNot("net-sftp 2.0.5", "net-ssh 0.5.0");
  solver.impliesNot("net-sftp 2.0.5", "net-ssh 0.6.0");
  solver.impliesNot("net-sftp 2.0.5", "net-ssh 0.9.0");
  solver.impliesNot("net-sftp 2.0.5", "net-ssh 1.1.1");
  solver.impliesNot("net-sftp 2.0.5", "net-ssh 1.1.2");
  solver.impliesNot("net-sftp 2.0.5", "net-ssh 1.1.3");
  solver.impliesNot("net-sftp 2.0.5", "net-ssh 1.1.4");
  solver.implies("net-sftp 2.1.0", "net-ssh");
  solver.impliesNot("net-sftp 2.1.0", "net-ssh 0.5.0");
  solver.impliesNot("net-sftp 2.1.0", "net-ssh 0.6.0");
  solver.impliesNot("net-sftp 2.1.0", "net-ssh 0.9.0");
  solver.impliesNot("net-sftp 2.1.0", "net-ssh 1.1.1");
  solver.impliesNot("net-sftp 2.1.0", "net-ssh 1.1.2");
  solver.impliesNot("net-sftp 2.1.0", "net-ssh 1.1.3");
  solver.impliesNot("net-sftp 2.1.0", "net-ssh 1.1.4");
  solver.implies("net-sftp 2.1.1", "net-ssh");
  solver.impliesNot("net-sftp 2.1.1", "net-ssh 0.5.0");
  solver.impliesNot("net-sftp 2.1.1", "net-ssh 0.6.0");
  solver.impliesNot("net-sftp 2.1.1", "net-ssh 0.9.0");
  solver.impliesNot("net-sftp 2.1.1", "net-ssh 1.1.1");
  solver.impliesNot("net-sftp 2.1.1", "net-ssh 1.1.2");
  solver.impliesNot("net-sftp 2.1.1", "net-ssh 1.1.3");
  solver.impliesNot("net-sftp 2.1.1", "net-ssh 1.1.4");
  solver.implies("net-sftp 2.1.2", "net-ssh");
  solver.impliesNot("net-sftp 2.1.2", "net-ssh 0.5.0");
  solver.impliesNot("net-sftp 2.1.2", "net-ssh 0.6.0");
  solver.impliesNot("net-sftp 2.1.2", "net-ssh 0.9.0");
  solver.impliesNot("net-sftp 2.1.2", "net-ssh 1.1.1");
  solver.impliesNot("net-sftp 2.1.2", "net-ssh 1.1.2");
  solver.impliesNot("net-sftp 2.1.2", "net-ssh 1.1.3");
  solver.impliesNot("net-sftp 2.1.2", "net-ssh 1.1.4");
  solver.isFalse("net-ssh 0.5.0");
  solver.isFalse("net-ssh 0.6.0");
  solver.isFalse("net-ssh 0.9.0");
  solver.isFalse("net-ssh 1.1.1");
  solver.isFalse("net-ssh 1.1.2");
  solver.isFalse("net-ssh 1.1.3");
  solver.isFalse("net-ssh 1.1.4");
  solver.isTrue("capistrano");
  solver.isTrue("data-mapper");
  solver.isFalse("capistrano 1.3.1");
  solver.isFalse("capistrano 1.4.0");
  solver.isFalse("capistrano 1.4.1");
  solver.isFalse("capistrano 1.4.2");
  solver.isFalse("capistrano 3.0.0");
  solver.isFalse("capistrano 3.0.1");
  solver.isFalse("capistrano 3.1.0");

  var allPackageVersions = [
    "data-mapper 1.2.0",
    "dm-transactions 1.0.1",
    "dm-transactions 1.0.2",
    "dm-transactions 1.1.0",
    "dm-transactions 1.2.0",
    "dm-constraints 0.9.11",
    "dm-constraints 0.10.0",
    "dm-constraints 0.10.1",
    "dm-constraints 0.10.2",
    "dm-constraints 1.0.1",
    "dm-constraints 1.0.2",
    "dm-constraints 1.1.0",
    "dm-constraints 1.2.0",
    "dm-types 0.9.11",
    "dm-types 0.10.0",
    "dm-types 0.10.1",
    "dm-types 0.10.2",
    "dm-types 1.1.0",
    "dm-types 1.2.0",
    "dm-types 1.2.1",
    "dm-types 1.2.2",
    "multi-json 0.0.2",
    "multi-json 0.0.3",
    "multi-json 0.0.4",
    "multi-json 0.0.5",
    "multi-json 1.8.4",
    "multi-json 1.9.0",
    "multi-json 1.9.1",
    "multi-json 1.9.2",
    "json 0.4.0",
    "json 0.4.1",
    "json 0.4.2",
    "json 0.4.3",
    "json 1.7.6",
    "json 1.7.7",
    "json 1.8.0",
    "json 1.8.1",
    "stringex 1.3.3",
    "stringex 1.4.0",
    "stringex 1.5.0",
    "stringex 1.5.1",
    "stringex 2.4.1",
    "stringex 2.4.2",
    "stringex 2.5.0",
    "stringex 2.5.1",
    "uuidtools 0.1.1",
    "uuidtools 0.1.2",
    "uuidtools 0.1.3",
    "uuidtools 0.1.4",
    "uuidtools 1.0.4",
    "uuidtools 1.0.5",
    "uuidtools 1.0.6",
    "uuidtools 1.0.7",
    "uuidtools 2.1.1",
    "uuidtools 2.1.2",
    "uuidtools 2.1.3",
    "uuidtools 2.1.4",
    "launchy 0.4.2",
    "rspec 0.20.0",
    "rspec 1.20.0",
    "rspec 2.20.0",
    "rspec 3.20.0",
    "rake 12.0.0",
    "json-pure 1.7.6",
    "json-pure 1.7.7",
    "json-pure 1.8.0",
    "json-pure 1.8.1",
    "fastercsv 0.1.8",
    "fastercsv 0.1.9",
    "fastercsv 0.2.0",
    "fastercsv 0.2.1",
    "fastercsv 1.5.1",
    "fastercsv 1.5.3",
    "fastercsv 1.5.4",
    "fastercsv 1.5.5",
    "bcrypt-ruby 1.0.0",
    "bcrypt-ruby 2.1.1",
    "bcrypt-ruby 2.1.2",
    "bcrypt-ruby 2.1.3",
    "bcrypt-ruby 2.1.4",
    "bcrypt-ruby 3.1.2",
    "bcrypt-ruby 3.1.3",
    "bcrypt-ruby 3.1.4",
    "bcrypt-ruby 3.1.5",
    "bcrypt 3.1.3",
    "bcrypt 3.1.6",
    "bcrypt 3.1.7",
    "addressable 0.1.0",
    "addressable 0.1.1",
    "addressable 0.1.2",
    "addressable 1.0.1",
    "addressable 1.0.2",
    "addressable 1.0.3",
    "addressable 1.0.4",
    "addressable 2.3.3",
    "addressable 2.3.4",
    "addressable 2.3.5",
    "addressable 2.3.6",
    "dm-validations 0.9.11",
    "dm-validations 0.10.0",
    "dm-validations 0.10.1",
    "dm-validations 0.10.2",
    "dm-validations 1.0.1",
    "dm-validations 1.0.2",
    "dm-validations 1.1.0",
    "dm-validations 1.2.0",
    "dm-timestamps 0.9.11",
    "dm-timestamps 0.10.0",
    "dm-timestamps 0.10.1",
    "dm-timestamps 0.10.2",
    "dm-timestamps 1.0.1",
    "dm-timestamps 1.0.2",
    "dm-timestamps 1.1.0",
    "dm-timestamps 1.2.0",
    "dm-serializer 0.9.11",
    "dm-serializer 0.10.0",
    "dm-serializer 0.10.1",
    "dm-serializer 0.10.2",
    "dm-serializer 1.1.0",
    "dm-serializer 1.2.0",
    "dm-serializer 1.2.1",
    "dm-serializer 1.2.2",
    "dm-migrations 0.9.11",
    "dm-migrations 0.10.0",
    "dm-migrations 0.10.1",
    "dm-migrations 0.10.2",
    "dm-migrations 1.0.1",
    "dm-migrations 1.0.2",
    "dm-migrations 1.1.0",
    "dm-migrations 1.2.0",
    "dm-aggregates 0.9.11",
    "dm-aggregates 0.10.0",
    "dm-aggregates 0.10.1",
    "dm-aggregates 0.10.2",
    "dm-aggregates 1.0.1",
    "dm-aggregates 1.0.2",
    "dm-aggregates 1.1.0",
    "dm-aggregates 1.2.0",
    "dm-core 0.9.11",
    "dm-core 0.10.0",
    "dm-core 0.10.1",
    "dm-core 0.10.2",
    "dm-core 1.0.2",
    "dm-core 1.1.0",
    "dm-core 1.2.0",
    "dm-core 1.2.1",
    "data-objects 0.10.11",
    "data-objects 0.10.12",
    "data-objects 0.10.13",
    "data-objects 0.10.14",
    "capistrano 1.3.1",
    "capistrano 1.4.0",
    "capistrano 1.4.1",
    "capistrano 1.4.2",
    "capistrano 2.15.2",
    "capistrano 2.15.3",
    "capistrano 2.15.4",
    "capistrano 2.15.5",
    "capistrano 3.0.0",
    "capistrano 3.0.1",
    "capistrano 3.1.0",
    "net-ssh-gateway 1.0.0",
    "net-ssh-gateway 1.0.1",
    "net-ssh-gateway 1.1.0",
    "net-ssh-gateway 1.2.0",
    "echoe 1.0.0",
    "net-scp 1.0.4",
    "net-scp 1.1.0",
    "net-scp 1.1.1",
    "net-scp 1.1.2",
    "highline 0.3.0",
    "highline 0.4.0",
    "highline 0.5.0",
    "highline 0.6.1",
    "highline 1.6.18",
    "highline 1.6.19",
    "highline 1.6.20",
    "highline 1.6.21",
    "net-sftp 0.5.0",
    "net-sftp 0.9.0",
    "net-sftp 1.0.0",
    "net-sftp 1.0.1",
    "net-sftp 1.1.0",
    "net-sftp 1.1.1",
    "net-sftp 2.0.5",
    "net-sftp 2.1.0",
    "net-sftp 2.1.1",
    "net-sftp 2.1.2",
    "net-ssh 0.5.0",
    "net-ssh 0.6.0",
    "net-ssh 0.9.0",
    "net-ssh 1.1.1",
    "net-ssh 1.1.2",
    "net-ssh 1.1.3",
    "net-ssh 1.1.4",
    "net-ssh 2.6.7",
    "net-ssh 2.6.8",
    "net-ssh 2.7.0",
    "net-ssh 2.8.0"
  ];

  // -----

  var initialSolution = solver.solve();
  test.isTrue(initialSolution);

  var numPackagesChosen =
        _.intersection(initialSolution, allPackageVersions).length;

  test.equal(numPackagesChosen, 25);

  var secondSolution = solver._solveAgainWithConstraint(
    allPackageVersions, 1, '<', 25);
  test.isTrue(secondSolution);

  numPackagesChosen =
    _.intersection(secondSolution, allPackageVersions).length;

  test.equal(numPackagesChosen, 24);

  var thirdSolution = solver._solveAgainWithConstraint(
    allPackageVersions, 1, '<', 24);
  test.isFalse(
    thirdSolution,
    'cost: ' + _.intersection(thirdSolution, allPackageVersions).length);

  // -----

  //solver.optimize(costVectorMap);

});
