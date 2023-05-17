import { LinksCollection } from "../api/links";
import { createSignal, For } from "solid-js";
import { Tracker } from "meteor/tracker";
import { Meteor } from "meteor/meteor";

export const Info = () => {
  const loading = Meteor.subscribe("links");
  const [isLoading, setIsLoading] = createSignal(loading.ready());
  const [links, setLinks] = createSignal([]);

  Tracker.autorun(() => {
    setIsLoading(loading.ready());
    setLinks(LinksCollection.find().fetch());
  });

  if (isLoading()) {
    return <div>Loading...</div>;
  }

  return (
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
  );
};
