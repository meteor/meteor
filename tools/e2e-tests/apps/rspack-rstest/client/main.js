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
      <button type="button" data-testid="e2e-coverage-trigger">Load E2E target</button>
      <p data-testid="e2e-coverage-result"></p>
    </main>
  `;
  document.querySelector('[data-testid="e2e-coverage-trigger"]')
    .addEventListener('click', async () => {
      const { e2eInteractionValue } = await import(
        '../imports/coverage/e2e-interaction-target.js'
      );
      document.querySelector('[data-testid="e2e-coverage-result"]')
        .textContent = e2eInteractionValue();
    });
});
