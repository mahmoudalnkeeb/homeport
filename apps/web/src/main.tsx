import '@homeport/ui/styles.css';

import { initTheme } from '@homeport/ui';
import { render } from 'preact';

import { App } from './app';
import { initInstall } from './install';

initTheme();
initInstall();
const root = document.getElementById('app');
if (root) render(<App />, root);
