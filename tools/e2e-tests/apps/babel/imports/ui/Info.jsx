import React from 'react';
import { useQuery, gql } from '@apollo/client';

const GET_LINKS = gql`
    {
        links: getLinks {
            _id
            title
            url
        }
    }
`;

export const Info = () => {
  const { loading, error, data } = useQuery(GET_LINKS);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error ⁉️</p>;

  return (
    <div>
      <h2>Learn Meteor!</h2>
      <ul>{data?.links?.map(
        link => <li key={link._id}>
          <a href={link.url} target="_blank">{link.title}</a>
        </li>
      )}</ul>
    </div>
  );
};
