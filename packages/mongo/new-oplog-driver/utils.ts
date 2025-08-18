import { Meteor } from 'meteor/meteor';
import { MongoID } from 'meteor/mongo-id';
import isObject from 'lodash.isobject';

import type { NewOplogObserveDriver } from './new_oplog_observe_driver';

export function extractIdsFromSelector(selector: any) {
  const filter = selector._id;
  let ids: any[] = [];

  if (isObject(filter) && !filter._str) {
    if (!filter.$in) {
      throw new Meteor.Error(
        `When you subscribe directly, you can't have other specified fields rather than $in`
      );
    }

    ids = filter.$in;
  } else {
    ids.push(filter);
  }

  return ids;
}

export function getDedicatedChannel(collectionName: string, docId: any) {
  return `${collectionName}::${MongoID.idStringify(docId)}`;
}

export function getFieldsOfInterestFromAll(subscribers: NewOplogObserveDriver[]) {
  let allFields = [];
  for (let i = 0; i < subscribers.length; i++) {
    const subscriber = subscribers[i];
    const fields = subscriber.getFieldsOfInterest()!;

    if (fields === true) {
      // end of story, there is an observableCollection that needs all fields
      // therefore we will query for all fields
      return true;
    }
    allFields.push(...fields);
  }

  allFields = Array.from(new Set(allFields));

  // this should not happen, but as a measure of safety
  if (allFields.length === 0) {
    return true;
  }

  allFields = removeChildrenOfParents(allFields);

  const fieldsObject: { [key: string]: 1 } = {};

  allFields.forEach((field) => {
    fieldsObject[field] = 1;
  });

  return fieldsObject;
}

export function removeChildrenOfParents(array: string[]) {
  const freshArray: string[] = [];

  array.forEach((element, idxe) => {
    // add it to freshArray only if there's no field starting with {me} + '.' inside the array
    const foundParent = array.find((subelement, idxs) => {
      return idxe !== idxs && element.indexOf(`${subelement}.`) === 0;
    });

    if (!foundParent) {
      freshArray.push(element);
    }
  });

  return freshArray;
}
