const form = document.querySelector('.filters');
if (form) {
  form.addEventListener('submit', event => event.preventDefault());
  const update = () => {
    const values = new FormData(form);
    const query = String(values.get('search') || '').toLowerCase().trim();
    let count = 0;
    for (const card of document.querySelectorAll('[data-advisory]')) {
      const matches = (!values.get('severity') || card.dataset.severity === values.get('severity')) && (!values.get('status') || card.dataset.status === values.get('status')) && card.dataset.search.includes(query);
      card.hidden = !matches;
      if (matches) count++;
    }
    document.querySelector('.result-count').textContent = `${count} advisory record(s)`;
    document.querySelector('.empty').hidden = count !== 0;
  };
  form.addEventListener('input', update);
  form.addEventListener('change', update);
}
const freshness = document.querySelector('[data-expiry]');
if (freshness && Date.now() >= Date.parse(freshness.dataset.expiry)) {
  freshness.classList.add('expired');
  freshness.querySelector('span:last-child').textContent = 'This catalog has expired. Engines must refresh to a valid release before applying new fixes.';
}
