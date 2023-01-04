<script>
  import { Meteor } from "meteor/meteor";
  import { LinksCollection } from '../api/links';
  
  let counter = 0;
  const addToCounter = () => {
    counter += 1;
  }
  
  let subIsReady = false;
  $m: {
    const handle = Meteor.subscribe("links.all");
    subIsReady = handle.ready();
  }

  // more information about $m at https://atmospherejs.com/zodern/melte#tracker-statements
  let links;
  $m: links = LinksCollection.find().fetch();
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
  <h2>Typescript ready</h2>
  <p>Just add lang="ts" to .svelte components.</p>
</div>
