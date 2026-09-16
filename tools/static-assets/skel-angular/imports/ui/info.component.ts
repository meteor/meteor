import { Component, OnInit, OnDestroy, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Meteor } from 'meteor/meteor';
import { Tracker } from 'meteor/tracker';
import { LinksCollection } from '../api/links';

interface Link {
  _id?: string;
  title: string;
  url: string;
}

@Component({
  selector: 'app-info',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div>
      <h2>Learn Meteor!</h2>

      <div *ngIf="loading">Loading...</div>
      <div *ngIf="error" style="color:crimson">{{ error }}</div>

      <ul>
        <li *ngFor="let link of links; trackBy: trackById">
          <a [href]="link.url" target="_blank" rel="noopener noreferrer">
            {{ link.title }}
          </a>
        </li>
      </ul>
    </div>
  `
})
export class InfoComponent implements OnInit, OnDestroy {
  loading = true;
  error: string | null = null;
  links: Link[] = [];

  private linksSub: Meteor.SubscriptionHandle | null = null;
  private tracker: Tracker.Computation | null = null;

  constructor(private ngZone: NgZone) {}

  ngOnInit() {
    // Start the subscription with simple lifecycle callbacks
    this.linksSub = Meteor.subscribe('links', {
      onReady: () => {
        this.ngZone.run(() => {
          this.loading = false;
        });
      },
      onStop: (err?: Error) => {
        this.ngZone.run(() => {
          if (err) this.error = err.message || 'Subscription stopped';
          this.loading = false;
        });
      }
    });

    // Reactively fetch data from the collection
    this.tracker = Tracker.autorun(() => {
      const links = LinksCollection.find({}).fetch() as Link[];
      this.ngZone.run(() => {
        this.links = links;
      });
    });
  }

  trackById = (index: number, link: Link) => link._id ?? index;

  ngOnDestroy() {
    this.linksSub?.stop();
    this.tracker?.stop();
  }
}
