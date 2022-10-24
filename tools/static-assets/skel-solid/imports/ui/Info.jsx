import { LinksCollection } from "../api/links";
import { createSignal, For } from "solid-js";
import { Tracker } from "meteor/tracker";

export const Info = () => {
  const [links, setLinks] = createSignal([]);

  Tracker.autorun(() => {
    setLinks(LinksCollection.find().fetch());
  });

  return (
    <div>
      <h2>Learn Meteor!</h2>
      <ul>
        <For each={links()}>{
          (link) =>
            <li>
              <a href={link.url} target="_blank">{link.title}</a>
            </li>
        }</For>
      </ul>
    </div>
  )

}
