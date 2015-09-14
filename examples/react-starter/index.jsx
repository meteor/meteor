// A collection that is synchronized across client and server with the
// 'autopublish' package. To control where the data is accessible from, remove
// 'autopublish' and use Meteor.publish and Meteor.subscribe
Items = new Mongo.Collection("items");

// A React component, defined in the normal way
App = React.createClass({
  mixins: [ReactMeteorData],

  // Load data from collections inside this special method enabled by the
  // ReactMeteorData mixin. The results are attached to this.data on the
  // component
  getMeteorData() {
    return {
      items: Items.find().fetch()
    };
  },

  addItem() {
    const nextIndex = Items.find().count() + 1;

    // We can insert from the client because we have the 'insecure' package
    // installed. Remove it and use Meteor methods for better security
    Items.insert({
      text: "Hello world! " + nextIndex
    });
  },

  renderItems() {
    return this.data.items.map((item) => {
      return (
        <li key={item._id}>
          {item.text}
        </li>
      );
    });
  },

  render() {
    return (
      <div>
        <ul>
          {this.renderItems()}
        </ul>

        <button onClick={this.addItem}>
          Add item
        </button>
      </div>
    )
  }
});

if (Meteor.isClient) {
  // Code here runs on the client only

  Meteor.startup(() => {
    // Make sure to render after startup so the DOM is ready
    React.render(<App />, document.getElementById("react-container"));
  });
}

if (Meteor.isServer) {
  // Code inside here will run on the server only
}
