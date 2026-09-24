import { createSSRApp } from 'vue';
import App from './App.vue';
import './styles/token.scss';
import './styles/utility.scss';

export function createApp() {
  const app = createSSRApp(App);
  return { app };
}
