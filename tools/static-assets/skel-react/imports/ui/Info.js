import React, { Component } from 'react';
import { withTracker } from 'meteor/react-meteor-data';
import Links from '../api/links';

class Info extends Component {
  render() {
    const { links } = this.props;
    return (
      <div>
        <h2>Learn Meteor!</h2>
        <ul>
          {links.map(link => (
            <li key={link._id}>
              <a href={link.url} target="_blank">{link.title}</a>
            </li>
          ))}
        </ul>
      </div>
    );
  }
}

export default InfoContainer = withTracker(() => {
  return {
    links: Links.find().fetch(),
  };
})(Info);
