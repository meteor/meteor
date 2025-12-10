import React from "react";
import { useFind, useSubscribe } from "meteor/react-meteor-data";
import { LinksCollection, Link } from "../api/links";

export const Info = () => {
  const isLoading = useSubscribe("links");
  const links = useFind(() => LinksCollection.find());

  if (isLoading()) {
    return <div>Loading...</div>;
  }

  const makeLink = (link: Link) => {
    return (
      <li key={ link._id }>
        <a href={ link.url } target="_blank">{ link.title }</a>
      </li>
    );
  }

  return (
    <div>
      <h2>Learn Meteor!</h2>
      <ul>{ links.map(makeLink) }</ul>
    </div>
  );
};
