for (const href of ['/v0.1b.css', '/v0.2.css', '/v0.3.css', '/v0.4.css', '/v0.5a.css', '/v0.5a-polish.css', '/v0.5a-hero.css', '/v0.5a-seventeen.css']) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.append(link);
}

import('/app-v0.1b.js')
  .then(() => import('/app-v0.2.js'))
  .then(() => import('/app-v0.3.js'))
  .then(() => import('/app-v0.3-bridge.js'))
  .then(() => import('/app-v0.4.js'))
  .then(() => import('/app-v0.5a.js'))
  .then(() => import('/app-v0.5a-polish.js'))
  .then(() => import('/app-v0.5a-hero.js'))
  .then(() => import('/app-v0.5a-seventeen.js'))
  .catch((error) => {
    console.error('Failed to load K-pop Collection client:', error);
  });
