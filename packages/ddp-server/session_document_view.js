export default class SessionDocumentView {
    constructor(){
        this.existsIn = new Set(); // set of subscriptionHandle
        this.dataByKey = new Map(); // key-> [ {subscriptionHandle, value} by precedence]
    }

    static getFields(){
        let ret = {};
        this.dataByKey.forEach(function (precedenceList, key) {
          ret[key] = precedenceList[0].value;
        });
        return ret;
      }
    
    static clearField(subscriptionHandle, key, changeCollector) {
        // Publish API ignores _id if present in fields
        if (key === "_id")
          return;
        var precedenceList = this.dataByKey.get(key);
    
        // It's okay to clear fields that didn't exist. No need to throw
        // an error.
        if (!precedenceList)
          return;
    
        var removedValue = undefined;
        for (var i = 0; i < precedenceList.length; i++) {
          var precedence = precedenceList[i];
          if (precedence.subscriptionHandle === subscriptionHandle) {
            // The view's value can only change if this subscription is the one that
            // used to have precedence.
            if (i === 0)
              removedValue = precedence.value;
            precedenceList.splice(i, 1);
            break;
          }
        }
        if (precedenceList.length === 0) {
          this.dataByKey.delete(key);
          changeCollector[key] = undefined;
        } else if (removedValue !== undefined &&
                   !EJSON.equals(removedValue, precedenceList[0].value)) {
          changeCollector[key] = precedenceList[0].value;
        }
      }
    
    static changeField(subscriptionHandle, key, value,
                             changeCollector, isAdd) {
        // Publish API ignores _id if present in fields
        if (key === "_id")
          return;
    
        // Don't share state with the data passed in by the user.
        value = EJSON.clone(value);
    
        if (!this.dataByKey.has(key)) {
          this.dataByKey.set(key, [{subscriptionHandle: subscriptionHandle,
                                    value: value}]);
          changeCollector[key] = value;
          return;
        }
        var precedenceList = this.dataByKey.get(key);
        var elt;
        if (!isAdd) {
          elt = precedenceList.find(function (precedence) {
              return precedence.subscriptionHandle === subscriptionHandle;
          });
        }
    
        if (elt) {
          if (elt === precedenceList[0] && !EJSON.equals(value, elt.value)) {
            // this subscription is changing the value of this field.
            changeCollector[key] = value;
          }
          elt.value = value;
        } else {
          // this subscription is newly caring about this field
          precedenceList.push({subscriptionHandle: subscriptionHandle, value: value});
        }
    
      }

}