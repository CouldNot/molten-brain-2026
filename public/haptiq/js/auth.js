/* Haptiq — login form
   This is a front-end placeholder. It checks the fields, then sends the user
   to the Overview. Replace signIn() with your real auth call. */
(function () {
  'use strict';

  const form = document.getElementById('loginForm');
  const email = document.getElementById('email');
  const pw = document.getElementById('password');
  const err = document.getElementById('formErr');
  const toggle = document.getElementById('togglePw');

  if (new URLSearchParams(location.search).get('next')) err.textContent = 'Log in to see your dashboard.';

  toggle.addEventListener('click', () => {
    const show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });

  /* TODO(auth): replace with your backend, e.g.
     const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
     if (!res.ok) throw new Error('Wrong email or password.');
     return res.json(); // { userId, firstName, token }               */
  async function signIn(emailValue /*, passwordValue */) {
    const name = emailValue.split('@')[0].replace(/[._-]+/g, ' ');
    return { userId: 'demo', firstName: name.charAt(0).toUpperCase() + name.slice(1) };
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    email.classList.remove('err');
    pw.classList.remove('err');

    if (!email.value || !email.validity.valid) {
      email.classList.add('err');
      err.textContent = 'Enter a valid email.';
      email.focus();
      return;
    }
    if (pw.value.length < 6) {
      pw.classList.add('err');
      err.textContent = 'Password must be at least 6 characters.';
      pw.focus();
      return;
    }

    try {
      const user = await signIn(email.value, pw.value);
      // Demo session only. Don't keep real tokens in browser storage in production.
      const remember = form.elements.remember && form.elements.remember.checked;
      (remember ? localStorage : sessionStorage).setItem('haptiq_user', JSON.stringify(user));
      // go back to the page that sent the user here (only local .html pages allowed)
      const next = new URLSearchParams(location.search).get('next');
      window.location.href = next && /^[a-z0-9_-]+\.html$/i.test(next) ? next : 'overview.html';
    } catch (ex) {
      err.textContent = ex.message || 'Could not log in. Try again.';
    }
  });
})();
