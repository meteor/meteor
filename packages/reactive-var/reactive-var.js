(function () {

    _.extend(Meteor, {
        reactiveVar: reactiveVar
    });

    function reactiveVar() {
        var value;
        var deps;
        return {
            set: function (v) {
                deps.invalidateAll();
                value = v;
            },

            get: function () {
                deps = deps || new Meteor.deps._ContextSet;
                deps.addCurrentContext();
                return value;
            }
        };
    }

}());
