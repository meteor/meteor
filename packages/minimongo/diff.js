// old_result: array of documents.
// new_result: array of documents.
// observer: object with 'added', 'changed', 'moved', 'removed' functions
LocalCollection._diffQuery = function (old_result, new_result, observer) {
  // XXX implement
  // console.log("_diffQuery", arguments);

  // Pessimal, but simple, implementation.
  for (var i = old_result.length - 1; i >= 0; i--)
    observer.removed(old_result[i]._id, i);

  for (var i = 0; i < new_result.length; i++)
    observer.added(LocalCollection._deepcopy(new_result[i]), i);
};
