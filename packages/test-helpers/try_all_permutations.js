// Given some functions, run them in every possible order.
//
// In simplest usage, takes one argument, an array of functions. Run
// those functions in every possible order. Or, if the first element
// of the array is an integer N, with the remaining elements being
// functions (N <= the number of functions), run every permutation of
// N functions from the array.
//
// Eg:
// try_all_permutations([A, B, C])
// => runs A, B, C; A, C, B; B, A, C; B, C, A; C, A, B; C, B, A
// (semicolons for clarity only)
//
// try_all_permutations([2, A, B, C])
// => runs A, B; A, C; B, A; B, C; C, A; C, B
//
// If more than one argument A_1, A_2 ... A_n is passed, each should
// be an array as described above. Compute the possible orderings O_1,
// O_2 ... O_n per above, and run the Cartesian product of the
// sets. (Except that unlike a proper Cartesian product, a set with
// zero elements will simply be ignored.)
//
// Eg:
// try_all_permutations([X], [A, B], [Y])
// => runs X, A, B, Y; X, B, A, Y
// try_all_permutations([X], [A, B], [], [Y])
// => same
//
// If a function is passed instead of an array, it will be treated as
// an array with one argument. In other words, these are the same:
// try_all_permutations([X], [A, B], [Y])
// try_all_permutations(X, [A, B], Y)

try_all_permutations = function () {
  var args = Array.prototype.slice.call(arguments);

  var current_set = 0;
  var chosen = [];

  var expand_next_set = function () {
    if (current_set === args.length) {
      chosen.forEach(function (f) { f(); });
    } else {
      var set = args[current_set];
      if (typeof set === "function")
        set = [set];

      current_set++;
      if (typeof set[0] === "number")
        pick(set[0], set.slice(1));
      else
        pick(set.length, set);
      current_set--;
    }
  };

  var pick = function (how_many, remaining) {
    if (how_many === 0)
      expand_next_set();
    else {
      for (var i = 0; i < remaining.length; i++) {
        chosen.push(remaining[i]);
        pick(how_many - 1,
             remaining.slice(0, i).concat(remaining.slice(i + 1)));
        chosen.pop();
      }
    }
  };

  expand_next_set();
};
