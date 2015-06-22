// Write your tests here!
// Here is an example.
Tinytest.add( 'example', function( test ) {
  test.equal( true, true );
} );

DDPRateLimiter.addRule( {
  userId: null,
  IPAddr: null,
  method: 'login'
}, 5, 10000 );

if ( Meteor.isClient ) {
  testAsyncMulti( "passwords - basic login with password", [
    function( test, expect ) {
      // setup
      this.username = Random.id();
      this.email = Random.id() + '-intercept@example.com';
      this.password = 'password';

      Accounts.createUser( {
          username: this.username,
          email: this.email,
          password: this.password
        },
        function() {} );
    },
    function( test, expect ) {
      test.notEqual( Meteor.userId(), null );
    },
    function( test, expect ) {
      Meteor.logout( expect( function( error ) {
        test.equal( error, undefined );
        test.equal( Meteor.user(), null );
      } ) );
    },
    function( test, expect ) {
      var self = this;
      for ( var i = 0; i < 100; i++ ) {

        Meteor.loginWithPassword( self.username, 'fakePassword', function(
          error ) {
          console.log( "We threw an error.", error );
        } );
      }
    }
  ] );
};