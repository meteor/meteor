# Logic Solver

- [Introduction](#introduction)
- [MiniSat](#minisat)
- [Example: Dinner Guests](#example-dinner-guests)
- [Example: Magic Squares](#example-magic-squares)
- [Variables](#variables)
  - [Logic.Solver#getVarNum(variableName, [noCreate])](#logicsolvergetvarnumvariablename-nocreate)
  - [Logic.Solver#getVarName(variableNum)](#logicsolvergetvarnamevariablenum)
- [Terms](#terms)
  - [Logic.FALSE, Logic.TRUE](#logicfalse-logictrue)
  - [Logic.isTerm(value)](#logicistermvalue)
  - [Logic.isNameTerm(value)](#logicisnametermvalue)
  - [Logic.isNumTerm(value)](#logicisnumtermvalue)
  - [Logic.Solver#toNameTerm(term)](#logicsolvertonametermterm)
  - [Logic.Solver#toNumTerm(term, [noCreate])](#logicsolvertonumtermterm-nocreate)


## Introduction

Logic Solver is a boolean satisfiability solver written in JavaScript.
Given a problem expressed as logical constraints on boolean
(true/false) variables, it either provides a possible solution, or
tells you definitively that there is no possible assignment of the
variables that satisfies the constraints.

Many kinds of logic problems can be expressed in terms of constraints
on boolean variables, including Sudoku puzzles, scheduling problems,
and the package dependency problem faced by package managers that
automatically resolve version conflicts.

Logic Solver can handle complex problems with thousands of variables,
and has some powerful features such as incremental solving and solving
under temporary assumptions.  It also supports small-integer sums and
inequalities, and can minimize or maximize an integer expression.

## MiniSat

Logic Solver contains a copy of [MiniSat](http://minisat.se/), an
industrial-strength SAT solver, compiled from C++ to JavaScript using
[Emscripten](http://emscripten.org).  Solving satisfiability problems
("SAT-solving") is notoriously difficult from an algorithmic
perspective, but solvers such as MiniSat implement advanced techniques
that have come out of years of research.

MiniSat accepts input in "conjunctive normal form," which is a fairly
low-level representation of a logic problem.  Logic Solver's main job
is to take arbitrary boolean formulas that you specify, such as
"exactly one of A, B, and C is true," and convert them into a list of
statements that must all be satisfied -- a conjunction of clauses --
each of which is a simple disjunction such as: "A or B or C."  "Not A,
or not B."

Although MiniSat operates on a low-level representation of the problem
and has no explicit knowledge of its overall structure, it is able to
use sophisticated techniques to derive new clauses that are implied by
the existing clauses.  A naive solver would try assigning values to
some of the variables until a conflict occurs, and then backtrack, but
not really learn anything from the conflict.  Even custom solvers
written for a particular problem often work this way.  Solvers such as
MiniSat, on the other hand, employ [Conflict-Driven Clause
Learning](http://en.wikipedia.org/wiki/Conflict-Driven_Clause_Learning),
which means that when they backtrack, they learn new clauses.  These
new clauses narrow the search space and cause subsequent trials to
reach a conflict sooner, until the entire problem is found to be
unsatisfiable or a valid assignment is found.

In principle, Logic Solver could be used as a clause generator for
other SAT-solver backends besides MiniSat, or for a backend consisting
of MiniSat compiled to native machine code instead of JavaScript.

## Example: Dinner Guests

We are trying to decide what combination of Alice, Bob, and Charlie
to invite over to dinner, subject to the following constraints:

* Don't invite both Alice and Bob
* Invite either Bob or Charlie

Setting up these constraints in code:

```js
var solver = new Logic.Solver();

solver.require(Logic.atMostOne("Alice", "Bob"));
solver.require(Logic.or("Bob", "Charlie"));
```

Solving now will give us one possible solution, chosen arbitrarily:

```js
var sol1 = solver.solve();
sol1.getTrueVars() // => ["Bob"]
```

Let's see what happens if we invite Alice.  By using `solveAssuming`, we
can look for a solution that makes an additional logical expression true
over the ones we have required so far:

```js
var sol2 = solver.solveAssuming("Alice");
sol2.getTrueVars() // => ["Alice", "Charlie"]
```

Aha!  It seems that inviting Alice means we can't invite Bob, but then
we must invite Charlie!  If our reasoning is correct, it is impossible
to invite Alice and not invite Charlie.  We can confirm this:

```js
solver.solveAssuming(Logic.and("Alice", "-Charlie")) // => null
```

(Note that `"-Charlie"` is shorthand for `Logic.not("Charlie")`.)

Let's write some code to list all possible solutions:

```js
var solutions = [];
var curSol;
while ((curSol = solver.solve())) {
  solutions.push(curSol.getTrueVars());
  solver.forbid(curSol.getFormula()); // forbid the current solution
}

solutions
// => [["Alice", "Charlie"], ["Charlie"], ["Bob", "Charlie"], ["Bob"]]
```

As you can see, there are four possible solutions to the original problem.

After running the above code, all possible solutions are now
forbidden, so the solver is in an unsatisfiable state.  Calls to
`solver.require` and `solver.forbid` are permanent, so we cannot
return to a satisfiable state, and any call to `solve` or
`solveAssuming` henceforth will return no solution:

```js
solver.solve() // => null
```

It's informative to look at the clauses generated by Logic Solver during
this example.  In this notation, `v` is the boolean "OR" operator:

```
-Alice v -Bob  (at most one of Alice, Bob)
Bob v Charlie  (at least one of Bob, Charlie)

Alice v -$assump1  (solve assuming Alice)

$and1 v -$assump2  (solve assuming Alice and not Charlie)
Alice v -$and1
-Charlie v -$and1

-Alice v Bob v -Charlie  (forbid ["Alice", "Charlie"])
Alice v Bob v -Charlie   (forbid ["Charlie"])
Alice v -Bob v -Charlie  (etc.)
Alice v -Bob v Charlie
```

These clauses are sent to MiniSat using variable numbers in place of names,
making the entire problem quite compact:

```
[[-3,-4], [4,5],
 [3,-6],
 [8,-7], [3,-8], [-5,-8],
 [-3,4,-5], [3,4,-5], [3,-4,-5], [3,-4,5]]
```

## Example: Magic Squares

A 3x3 "magic square" is an arrangement of the digits 1 through 9 into a square
such that the digits in each row, column, and diagonal add up to the same number.
Here is an example from [Wikipedia](http://en.wikipedia.org/wiki/Magic_square):

```
2 7 6
9 5 1
4 3 8
```

Each row, column, and three-digit diagonal adds up to 15, as you can verify.
(There are many 3x3 magic squares, but the magic sum is always 15, because
all the digits together add up to 45!)

Let's use Logic Solver to find magic squares.  We could be fancy about
it and write code that would generalize to NxN magic squares, but
let's keep it simple and name the digit locations as follows:

```
A B C
D E F
G H I
```

Because each location holds an integer, we must use integer variables instead
of boolean variables.  An integer in Logic Solver is represented as a group
of bits, where each bit is a boolean variable, or an entire boolean formula.
Let's create a 4-bit group of variables for each digit location:

```js
var A = Logic.variableBits('A', 4);
var B = Logic.variableBits('B', 4);
var C = Logic.variableBits('C', 4);
var D = Logic.variableBits('D', 4);
var E = Logic.variableBits('E', 4);
var F = Logic.variableBits('F', 4);
var G = Logic.variableBits('G', 4);
var H = Logic.variableBits('H', 4);
var I = Logic.variableBits('I', 4);

var locations = [A, B, C, D, E, F, G, H, I];

A.bits // => ["A$0", "A$1", "A$2", "A$3"]
```

Let's also assign the number 15, in bit form, to a variable for convenience.

```js
var fifteen = Logic.constantBits(15);
fifteen.bits // => ["$T", "$T", "$T", "$T"]
```

The binary representation of 15 is "1111", so its bit form consists of
four copies of `Logic.TRUE` or `"$T"`.  We didn't have to know that,
though, because `Logic.constantBits` generated it for us.

Now, we create a Solver and express our sum constraints:

```js
var solver = new Logic.Solver();

_.each([[A,B,C], [D,E,F], [G,H,I], [A,D,G], [B,E,H], [C,F,I],
        [A,E,I], [G,E,C]],
       function (terms) {
         solver.require(Logic.equalBits(Logic.sum(terms), fifteen));
       });
```

Let's see what solution we get!

```js
var sol1 = solver.solve();
sol1.evaluate(A) // => 3
sol1.evaluate(B) // => 10 (uh oh)
_.map(locations, function (loc) { return sol1.evaluate(loc); })
// => [3, 10, 2,
//     4,  5, 6,
//     8,  0, 7]
```

Oops, it looks like we forgot to specify that each "digit" is between
1 and 9!  There is no harm done, because we have only underspecified
the problem.  We can continue to use the same `solver` instance.

Now we add inequalities to make each location A through I hold a number
between 1 and 9 inclusive, and solve again:

```js
_.each(locations, function (loc) {
  solver.require(Logic.greaterThanOrEqual(loc, Logic.constantBits(1)));
  solver.require(Logic.lessThanOrEqual(loc, Logic.constantBits(9)));
});

var sol2 = solver.solve();
_.map(locations, function (loc) { return sol2.evaluate(loc); })
// => [8, 1, 6,
//     3, 5, 7,
//     4, 9, 2]
```

Now we have a proper magic square!

However, it just so happens that we also forgot to specify that the
numbers be distinct.  To demonstrate that this is an important missing
constraint, we can use `solveAssuming` to ask for a solution where A
and B are equal:

```js
var sol3 = solver.solveAssuming(Logic.equalBits(A, B));
_.map(locations, function (loc) { return sol3.evaluate(loc); })
// => [4, 4, 7,
//     8, 5, 2,
//     3, 6, 6]
```

Or where A, B, and C are equal:

```js
var sol4 = solver.solveAssuming(Logic.and(Logic.equalBits(A, B),
                                          Logic.equalBits(B, C)));
_.map(locations, function (loc) { return sol4.evaluate(loc); })
// => [5, 5, 5,
//     5, 5, 5,
//     5, 5, 5]
```

A good way to enforce that all locations hold different digits is to
generate a requirement about each pair of different locations:

```js
_.each(locations, function (loc1, i) {
  _.each(locations, function (loc2, j) {
    if (i !== j) {
      solver.forbid(Logic.equalBits(loc1, loc2));
    }
  });
});
```

Solving now gives us a proper magic square again:

```js
var sol5 = solver.solve();
_.map(locations, function (loc) { return sol5.evaluate(loc); })
// => [6, 7, 2,
//     1, 5, 9,
//     8, 3, 4]
```

If we wished to continue interrogating the solver, we could try asking
for a magic square with a 1 in the upper-left corner, or proceed to
enumerate a list of magic squares.

Finally, let's demonstrate that our "integers" are really just groups of
boolean variables:

```js
sol5.getTrueVars()
// => ["A$1", "A$2", "B$0", "B$1", "B$2", "C$1", "D$0", "E$0", "E$2",
//     "F$0", "F$3", "G$3", "H$0", "H$1", "I$2"]

_.map(A.bits, function (v) { return sol5.evaluate(v); })
// => [false, true, true, false]
```

You may be wondering whether it's bad that we generated 72 constraints
as part of finding a 3x3 magic square.  While there are certainly much
faster ways to calculate magic squares, it is perfectly reasonable
when setting up a logic problem to generate a complete set of pairwise
constraints over N variables.  In fact, having more constraints often
improves performance in real-world problems, so it is worth generating
extra constraints even when they are technically redundant.  More
constraints means more deductions can be made at each step, meaning
fewer possibilities need to be tried that ultimately won't work out.
In this case, it's important that when the solver assigns a digit to a
particular location, it immediately be able to deduce that the same
number does not appear at any other location.

## Variables

Variable names are Strings which can contain spaces and punctuation:

```js
Logic.implies('it is raining', 'take an umbrella');

Logic.exactlyOne("1,1", "1,2", "1,3")
```

Restrictions: A variable name must not be empty, consist of only the
characters `0` through `9`, or start with `-`.  Variable names that
start with `$` are reserved for internal use.

You do not need to declare or create your variables before using them
in formulas passed to `require` and `forbid`.

When you pass a variable name to a Solver for the first time, a
variable number is allocated, and that name and number become
synonymous for that Solver instance.  You don't need to know about
variable numbers to use Logic Solver, but you can always use a
variable number in place of a variable name in terms and formulas, in
case that is useful.  (It is useful internally, and would probably be
useful if you were to wrap Logic Solver in another library.)  Examples
of Solver methods that may allocate new variables are `require`,
`forbid`, `solveAssuming`, and `getVarNum`.

If you want to add a free variable to a Solver but not require
anything about it, you can use `getVarNum` to cause the variable to be
allocated.  It will then appear in solutions.

### Methods

#### Logic.Solver#getVarNum(variableName, [noCreate])

Returns the variable number for a variable name, allocating a number if
this is the first time this Solver has seen `variableName`.

###### Parameters

* `variableName` - String - A valid variable name.
* `noCreate` - Boolean - Optional.  If true, this method will return
  0 instead of allocating a new variable number if `variableName` is new.

###### Returns

Integer - A positive integer variable number, or 0 if `noCreate` is true
and there is no variable number allocated for `variableName`.

#### Logic.Solver#getVarName(variableNum)

Returns the variable name for a given variable number.  An error is thrown
if `variableNum` is not an allocated variable number.

###### Parameters

* `variableNum` - Integer - An allocated variable number.

###### Returns

String - A variable name.

## Terms

A Term is a variable name or number, optionally negated.  To negate a
string Term, prefix it with `"-"`.  Examples of valid Terms are
`"foo"`, `"-foo"`, `5`, and `-5`.  In other solvers and papers, you may
see Terms referred to as "literals."

The following are equivalent:

```js
solver.require("-A");
solver.require(Logic.not("A"));
solver.forbid("A");
```

In fact, `Logic.not("A")` returns `"-A"`.  It is valid to have more
than one `-` in a Term (`"---A"`), and the meaning will be what you'd
expect, but `Logic.not` will never return you such a Term, so in
practice this case does not come up.  `Logic.not("-A")` returns `"A"`.

String Terms are called NameTerms, and numeric Terms are called
NumTerms.  You will not normally need to use numeric Terms, but if you
do, note that it doesn't make sense to share them across Solver
instances, because each Solver has its own variable numbers.  See the
[Variables](#variables) section for more information.

### Constants

#### Logic.FALSE, Logic.TRUE

These Terms represent the constant boolean values false and true.  You
may seem them appear as the internal variables `$F` and `$T` or `1`
and `2`, which are automatically pinned to false and true.

### Methods

#### Logic.isTerm(value)

Returns whether `value` is a valid Term.  A valid Term is either a
String consisting of a valid variable name preceded by zero or more
`-` characters, or a non-zero integer.

###### Parameters

* `value` - Any

###### Returns

Boolean

#### Logic.isNameTerm(value)

Returns whether `value` is a valid NameTerm (a Term that is a String).

###### Parameters

* `value` - Any

###### Returns

Boolean

#### Logic.isNumTerm(value)

Returns whether `value` is a valid NumTerm (a Term that is a Number).

###### Parameters

* `value` - Any

###### Returns

Boolean

#### Logic.Solver#toNameTerm(term)

Converts a Term to a NameTerm if it isn't already.  If `term` is a
NumTerm, the variable number is translated into a variable name.  An
error is thrown if the variable number is not an allocated variable
number of this Solver.

###### Parameters

* `term` - Term - The Term to convert, which may be a NameTerm or
  NumTerm.

###### Returns

NameTerm

#### Logic.Solver#toNumTerm(term, [noCreate])

Converts a Term to a NumTerm if it isn't already.  If `term` is a
NameTerm, the variable name is translated into a variable number.  A
new variable number is allocated if the variable name has not been
seen before by this Solver, unless you pass `true` for `noCreate`.

###### Parameters

* `term` - Term - The Term to convert, which may be a NameTerm or
  NumTerm.
* `noCreate` - Boolean - Optional.  If `true`, this method will not
  allocate a new variable number if it encounters a new variable name,
  but will return 0 instead.

###### Returns

NumTerm, or 0 (if `noCreate` is `true` and a new variable name is encountered)



# XXX WIP

## API

```
Logic.Solver
    solver.require
    solver.forbid
    solver.solve
    solver.solveAssuming
Logic.Term
    Logic.TRUE
    Logic.FALSE
Logic.Formula
    Logic.not
    Logic.or
    Logic.and
    Logic.xor
    Logic.implies
    Logic.equiv
    Logic.atMostOne
    Logic.exactlyOne
Logic.Clause
Logic.Solution
    solution.getMap
    solution.getTrueVars
    solution.evaluate
    solution.getWeightedSum
Logic.Bits
    Logic.constantBits
    Logic.variableBits
    Logic.equalBits
    Logic.lessThan
    Logic.lessThanOrEqual
    Logic.greaterThan
    Logic.greaterThanOrEqual
    Logic.sum
    Logic.weightedSum
```

(also minimize and maximize, and solution.getFormula)