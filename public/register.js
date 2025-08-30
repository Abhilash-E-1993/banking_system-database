// register.js — register new user and auto-login (session cookie set by server)
const API_BASE = ' http://localhost:3000'; // same-origin
const form = document.getElementById('registerForm');
const alertBox = document.getElementById('formAlert');

function showAlert(message, type='error') {
  alertBox.textContent = message;
  alertBox.className = 'alert ' + (type === 'error' ? 'error' : 'success');
  alertBox.hidden = false;
}

function clearErrors() {
  document.querySelectorAll('.error').forEach(e => (e.textContent = ''));
  alertBox.hidden = true;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors();

  const name = form.name.value.trim();
  const email = form.email.value.trim();
  const password = form.password.value;

  let hasErr = false;
  if (!name) { document.querySelector('[data-for="name"]').textContent = 'Name required'; hasErr = true; }
  if (!email) { document.querySelector('[data-for="email"]').textContent = 'Email required'; hasErr = true; }
  if (!password || password.length < 6) { document.querySelector('[data-for="password"]').textContent = 'Password must be 6+ chars'; hasErr = true; }
  if (hasErr) return;

  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating...';

  try {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });

    const data = await res.json();
    if (!res.ok) {
      const msg = data?.error || (Array.isArray(data?.errors) ? data.errors.map(x => x.msg || x).join(', ') : 'Registration failed');
      showAlert(msg, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create account';
      return;
    }

    // success — redirect to dashboard
    window.location.href = 'dashboard.html';
  } catch (err) {
    showAlert('Network error. Try again.');
    console.error(err);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create account';
  }
});
