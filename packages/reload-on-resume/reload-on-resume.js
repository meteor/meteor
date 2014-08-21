var newVersionAvailable = false;
var newVersionDep = new Deps.Dependency();

var hasResumed = false;
document.addEventListener("resume", function () {
  hasResumed = true;
}, false);

Reload._onMigrate(function (retry) {
  if (! newVersionAvailable) {
    newVersionAvailable = true;
    newVersionDep.changed();
  }

  if (hasResumed) {
    return [true, {}];
  } else {
    document.addEventListener("resume", retry, false);
    return [false];
  }
});

Reload.isWaitingForResume = function () {
  newVersionDep.depend();
  return newVersionAvailable;
};
