var	testCollection = new Meteor.Collection(null);

(function () {
  Tinytest.add('Handlebar helpers - init session templates', function (test) {
	  var frag = Meteor.render(Template.test_helpers_00);
	  test.equal(canonicalizeHtml(DomUtils.fragmentToHtml(frag)), "Hi");
	});

	Tinytest.add('Handlebar helpers - init session helpers', function (test) {
	  test.notEqual(Handlebars._default_helpers['getSession'], undefined, 'getSession: Handlebars loaded after session_helpers?');
	  test.notEqual(Handlebars._default_helpers['sessionEquals'], undefined, 'sessionEquals: Handlebars loaded after session_helpers?');
	  test.notEqual(Handlebars._default_helpers['find'], undefined, 'find: Handlebars loaded after session_helpers?');
	  test.notEqual(Handlebars._default_helpers['findOne'], undefined, 'findOne: Handlebars loaded after session_helpers?');
	});

	Tinytest.add('Handlebar helpers - test {{getSession}}', function (test) {
		Session.set('test', undefined);
		var onscreen = OnscreenDiv(Meteor.render(Template.test_helpers_10));
		test.include(["<!--empty-->", 'ok'], onscreen.rawHtml(), 'getSession should be empty or set from last session');
		Session.set('test', 'jlfkjsdfldf');
		Meteor.flush();
		test.equal(onscreen.rawHtml(), "jlfkjsdfldf", 'getSession dont return as expected');
		Session.set('test', 'ok');
		Meteor.flush();
		test.equal(onscreen.rawHtml(), "ok", 'getSession dont return "ok" as expected');
		onscreen.kill();
	});

	Tinytest.add('Handlebar helpers - {{sessionEquals}} String', function (test) {
		//Template.test_helpers_20
		Session.set('test', undefined);
		var onscreen = OnscreenDiv(Meteor.render(Template.test_helpers_20));
		test.equal(onscreen.rawHtml(), 'false');
		Session.set('test', 'sdfsdfdsf');
		Meteor.flush();
		test.equal(onscreen.rawHtml(), 'true');
		Session.set('test', 'ok');
		Meteor.flush();
		test.equal(onscreen.rawHtml(), 'false');
		onscreen.kill();
	});

	Tinytest.add('Handlebar helpers - {{sessionEquals}} Integer', function (test) {
		//Template.test_helpers_21
		Session.set('test', undefined);
		var onscreen = OnscreenDiv(Meteor.render(Template.test_helpers_21));
		var onscreen2 = OnscreenDiv(Meteor.render(Template.test_helpers_22));
		var onscreen3 = OnscreenDiv(Meteor.render(Template.test_helpers_20));
		test.equal(onscreen.rawHtml(), 'false');
		
		Session.set('test', 1);
		Meteor.flush();
		test.equal(onscreen.rawHtml(), 'true');
		test.equal(onscreen2.rawHtml(), 'true');
		test.equal(onscreen3.rawHtml(), 'false');

		Session.set('test', 'ok');
		Meteor.flush();
		test.equal(onscreen.rawHtml(), 'false');
		onscreen.kill();
		onscreen2.kill();
		onscreen3.kill();

	});

	//XXX: Only string and int can be passed as parametre for helpers?
	Tinytest.add('Handlebar helpers - {{sessionEquals}} Array', function (test) {
		//Test of arrays
		//Template.test_helpers_23
		Session.set('test', undefined);
		var onscreen = OnscreenDiv(Meteor.render(Template.test_helpers_23));
		//test.equal(onscreen.rawHtml(), 'false');
		Session.set('test', ['a', 'b', 'c']);
		Meteor.flush();
		test.equal(onscreen.rawHtml(), 'true', 'Issue 617, This fails due to lack of support for value input as array');
		Session.set('test', 'ok');
		Meteor.flush();
		test.equal(onscreen.rawHtml(), 'false');
		onscreen.kill();
	});

	//XXX: Only string and int can be passed as parametre for helpers?
	Tinytest.add('Handlebar helpers - {{sessionEquals}} Objects', function (test) {
		//Test of arrays
		//Template.test_helpers_23
		Session.set('test', undefined);
		var onscreen = OnscreenDiv(Meteor.render(Template.test_helpers_24));
		test.notEqual(Template.test_helpers_24, undefined, 'Handlebars does not support objects as input in helpers');
		//test.equal(onscreen.rawHtml(), 'false');
		Session.set('test', {foo: 'bar'});
		Meteor.flush();
		test.equal(onscreen.rawHtml(), 'true', 'Issue 617, This fails due to lack of support for value input as objects');
		Session.set('test', 'ok');
		Meteor.flush();
		test.equal(onscreen.rawHtml(), 'false');
		onscreen.kill();
	});

	Tinytest.add('Handlebar helpers - {{sessionEquals}} Boolean', function (test) {
		//Template.test_helpers_24
		Session.set('test', undefined);
		var onscreen1 = OnscreenDiv(Meteor.render(Template.test_helpers_25));
		var onscreen2 = OnscreenDiv(Meteor.render(Template.test_helpers_26));
		var onscreen3 = OnscreenDiv(Meteor.render(Template.test_helpers_27)); //Test if sessionEquals
		test.equal(onscreen1.rawHtml(), 'false');
		Session.set('test', true);
		Meteor.flush();
		test.equal(onscreen1.rawHtml(), 'true');
		test.equal(onscreen2.rawHtml(), 'false');
		test.equal(onscreen3.rawHtml(), 'Test is true');
		Session.set('test', false);
		Meteor.flush();
		test.equal(onscreen1.rawHtml(), 'false');
		test.equal(onscreen2.rawHtml(), 'true');
		test.equal(onscreen3.rawHtml(), 'Test is false');
		onscreen1.kill();
		onscreen2.kill();
		onscreen3.kill();
	});

	Tinytest.addAsync("Handlebar helpers - test {{findOne}} and {{find}}", function (test, onComplete) {
		testCollection.insert({ a: 1, b:2 });

		var onscreen1 = OnscreenDiv(Meteor.render(Template.test_helpers_30)); //findOne
		var onscreen2 = OnscreenDiv(Meteor.render(Template.test_helpers_31)); //find
		var onscreen3 = OnscreenDiv(Meteor.render(Template.test_helpers_32)); //with find
		var onscreen4 = OnscreenDiv(Meteor.render(Template.test_helpers_33)); //with find return a
		var onscreen5 = OnscreenDiv(Meteor.render(Template.test_helpers_34)); //each find return a

		test.notEqual(Template.test_helpers_30, undefined, 'findOne');
		test.notEqual(Template.test_helpers_31, undefined, 'find');
		test.notEqual(Template.test_helpers_32, undefined, 'with');
		test.notEqual(Template.test_helpers_33, undefined, 'with return a');
		test.notEqual(Template.test_helpers_34, undefined, 'each return a');

		test.equal(onscreen1.rawHtml(), '[object Object]', '{{findOne}}');
		test.equal(onscreen2.rawHtml(), '[object Object]', '{{find}}');
		test.equal(onscreen3.rawHtml(), 'ok', 'with {{findOne}}');
		test.equal(onscreen4.rawHtml(), '1', 'with {{findOne}}');
		test.equal(onscreen5.rawHtml(), '1', 'each {{find}}');
		//console.log(onscreen5.rawHtml());

		testCollection.remove({}); //Remove all
		Meteor.flush();
		test.equal(onscreen1.rawHtml(), '<!--empty-->', '{{findOne}}');
		test.equal(onscreen2.rawHtml(), '[object Object]', '{{find}}'); //Guess this allways returns an object
		//test.equal(onscreen3.rawHtml(), 'ok', 'with {{findOne}}');
		test.equal(onscreen4.rawHtml(), '<!--empty-->', 'with {{findOne}}');
		test.equal(onscreen5.rawHtml(), 'none', 'each {{find}}');
		//console.log(onscreen5.rawHtml());
		onscreen1.kill();
		onscreen2.kill();
		onscreen3.kill();
		onscreen4.kill();
		onscreen5.kill();
		onComplete();
	});

}());

//Test API:
//test.isFalse(v, msg)
//test.isTrue(v, msg)
//test.equalactual, expected, message, not
//test.length(obj, len)
//test.include(s, v)
//test.isNaN(v, msg)
//test.isUndefined(v, msg)
//test.isNotNull
//test.isNull
//test.throws(func)
//test.instanceOf(obj, klass)
//test.notEqual(actual, expected, message)
//test.runId()
//test.exception(exception)
//test.expect_fail()
//test.ok(doc)
//test.fail(doc)