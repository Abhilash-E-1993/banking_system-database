// login.js — handles login form and redirects to dashboard on success
// Change this to your backend URL
const API_BASE = "http://localhost:3000";  

 // same-origin. Set to 'https://api.example.com' if different.
const form = document.getElementById('loginForm');
const alertBox = document.getElementById('formAlert');

function showAlert(message, type = 'error') {
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

  const email = form.email.value.trim();
  const password = form.password.value;

  let hasErr = false;
  if (!email) { document.querySelector('[data-for="email"]').textContent = 'Email required'; hasErr=true; }
  if (!password) { document.querySelector('[data-for="password"]').textContent = 'Password required'; hasErr=true; }
  if (hasErr) return;

  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Signing in...';

  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      credentials: 'include', // important: sessions via cookie
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (!res.ok) {
      // expected error shapes: { error: 'msg' } or { errors: [...] }
      const msg = data?.error || (Array.isArray(data?.errors) ? data.errors.map(x => x.msg || x).join(', ') : 'Login failed');
      showAlert(msg, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign in';
      return;
    }

    // success — redirect to dashboard
    window.location.href = 'dashboard.html';
  } catch (err) {
    showAlert('Network error. Check server and try again.');
    console.error(err);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign in';
  }
});
