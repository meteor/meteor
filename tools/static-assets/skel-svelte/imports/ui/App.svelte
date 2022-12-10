<script>
  import { LinksCollection } from '/imports/api/links';
  
  let counter = 0;
  const addToCounter = () => {
    counter += 1;
  }
  
  const subIsReady = true; // remove this line if you want to use the code below
  // no need to publish/subscribe as there is autopublish package installed
  // let subIsReady = false;
  // $m: {
  //   const handle = Meteor.subscribe('links.all'); // todo: setup the server-side publication
  //   subIsReady = handle.ready();
  // }

  // $m is available from zodern:melte package
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
</div>
