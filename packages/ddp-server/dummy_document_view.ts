/** Represents EJSON-serializable field values in the DDP protocol */
type FieldValue = string | number | boolean | Date | Uint8Array | Record<string, unknown> | unknown[] | null | undefined;

interface ChangeCollector {
  [key: string]: FieldValue;
}

interface DataEntry {
  subscriptionHandle: string;
  value: FieldValue;
}

export class DummyDocumentView {
  existsIn: Set<string>;
  dataByKey: Map<string, DataEntry[]>;

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
    value: FieldValue,
    changeCollector: ChangeCollector,
    isAdd?: boolean
  ): void {
    changeCollector[key] = value;
  }
}