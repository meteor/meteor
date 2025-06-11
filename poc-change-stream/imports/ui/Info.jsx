import React from 'react';
import { useTracker } from 'meteor/react-meteor-data';
import { LinksCollection } from '../api/links';

export const Info = () => {
  const { links, isLoading } = useTracker(() => {
    const handle = Meteor.subscribe('links');
    return {
      links: LinksCollection.find().fetch(),
      isLoading: !handle.ready(),
    };
  }, []);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h2>Learn Meteor!</h2>
      <ul>{links.map(
        link => <li key={link._id}>
          <a href={link.url} target="_blank" rel="noopener noreferrer">{link.title}</a>
        </li>
      )}</ul>
    </div>
  );
};
