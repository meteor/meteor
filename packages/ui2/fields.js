var UI = UI2;

_extend(UI.Component, {
  get: function (id) {
    // this is the (! id) case where `id` is `""` or absent.
    // actually it should probably search up the parent tree too.
    return (typeof this.data === 'function' ?
            this.data() : this.data);
  },
  // convenient syntax
  withData: function (data) {
    return this.extend({data: data});
  }
});
