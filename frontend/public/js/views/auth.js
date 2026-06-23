import { h, clear, toast } from '../ui.js';
import { api, session } from '../api.js';

const ROLES = [
  { value: 'requester', label: 'Requester — raise material requests' },
  { value: 'storekeeper', label: 'Stores — fulfil & deliver' },
  { value: 'approver', label: 'E&E Approver — approve over-allocation' },
  { value: 'admin', label: 'Administrator — full access' },
];

// Mirrors the backend password policy so users get instant feedback.
const PW_RULES = [
  { test: (p) => p.length >= 10, label: 'At least 10 characters' },
  { test: (p) => /[A-Z]/.test(p), label: 'An uppercase letter' },
  { test: (p) => /[a-z]/.test(p), label: 'A lowercase letter' },
  { test: (p) => /[0-9]/.test(p), label: 'A number' },
  { test: (p) => /[^A-Za-z0-9]/.test(p), label: 'A symbol' },
];

export function renderAuth(root, onAuthed) {
  clear(root);
  root.className = 'app-frame';
  const wrap = h('div', { class: 'auth-wrap' });
  root.appendChild(wrap);
  showLogin();

  // ---------------------------------------------------------------- SIGN IN
  function showLogin(prefillEmail = '', banner = null) {
    clear(wrap);
    const errBox = h('div', { class: 'error-box', style: 'display:none' });
    const email = h('input', { type: 'email', value: prefillEmail, autocomplete: 'username', placeholder: 'you@company.com' });
    const pw = h('input', { type: 'password', autocomplete: 'current-password', placeholder: '••••••••' });
    const btn = h('button', { class: 'btn', onclick: doLogin }, 'Sign in');

    async function doLogin() {
      errBox.style.display = 'none';
      btn.disabled = true; btn.textContent = 'Checking…';
      try {
        const res = await api.login(email.value.trim(), pw.value);
        showOtp(res.userId, email.value.trim(), res.devOtp);
      } catch (e) {
        errBox.textContent = e.message; errBox.style.display = 'block';
      } finally {
        btn.disabled = false; btn.textContent = 'Sign in';
      }
    }

    wrap.append(
      logo('E&E', 'DISTRIBUTION · FOCUS 9'),
      h('div', { class: 'auth-card' }, [
        banner ? h('div', { class: 'ok-box' }, banner) : null,
        h('div', { class: 'strong', style: 'font-size:18px;margin-bottom:4px' }, 'Welcome back'),
        h('div', { class: 'muted small', style: 'margin-bottom:16px' }, 'Sign in to raise and track material distribution.'),
        errBox,
        field('Email', email),
        field('Password', pw),
        btn,
        h('div', { class: 'auth-switch' }, [
          'New to E&E Distribution? ',
          h('a', { class: 'link', onclick: () => showSignup() }, 'Create an account'),
        ]),
      ])
    );
  }

  // ---------------------------------------------------------------- SIGN UP
  function showSignup() {
    clear(wrap);
    const errBox = h('div', { class: 'error-box', style: 'display:none' });
    const name = h('input', { type: 'text', autocomplete: 'name', placeholder: 'Your full name' });
    const email = h('input', { type: 'email', autocomplete: 'email', placeholder: 'you@company.com' });
    const role = h('select', {}, ROLES.map((r) => h('option', { value: r.value }, r.label)));
    const pw = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Create a password' });
    const pw2 = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Confirm password' });

    // Live password-policy checklist.
    const ruleEls = PW_RULES.map((r) => h('li', { class: 'pw-rule' }, [h('span', { class: 'dot' }, '○'), r.label]));
    const ruleList = h('ul', { class: 'pw-rules' }, ruleEls);
    function refreshRules() {
      PW_RULES.forEach((r, i) => {
        const ok = r.test(pw.value);
        ruleEls[i].classList.toggle('ok', ok);
        ruleEls[i].querySelector('.dot').textContent = ok ? '●' : '○';
      });
    }
    pw.addEventListener('input', refreshRules);

    const btn = h('button', { class: 'btn', onclick: doSignup }, 'Create account');

    async function doSignup() {
      errBox.style.display = 'none';
      const allRulesOk = PW_RULES.every((r) => r.test(pw.value));
      if (!name.value.trim()) return fail('Please enter your name.');
      if (!email.value.trim()) return fail('Please enter your email.');
      if (!allRulesOk) return fail('Password does not meet all requirements.');
      if (pw.value !== pw2.value) return fail('Passwords do not match.');

      btn.disabled = true; btn.textContent = 'Creating…';
      try {
        await api.register({ name: name.value.trim(), email: email.value.trim(), password: pw.value, role: role.value });
        toast('Account created');
        showLogin(email.value.trim(), 'Account created successfully — please sign in.');
      } catch (e) {
        fail(e.message);
      } finally {
        btn.disabled = false; btn.textContent = 'Create account';
      }
    }
    function fail(msg) {
      errBox.textContent = msg; errBox.style.display = 'block';
      btn.disabled = false; btn.textContent = 'Create account';
    }

    wrap.append(
      logo('E&E', 'CREATE YOUR ACCOUNT'),
      h('div', { class: 'auth-card' }, [
        h('div', { class: 'strong', style: 'font-size:18px;margin-bottom:4px' }, 'Sign up'),
        h('div', { class: 'muted small', style: 'margin-bottom:16px' }, 'Create an account to request and track material distribution.'),
        errBox,
        field('Full name', name),
        field('Email', email),
        field('Account type', role),
        field('Password', pw),
        ruleList,
        field('Confirm password', pw2),
        btn,
        h('div', { class: 'auth-switch' }, [
          'Already have an account? ',
          h('a', { class: 'link', onclick: () => showLogin('') }, 'Sign in'),
        ]),
      ])
    );
    refreshRules();
  }

  // ---------------------------------------------------------------- OTP / MFA
  function showOtp(userId, email, devOtp) {
    clear(wrap);
    const errBox = h('div', { class: 'error-box', style: 'display:none' });
    const inputs = [];
    const otpRow = h('div', { class: 'otp-inputs' });
    for (let i = 0; i < 6; i++) {
      const inp = h('input', {
        type: 'tel', maxlength: '1', inputmode: 'numeric',
        oninput: (e) => {
          if (e.target.value && i < 5) inputs[i + 1].focus();
          if (inputs.every((x) => x.value)) verify();
        },
        onkeydown: (e) => { if (e.key === 'Backspace' && !e.target.value && i > 0) inputs[i - 1].focus(); },
      });
      inputs.push(inp); otpRow.appendChild(inp);
    }
    if (devOtp) setTimeout(() => { devOtp.split('').forEach((d, i) => (inputs[i].value = d)); }, 250);

    const btn = h('button', { class: 'btn', onclick: verify }, 'Verify & continue');

    async function verify() {
      const code = inputs.map((x) => x.value).join('');
      if (code.length !== 6) return;
      errBox.style.display = 'none';
      btn.disabled = true; btn.textContent = 'Verifying…';
      try {
        const res = await api.verifyOtp(userId, code);
        session.tokens = { accessToken: res.accessToken, refreshToken: res.refreshToken };
        session.user = res.user;
        toast(`Welcome, ${res.user.name.split(' ')[0]}`);
        onAuthed(res.user);
      } catch (e) {
        errBox.textContent = e.message; errBox.style.display = 'block';
        inputs.forEach((x) => (x.value = '')); inputs[0].focus();
      } finally {
        btn.disabled = false; btn.textContent = 'Verify & continue';
      }
    }

    wrap.append(
      logo('🔐', 'TWO-FACTOR AUTHENTICATION'),
      h('div', { class: 'auth-card' }, [
        h('div', { class: 'strong', style: 'font-size:18px;margin-bottom:4px' }, 'Enter your code'),
        h('div', { class: 'muted small' }, `We sent a 6-digit one-time code for ${email}.`),
        devOtp ? h('div', { class: 'devotp', style: 'margin-top:12px' }, ['Dev OTP delivery → ', h('b', {}, devOtp)]) : null,
        errBox, otpRow, btn,
        h('button', { class: 'btn outline', style: 'margin-top:10px', onclick: () => showLogin(email) }, '← Back'),
      ])
    );
    inputs[0].focus();
  }

  // helpers
  function logo(big, small) {
    return h('div', { class: 'auth-logo' }, [h('div', { class: 'big' }, big), h('div', { class: 'small' }, small)]);
  }
  function field(label, input) {
    return h('label', { class: 'field' }, [h('span', { class: 'lbl' }, label), input]);
  }
}
