<script>
  import { Meteor } from "meteor/meteor";
  import { Tracker } from "meteor/tracker";
  import { onMount, onDestroy } from "svelte";
  import { LinksCollection } from "../api/links";

  let counter = 0;
  const addToCounter = () => { counter += 1 };

  let handle;
  let subIsReady = false;
  let links = [];

  let computation; // Tracker.autorun handle

  onMount(() => {
    // one subscription; don't recreate it in autorun
    handle = Meteor.subscribe("links.all");

    computation = Tracker.autorun(() => {
      const ready = handle.ready();      // reactive
      subIsReady = ready;
      links = ready ? LinksCollection.find().fetch() : [];
    });

    return () => {
      computation?.stop?.();
      handle?.stop?.();
    };
  });

  onDestroy(() => {
    computation?.stop?.();
    handle?.stop?.();
  });
</script>

<div class="container">
  <h1>Welcome to Meteor!</h1>
  <button on:click={addToCounter}>Click Me</button>
  <p>You've pressed the button {counter} times.</p>

  <h2>Learn Meteor!</h2>
  {#if subIsReady}
    <ul>
      {#each links as link (link._id)}
        <li><a href={link.url} target="_blank" rel="noreferrer">{link.title}</a></li>
      {/each}
    </ul>
  {:else}
    <div>Loading ...</div>
  {/if}
</div>
