import { Mongo } from 'meteor/mongo';
import { Email } from 'meteor/email';

export const SentEmails = new Mongo.Collection('_e2e_emails');

Email.customTransport = async (options) => {
  await SentEmails.insertAsync({
    to: options.to,
    from: options.from,
    subject: options.subject,
    text: options.text,
    html: options.html,
    headers: options.headers || {},
    at: new Date(),
  });
};

export async function clearSentEmails() {
  await SentEmails.removeAsync({});
}

export async function lastEmailTo(addr) {
  return SentEmails.findOneAsync({ to: addr }, { sort: { at: -1 } });
}
