import React from 'react';
import { createRoot } from 'react-dom/client';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';

// PR #13369 regression: each render is pushed so the e2e suite can assert
// no `{loggingIn:false, user:null}` frame slips between the loading frame
// and the final logged-in frame.
window.__reactRenders = [];

function LoginStatus() {
  const { user, loggingIn } = useTracker(() => ({
    user: Meteor.user(),
    loggingIn: Meteor.loggingIn(),
  }), []);

  window.__reactRenders.push({
    user: !!user,
    loggingIn,
  });

  return (
    <pre id="react-state">
      {JSON.stringify({ user: !!user, loggingIn })}
    </pre>
  );
}

Meteor.startup(() => {
  const container = document.getElementById('react-target');
  if (!container) return;
  createRoot(container).render(<LoginStatus />);
});
