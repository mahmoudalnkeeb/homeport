import '@homelab/ui/styles.css';

import { initTheme } from '@homelab/ui';
import { render } from 'preact';

import { App } from './app';

initTheme();
const root = document.getElementById('app');
if (root) render(<App />, root);
