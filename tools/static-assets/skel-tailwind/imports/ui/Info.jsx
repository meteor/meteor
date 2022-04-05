import React from 'react';
import { useTracker } from 'meteor/react-meteor-data';
import { LinksCollection } from '../api/links';

export const Info = () => {
  const links = useTracker(() => {
    return LinksCollection.find().fetch();
  });

  return (
    <div className="mt-4">
      <h2 className="font-bold">Learn Meteor!</h2>
      <ul className="list-disc ml-5">{links.map(
        link => <li key={link._id}>
          <a className="underline" href={link.url} target="_blank">{link.title}</a>
        </li>
      )}</ul>
    </div>
  );
};
