const v3Center = document.querySelector('#collectionCenterView');

function syncV3CenterState() {
  document.body.classList.toggle('v3-center-open', Boolean(v3Center && !v3Center.classList.contains('hidden')));
}

if (v3Center) {
  new MutationObserver(syncV3CenterState).observe(v3Center, { attributes: true, attributeFilter: ['class'] });
  syncV3CenterState();
}

document.addEventListener('click', (event) => {
  if (!event.target.closest('#v3Back')) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  window.location.href = '/';
}, true);
