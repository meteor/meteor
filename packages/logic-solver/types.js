Logic = {};

////////// TYPE TESTERS


// Set the `description` property of a tester function and return the function.
var withDescription = function (description, tester) {
  tester.description = description;
  return tester;
};

// Create a function (x) => (x instanceof constructor), but possibly before
// constructor is available.  For example, if Logic.Formula hasn't been
// assigned yet, passing Logic for `obj` and "Formula" for `constructorName`
// will still work.
var lazyInstanceofTester = function (description, obj, constructorName) {
  return withDescription(description, function (x) {
    return x instanceof obj[constructorName];
  });
};


///// PUBLIC TYPE TESTERS

// All variables have a name and a number.  The number is mainly used
// internally, and it's what's given to MiniSat.  Names and numbers
// are interchangeable, which is convenient for doing manipulation
// of terms in a way that works before or after variable names are
// converted to numbers.

// Term: a variable name or variable number, optionally
// negated (meaning "boolean not").  For example,
// `1`, `-1`, `"foo"`, or `"-foo"`.  All variables have
// internal numbers that start at 1, so "foo" might be
// variable number 1, for example.  Any number of leading
// "-" will be parsed in the string form, but we try to
// keep it to either one or zero of them.

Logic.isNumTerm = withDescription('a NumTerm (non-zero integer)',
                                  function (x) {
                                    // 32-bit integer, but not 0
                                    return (x === (x | 0)) && x !== 0;
                                  });

// NameTerm must not be empty, or just `-` characters, or look like a
// number.  Specifically, it can't be zero or more `-` followed by
// zero or more digits.
Logic.isNameTerm = withDescription('a NameTerm (string)',
                                   function (x) {
                                     return (typeof x === 'string') &&
                                       ! /^-*[0-9]*$/.test(x);
                                   });

Logic.isTerm = withDescription('a Term (appropriate string or number)',
                               function (x) {
                                 return Logic.isNumTerm(x) ||
                                   Logic.isNameTerm(x);
                               });

// WholeNumber: a non-negative integer (0 is allowed)
Logic.isWholeNumber = withDescription('a whole number (integer >= 0)',
                                      function (x) {
                                        return (x === (x | 0)) && x >= 0;
                                      });

Logic.isFormula = lazyInstanceofTester('a Formula', Logic, 'Formula');
Logic.isClause = lazyInstanceofTester('a Clause', Logic, 'Clause');
Logic.isBits = lazyInstanceofTester('a Bits', Logic, 'Bits');

///// UNDOCUMENTED TYPE TESTERS

Logic._isInteger = withDescription(
  'an integer', function (x) { return x === (x | 0); });

Logic._isFunction = withDescription(
  'a Function', function (x) { return typeof x === 'function'; });

Logic._isString = withDescription(
  'a String', function (x) { return typeof x === 'string'; });

Logic._isArrayWhere = function (tester) {
  var description = 'an array';
  if (tester.description) {
    description += ' of ' + tester.description;
  }
  return withDescription(description, function (x) {
    if (! _.isArray(x)) {
      return false;
    } else {
      for (var i = 0; i < x.length; i++) {
        if (! tester(x[i])) {
          return false;
        }
      }
      return true;
    }
  });
};

Logic._isFormulaOrTerm = withDescription('a Formula or Term',
                                         function (x) {
                                           return Logic.isFormula(x) ||
                                             Logic.isTerm(x);
                                         });


Logic._isFormulaOrTermOrBits = withDescription('a Formula, Term, or Bits',
                                               function (x) {
                                                 return Logic.isFormula(x) ||
                                                   Logic.isBits(x) ||
                                                   Logic.isTerm(x);
                                               });
