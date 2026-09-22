import { Component } from '@angular/core';

@Component({
  selector: 'app-hello',
  standalone: true,
  template: `
    <div>
      <button (click)="increment()">Click Me</button>
      <p>You've pressed the button {{ counter }} times.</p>
    </div>
  `
})
export class HelloComponent {
  counter = 0;

  increment() {
    this.counter += 1;
  }
}
