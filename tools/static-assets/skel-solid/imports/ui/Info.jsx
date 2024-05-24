import { LinksCollection } from "../api/links";
import { createSignal, For, Show } from "solid-js";
import { Tracker } from "meteor/tracker";
import { Meteor } from "meteor/meteor";

export const Info = () => {
  const subscription = Meteor.subscribe("links");
  const [isReady, setIsReady] = createSignal(subscription.ready());
  const [links, setLinks] = createSignal([]);

  Tracker.autorun(async () => {
    setIsReady(subscription.ready());
    setLinks(await LinksCollection.find().fetchAsync());
  });

  return (
    <Show
      when={isReady()}
      fallback={<div>Loading...</div>}
    >
      <div>
        <h2>Learn Meteor!</h2>
        <ul>
          <For each={links()}>
            {(link) => (
              <li>
                <a href={link.url} target="_blank">
                  {link.title}
                </a>
              </li>
            )}
          </For>
        </ul>
      </div>
    </Show>
  );
};
