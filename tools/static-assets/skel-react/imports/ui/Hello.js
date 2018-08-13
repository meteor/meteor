import React, { Component } from 'react';

export default class Hello extends Component {
  state = {
    counter: 0,
  }

  render() {
    const { counter } = this.state;

    return (
      <div>
          <button onClick={() => this.setState({ counter: counter + 1 })}>Click Me</button>
          <p>You've pressed the button {counter} times.</p>
      </div>
    );
  }
}
