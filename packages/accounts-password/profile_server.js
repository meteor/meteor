// method for create user. Requests come from the client.
Meteor.methods({
    changeProfile: function (profile) {
        var self = this;
        return Meteor.users.update({
            _id: this.userId
        }, {
            $set: {
                'profile': profile
            }
        });
    }
});