const ids = [];

export function add(id) {
  ids.push(id);
}

Meteor.startup(() => {
  ids.sort().forEach(id => {
    console.log(id);
  });
});
