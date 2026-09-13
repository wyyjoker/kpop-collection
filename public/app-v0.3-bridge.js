const v3Center = document.querySelector('#collectionCenterView');

function syncV3CenterState() {
  document.body.classList.toggle('v3-center-open', Boolean(v3Center && !v3Center.classList.contains('hidden')));
}

function closeV3CenterShell() {
  if (!v3Center || v3Center.classList.contains('hidden')) return;
  v3Center.classList.add('hidden');
  document.querySelector('#primaryAction')?.classList.remove('v3-hidden-action');
  history.replaceState({}, '', '/');
}

function hideUnusedPurchaseFields() {
  const form = document.querySelector('#versionDetailForm');
  if (!form) return;
  for (const name of ['purchase_date', 'purchase_price', 'purchase_currency']) {
    const field = form.elements[name];
    const label = field?.closest('label');
    if (label) {
      label.classList.add('v3-field-hidden');
      label.closest('.two-columns')?.classList.add('v3-single-column');
    }
  }
  for (const title of form.querySelectorAll('.detail-section-title')) {
    if (title.textContent.trim() === '收藏与购买') title.textContent = '收藏信息';
  }
}

if (v3Center) {
  new MutationObserver(syncV3CenterState).observe(v3Center, { attributes: true, attributeFilter: ['class'] });
  syncV3CenterState();
}

hideUnusedPurchaseFields();

document.addEventListener('click', (event) => {
  if (event.target.closest('#v3Back')) {
    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.href = '/';
    return;
  }

  if (!v3Center || v3Center.classList.contains('hidden')) return;
  if (event.target.closest('[data-v2-nav], #brandHome, #backButton')) closeV3CenterShell();
}, true);
