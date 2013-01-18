#Handlebar-helpers
Is a simple way of using sessions and collections in the Meteor handlebars template environment

Have a look at [Live example](http://handlebar-helpers.meteor.com/)

There are 4 simple handlers
* {{getSession}}
* {{sessionEquals}}
* {{find}}
* {{findOne}}

##How to use?

####1. Install:
```
    mrt add handlebar-helpers
```
*Requires ```Meteorite``` get it at [atmosphere.meteor.com](https://atmosphere.meteor.com)*

###Get session variable:
The ```{{getSession 'foo'}}``` helper returns the value of session variable 'foo'
In the template:
```html
<h1>{{getSession 'foo'}}</h1>
``` 
In the controller:
```js
  Session.set('foo', 'bar');
```
###Compare session to value:
The ```{{sessionEquals 'foo' 'bar'}}``` compares session 'foo' value with the ```string``` value 'bar'.
Can use ``integer``` and ```boolean``` values for comparing aswell. *arrays and objects are invalids due to contrains in Meteor and handlebars*
```html
{{#if sessionEquals 'foo' 'bar'}}
  session 'foo' equals the value 'bar'
{{else}}
  session 'foo' doesn't equal the value 'bar'
{{/if}}
```
###Get data in from collection
The ```{{find 'foo' '{}'}}``` and ```{{findOne 'foo' '{}'}}``` will return qurey '{}' result from collection defined as ```var foo = new Meteor.Collection("myFooCollection")```
From the ```demoHelpers``` example:

```html
  {{#each find 'testCollection' '{}' '{ "sort": { "createdAt":1 } }'}}
    {{name}} - timeStamp: {{createdAt}}</br>
  {{else}}
    You never clicked the button
  {{/each}}
```
*Note: query and options should be formatted as json, since attributes as Objects and Arrays aren't supported by the Meteor handlebars*