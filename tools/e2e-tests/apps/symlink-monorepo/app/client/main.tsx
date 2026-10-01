import './main.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Meteor } from 'meteor/meteor';
import { packageValue } from 'meteor/symlink-e2e-package';
import { clientRootImportValue } from '/imports/root-imports/client';
import { moduleValue } from '../imports/symlinked-module';
import { sourceDirValue } from '../imports/symlinked-dir';
import { getRelativePayload } from './symlinked/shared-file';

const relativePayload = getRelativePayload('client');

const clientPayload = {
  relativeValue: relativePayload.value,
  relativePeer: relativePayload.peer,
  relativeLocation: relativePayload.location,
  sourceDirValue,
  moduleValue,
  packageValue,
  rootImportValue: clientRootImportValue,
};

(window as any).__SYMLINK_E2E_CLIENT__ = clientPayload;
console.log(`SYMLINK_E2E_CLIENT_PAYLOAD ${JSON.stringify(clientPayload)}`);

Meteor.startup(() => {
  const container = document.getElementById('react-target');
  const root = createRoot(container!);

  root.render(
    <main>
      <h1>Welcome to Meteor!</h1>
      <pre data-testid="symlink-client-payload">
        {JSON.stringify(clientPayload, null, 2)}
      </pre>
    </main>
  );
});
