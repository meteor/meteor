// Session helpers
//
// {{#if sessionEquals 'foo' 'bar'}}  //where foo is session key containing a value and bar is test value
// {{getSession 'foo'}} //returns session keys value
//  
//  
(function () {
	if (typeof Handlebars !== 'undefined') {
		//{{getSession 'key'}}
		Handlebars.registerHelper('getSession', function (key) {
			return Session.get(key);
		});


		Handlebars.registerHelper('sessionEquals', function (key, value) {
			var myValue = Session.get(key); //Workaround Issue #617
			if (typeof(myValue) === 'boolean') //Workaround Issue #617
				return Session.equals(key, (value == 'true')); //Workaround Issue #617
			return Session.equals(key, (myValue === +myValue)?+value:value); //Workaround Issue #617
			//return Session.equals(key, value); //When Issue #617 is resolved
		});


		Handlebars.registerHelper('findOne', function (collection, query, options) {
		//console.log('findOne: '+collection + '  '+query);
			var myCollection = eval(collection);
			if (myCollection instanceof Meteor.Collection){
				var myQuery = JSON.parse(query);
				var myOptions = (options instanceof Object)?undefined: JSON.parse(options);
				//console.log(myCollection.findOne(myQuery));
				if (myQuery instanceof Object)
					return myCollection.findOne(myQuery, myOptions)
				else
					console.log('{{findOne}} query error: '+query);
					throw new Error('Handlebar helper findOne: "'+collection+'" error in query:'+query+' (remember {"_id":1})');
			} else {
				throw new Error('Handlebar helper findOne: "'+collection+'" not found');
			}
			return [];
		});

		Handlebars.registerHelper('find', function (collection, query, options) {
		//console.log('find: '+collection + '  '+query+'  '+(options instanceof Object));
			var myCollection = eval(collection);
			if (myCollection instanceof Meteor.Collection){
				var myQuery = JSON.parse(query);
				var myOptions = (options instanceof Object)?undefined: JSON.parse(options);
				//console.log(myCollection.find(myQuery));
				if (myQuery instanceof Object)
					return myCollection.find(myQuery, myOptions)
				else
					console.log('{{find}} query error: '+query);
					throw new Error('Handlebar helper find: "'+collection+'" error in query:'+query+' (remember {"_id":1})');
			} else {
				throw new Error('Handlebar helper find: "'+collection+'" not found');
			}
			return [];
		});
	}
}());