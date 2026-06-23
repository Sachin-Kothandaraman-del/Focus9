import { h, clear, toast } from '../ui.js';
import { api, session } from '../api.js';

const DEMO = [
  { email: 'requester@ega.ae', role: 'Requester' },
  { email: 'stores@ega.ae', role: 'Stores' },
  { email: 'approver@ega.ae', role: 'EGA Approver' },
  { email: 'admin@ega.ae', role: 'Administrator' },
];
const DEMO_PW = 'Passw0rd!23';

export function renderAuth(root, onAuthed) {
  clear(root);
  root.className = 'app-frame';
  const wrap = h('div', { class: 'auth-wrap' });
  root.appendChild(wrap);
  showLogin();

  function showLogin(prefillEmail = 'requester@ega.ae') {
    clear(wrap);
    const errBox = h('div', { class: 'error-box', style: 'display:none' });
    const email = h('input', { type: 'email', value: prefillEmail, autocomplete: 'username', placeholder: 'name@ega.ae' });
    const pw = h('input', { type: 'password', value: DEMO_PW, autocomplete: 'current-password', placeholder: '••••••••' });

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
      h('div', { class: 'auth-logo' }, [
        h('div', { class: 'big' }, 'EGA'),
        h('div', { class: 'small' }, 'DISTRIBUTION · FOCUS 9'),
      ]),
      h('div', { class: 'auth-card' }, [
        h('div', { class: 'strong', style: 'font-size:18px;margin-bottom:4px' }, 'Welcome back'),
        h('div', { class: 'muted small', style: 'margin-bottom:16px' }, 'Sign in to raise and track material distribution.'),
        errBox,
        h('label', { class: 'field' }, [h('span', { class: 'lbl' }, 'Email'), email]),
        h('label', { class: 'field' }, [h('span', { class: 'lbl' }, 'Password'), pw]),
        btn,
        h('div', { class: 'demo-accounts' }, [
          h('div', { class: 'section-title', style: 'margin-left:0' }, 'Demo accounts (tap to fill)'),
          ...DEMO.map((d) =>
            h('div', { class: 'acc', onclick: () => { email.value = d.email; pw.value = DEMO_PW; } }, [
              h('span', { class: 'mono' }, d.email),
              h('span', { class: 'chip cat' }, d.role),
            ])
          ),
        ]),
      ])
    );
  }

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
      h('div', { class: 'auth-logo' }, [h('div', { class: 'big' }, '🔐'), h('div', { class: 'small' }, 'TWO-FACTOR AUTHENTICATION')]),
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
}
