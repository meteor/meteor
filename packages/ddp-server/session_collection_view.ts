import { DummyDocumentView } from "./dummy_document_view";
import { SessionDocumentView } from "./session_document_view";

/** Represents EJSON-serializable field values in the DDP protocol */
type FieldValue = string | number | boolean | Date | Uint8Array | Record<string, unknown> | unknown[] | null | undefined;

interface SessionCallbacks {
  added: (collectionName: string, id: string, fields: Record<string, FieldValue>) => void;
  changed: (collectionName: string, id: string, fields: Record<string, FieldValue>) => void;
  removed: (collectionName: string, id: string) => void;
}

type DocumentView = SessionDocumentView | DummyDocumentView;

export class SessionCollectionView {
  private readonly collectionName: string;
  private readonly documents: Map<string, DocumentView>;
  private readonly callbacks: SessionCallbacks;

  /**
   * Represents a client's view of a single collection
   * @param collectionName - Name of the collection it represents
   * @param sessionCallbacks - The callbacks for added, changed, removed
   */
  constructor(collectionName: string, sessionCallbacks: SessionCallbacks) {
    this.collectionName = collectionName;
    this.documents = new Map();
    this.callbacks = sessionCallbacks;
  }

  public isEmpty(): boolean {
    return this.documents.size === 0;
  }

  public diff(previous: SessionCollectionView): void {
    DiffSequence.diffMaps(previous.documents, this.documents, {
      both: this.diffDocument.bind(this),
      rightOnly: (id: string, nowDV: DocumentView) => {
        this.callbacks.added(this.collectionName, id, nowDV.getFields());
      },
      leftOnly: (id: string, prevDV: DocumentView) => {
        this.callbacks.removed(this.collectionName, id);
      }
    });
  }

  private diffDocument(id: string, prevDV: DocumentView, nowDV: DocumentView): void {
    const fields: Record<string, FieldValue> = {};
    
    DiffSequence.diffObjects(prevDV.getFields(), nowDV.getFields(), {
      both: (key: string, prev: FieldValue, now: FieldValue) => {
        if (!EJSON.equals(prev, now)) {
          fields[key] = now;
        }
      },
      rightOnly: (key: string, now: FieldValue) => {
        fields[key] = now;
      },
      leftOnly: (key: string, prev: FieldValue) => {
        fields[key] = undefined;
      }
    });
    
    this.callbacks.changed(this.collectionName, id, fields);
  }

  public added(subscriptionHandle: string, id: string, fields: Record<string, FieldValue>): void {
    let docView: DocumentView | undefined = this.documents.get(id);
    let added = false;

    if (!docView) {
      added = true;
      if (Meteor.server.getPublicationStrategy(this.collectionName).useDummyDocumentView) {
        docView = new DummyDocumentView();
      } else {
        docView = new SessionDocumentView();
      }
      this.documents.set(id, docView);
    }

    docView.existsIn.add(subscriptionHandle);
    const changeCollector: Record<string, FieldValue> = {};

    Object.entries(fields).forEach(([key, value]) => {
      docView!.changeField(
        subscriptionHandle,
        key,
        value,
        changeCollector,
        true
      );
    });

    if (added) {
      this.callbacks.added(this.collectionName, id, changeCollector);
    } else {
      this.callbacks.changed(this.collectionName, id, changeCollector);
    }
  }

  public changed(subscriptionHandle: string, id: string, changed: Record<string, FieldValue>): void {
    const changedResult: Record<string, FieldValue> = {};
    const docView = this.documents.get(id);

    if (!docView) {
      throw new Error(`Could not find element with id ${id} to change`);
    }

    Object.entries(changed).forEach(([key, value]) => {
      if (value === undefined) {
        docView.clearField(subscriptionHandle, key, changedResult);
      } else {
        docView.changeField(subscriptionHandle, key, value, changedResult);
      }
    });

    this.callbacks.changed(this.collectionName, id, changedResult);
  }

  public removed(subscriptionHandle: string, id: string): void {
    const docView = this.documents.get(id);

    if (!docView) {
      throw new Error(`Removed nonexistent document ${id}`);
    }

    docView.existsIn.delete(subscriptionHandle);

    if (docView.existsIn.size === 0) {
      // it is gone from everyone
      this.callbacks.removed(this.collectionName, id);
      this.documents.delete(id);
    } else {
      const changed: Record<string, FieldValue> = {};
      // remove this subscription from every precedence list
      // and record the changes
      docView.dataByKey.forEach((precedenceList, key) => {
        docView.clearField(subscriptionHandle, key, changed);
      });
      this.callbacks.changed(this.collectionName, id, changed);
    }
  }
}