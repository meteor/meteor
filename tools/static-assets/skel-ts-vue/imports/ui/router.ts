import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import Home from './Home.vue';

// Define the types for your components
const AboutComponent = () => import('./About.vue');

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    name: 'home',
    component: Home,
  },
  {
    path: '/about',
    name: 'about',
    component: AboutComponent,
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
