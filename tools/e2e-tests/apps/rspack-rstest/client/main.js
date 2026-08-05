import { Meteor } from 'meteor/meteor';

Meteor.startup(() => {
  document.title = 'rspack-rstest-e2e';
  document.body.innerHTML = `
    <main>
      <h1>Meteor Rstest E2E</h1>
      <p data-testid="runtime">Meteor client ready</p>
    </main>
  `;
});
