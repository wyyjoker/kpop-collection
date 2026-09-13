for (const href of ['/v0.1b.css', '/v0.2.css']) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.append(link);
}

import('/app-v0.1b.js')
  .then(() => import('/app-v0.2.js'))
  .catch((error) => {
    console.error('Failed to load K-pop Collection client:', error);
  });
