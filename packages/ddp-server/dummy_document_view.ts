interface ChangeCollector {
  [key: string]: any;
}

interface DataEntry {
  subscriptionHandle: string;
  value: any;
}

export class DummyDocumentView {
  private existsIn: Set<string>;
  private dataByKey: Map<string, DataEntry[]>;

  constructor() {
    this.existsIn = new Set<string>(); // set of subscriptionHandle
    this.dataByKey = new Map<string, DataEntry[]>(); // key-> [ {subscriptionHandle, value} by precedence]
  }

  getFields(): Record<string, never> {
    return {};
  }

  clearField(
    subscriptionHandle: string, 
    key: string, 
    changeCollector: ChangeCollector
  ): void {
    changeCollector[key] = undefined;
  }

  changeField(
    subscriptionHandle: string,
    key: string,
    value: any,
    changeCollector: ChangeCollector,
    isAdd?: boolean
  ): void {
    changeCollector[key] = value;
  }
}