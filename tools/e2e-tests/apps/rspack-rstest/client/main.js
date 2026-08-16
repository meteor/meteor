import { Meteor } from 'meteor/meteor';
import { packageCoverageValue } from 'meteor/rstest-e2e-fixture';
import { clientCoverageValue } from '../imports/coverage/client-target.js';

Meteor.startup(() => {
  document.title = 'rspack-rstest-e2e';
  document.body.innerHTML = `
    <main>
      <h1>Meteor Rstest E2E</h1>
      <p data-testid="runtime">Meteor client ready</p>
      <p data-testid="client-coverage">${clientCoverageValue()}</p>
      <p data-testid="package-coverage">${packageCoverageValue('client')}</p>
    </main>
  `;
});
