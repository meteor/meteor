interface PrecedenceItem {
  subscriptionHandle: string;
  value: any;
}

interface ChangeCollector {
  [key: string]: any;
}

export class SessionDocumentView {
  private existsIn: Set<string>;
  private dataByKey: Map<string, PrecedenceItem[]>;

  constructor() {
    this.existsIn = new Set(); // set of subscriptionHandle
    // Memory Growth
    this.dataByKey = new Map(); // key-> [ {subscriptionHandle, value} by precedence]
  }

  getFields(): Record<string, any> {
    const ret: Record<string, any> = {};
    this.dataByKey.forEach((precedenceList, key) => {
      ret[key] = precedenceList[0].value;
    });
    return ret;
  }

  clearField(
    subscriptionHandle: string,
    key: string,
    changeCollector: ChangeCollector
  ): void {
    // Publish API ignores _id if present in fields
    if (key === "_id") return;

    const precedenceList = this.dataByKey.get(key);
    // It's okay to clear fields that didn't exist. No need to throw
    // an error.
    if (!precedenceList) return;

    let removedValue: any = undefined;

    for (let i = 0; i < precedenceList.length; i++) {
      const precedence = precedenceList[i];
      if (precedence.subscriptionHandle === subscriptionHandle) {
        // The view's value can only change if this subscription is the one that
        // used to have precedence.
        if (i === 0) removedValue = precedence.value;
        precedenceList.splice(i, 1);
        break;
      }
    }

    if (precedenceList.length === 0) {
      this.dataByKey.delete(key);
      changeCollector[key] = undefined;
    } else if (
      removedValue !== undefined &&
      !EJSON.equals(removedValue, precedenceList[0].value)
    ) {
      changeCollector[key] = precedenceList[0].value;
    }
  }

  changeField(
    subscriptionHandle: string,
    key: string,
    value: any,
    changeCollector: ChangeCollector,
    isAdd: boolean = false
  ): void {
    // Publish API ignores _id if present in fields
    if (key === "_id") return;

    // Don't share state with the data passed in by the user.
    value = EJSON.clone(value);

    if (!this.dataByKey.has(key)) {
      this.dataByKey.set(key, [
        { subscriptionHandle: subscriptionHandle, value: value },
      ]);
      changeCollector[key] = value;
      return;
    }

    const precedenceList = this.dataByKey.get(key)!;
    let elt: PrecedenceItem | undefined;

    if (!isAdd) {
      elt = precedenceList.find(
        (precedence) => precedence.subscriptionHandle === subscriptionHandle
      );
    }

    if (elt) {
      if (elt === precedenceList[0] && !EJSON.equals(value, elt.value)) {
        // this subscription is changing the value of this field.
        changeCollector[key] = value;
      }
      elt.value = value;
    } else {
      // this subscription is newly caring about this field
      precedenceList.push({ subscriptionHandle: subscriptionHandle, value: value });
    }
  }
}