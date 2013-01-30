(function () {
	if (typeof Handlebars !== 'undefined') {
		//{{getSession 'key'}}
		Handlebars.registerHelper('testTypeCasting', function (myStr, myTrue, myFalse, myTen, myNegTen) {
			//Expect 'string' true false 10 -10
			var result  = (myStr == 'string') 	?'1':(myStr == undefined)?'u':'-';
				result += (myTrue == true) 		?'2':(myTrue == undefined)?'u':'-';
				result += (myFalse == false)	?'3':(myFalse == undefined)?'u':'-';
				result += (myTen == 10)			?'4':(myTen == undefined)?'u':'-';
				result += (myNegTen == -10)		?'5':(myNegTen == undefined)?'u':'-';
			return result;
		});
	}	
})();

(function () {
  Tinytest.add('Handlebars - init templates', function (test) {
	  var frag = Meteor.render(Template.test_helpers_00);
	  test.equal(canonicalizeHtml(DomUtils.fragmentToHtml(frag)), "Hi");
	});

	Tinytest.add('Handlebars - init test helpers', function (test) {
	  test.notEqual(Handlebars._default_helpers['testTypeCasting'], undefined, 'testTypeCasting: Handlebars loaded after session_helpers?');
	});

	Tinytest.add('Handlebars - helper typecast Issue #617', function (test) {
	  var frag = Meteor.render(Template.test_helpers_10);
	  var result = canonicalizeHtml(DomUtils.fragmentToHtml(frag));
	  test.equal(result.substr(0, 1), "1", 'Error in type casting string');
	  test.equal(result.substr(1, 1), "2", 'Error in type casting boolean true');
	  test.equal(result.substr(2, 1), "3", 'Error in type casting boolean false');
	  test.equal(result.substr(3, 1), "4", 'Error in type casting number');
	  test.equal(result.substr(4, 1), "5", 'Error in type casting number negative');
	});


})();

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