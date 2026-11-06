import { Meteor } from 'meteor/meteor';
import { getMessage } from '@legacy/legacy-message';
import notice from '@legacy/message.notice';
import badge from '@legacy/badge.svg';
import '../imports/main.css';
import '@legacy/legacy.css';

Meteor.startup(() => {
  document.getElementById('architecture-entry')!.textContent =
    getMessage({ payload: { message: 'architecture-legacy-entry' } }) +
    ' / ' + getMessage();
  const image = document.createElement('img');
  image.id = 'legacy-badge';
  image.src = badge;
  document.body.appendChild(image);
  import('@legacy/lazy').then(({ getBuildArch }) => {
    document.getElementById('architecture-entry')!.setAttribute('data-rspack', `${notice} / ${getBuildArch()}`);
  });
});
