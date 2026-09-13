const v01bStyles = document.createElement('link');
v01bStyles.rel = 'stylesheet';
v01bStyles.href = '/v0.1b.css';
document.head.append(v01bStyles);

import('/app-v0.1b.js').catch((error) => {
  console.error('Failed to load K-pop Collection V0.1B client:', error);
});
