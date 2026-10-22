import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HelloComponent } from './hello.component';
import { InfoComponent } from './info.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, HelloComponent, InfoComponent],
  templateUrl: './app.html',
})
export class App implements OnInit {
  title = 'Angular Meteor App';

  ngOnInit(): void {
    console.log('App component initialized!');
  }
}
