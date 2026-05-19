'use strict';

const firebaseConfig = {
  apiKey:            "AIzaSyAq-ugmxpd1P3HWf7fJB-Q92pEiGv6zhc8",
  authDomain:        "gvg-rooster.firebaseapp.com",
  databaseURL:       "https://gvg-rooster-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "gvg-rooster",
  storageBucket:     "gvg-rooster.firebasestorage.app",
  messagingSenderId: "1006078158007",
  appId:             "1:1006078158007:web:686bbf91f90d2444bf5932"
};

firebase.initializeApp(firebaseConfig);

const fbAuth = firebase.auth();
const fbDb   = firebase.database();

// Внутрішній суфікс email-а (Firebase потребує email-формат)
const FB_EMAIL_SUFFIX = '@gvg-roster.app';

let _fbCurrentUser = null;

function fbIsAdmin()  { return _fbCurrentUser !== null; }

function fbSignIn(username, password) {
  const email = username.toLowerCase().trim() + FB_EMAIL_SUFFIX;
  return fbAuth.signInWithEmailAndPassword(email, password);
}

function fbSignOut() { fbAuth.signOut(); }

function fbGetDisplayName() {
  if (!_fbCurrentUser) return null;
  return _fbCurrentUser.email.replace(FB_EMAIL_SUFFIX, '');
}

function fbUpdateAuthUI() {
  const btn = document.getElementById('auth-btn');
  if (!btn) return;
  if (_fbCurrentUser) {
    const name = fbGetDisplayName();
    btn.innerHTML = `${name} · <span class="auth-signout">Вийти</span>`;
    btn.onclick = fbSignOut;
    btn.classList.add('is-signed-in');
  } else {
    btn.innerHTML = '🔐 Увійти';
    btn.onclick = fbOpenLoginModal;
    btn.classList.remove('is-signed-in');
  }
}

fbAuth.onAuthStateChanged(user => {
  _fbCurrentUser = user;
  fbUpdateAuthUI();
  if (typeof render === 'function') render();
});

/* ─── Realtime Database ─────────────────────────────────────────────────── */
function fbSaveBattleState(data) {
  if (!fbIsAdmin()) return;
  fbDb.ref('battleState').set(data).catch(console.error);
}

function fbListenBattleState(callback) {
  fbDb.ref('battleState').on('value', snap => callback(snap.val()));
}

/* ─── Presets ───────────────────────────────────────────────────────────── */
function fbSaveBattlePreset(name, data) {
  if (!fbIsAdmin()) return Promise.reject('not admin');
  return fbDb.ref('battlePresets').push({
    name, createdAt: Date.now(),
    slots: data.slots, reserves: data.reserves
  }).then(ref => ref.key);
}

function fbUpdateBattlePreset(id, updates) {
  if (!fbIsAdmin()) return Promise.reject('not admin');
  return fbDb.ref(`battlePresets/${id}`).update(updates);
}

function fbDeleteBattlePreset(id) {
  if (!fbIsAdmin()) return Promise.reject('not admin');
  return fbDb.ref(`battlePresets/${id}`).remove();
}

function fbListenBattlePresets(cb) {
  fbDb.ref('battlePresets').on('value', snap => cb(snap.val() || {}));
}

function fbSaveStrategyPreset(name, elements) {
  if (!fbIsAdmin()) return Promise.reject('not admin');
  return fbDb.ref('strategyPresets').push({
    name, createdAt: Date.now(), elements
  }).then(ref => ref.key);
}

function fbUpdateStrategyPreset(id, updates) {
  if (!fbIsAdmin()) return Promise.reject('not admin');
  return fbDb.ref(`strategyPresets/${id}`).update(updates);
}

function fbDeleteStrategyPreset(id) {
  if (!fbIsAdmin()) return Promise.reject('not admin');
  return fbDb.ref(`strategyPresets/${id}`).remove();
}

function fbListenStrategyPresets(cb) {
  fbDb.ref('strategyPresets').on('value', snap => cb(snap.val() || {}));
}

/* ─── Login modal ───────────────────────────────────────────────────────── */
function fbOpenLoginModal() {
  const modal = document.getElementById('login-modal');
  if (modal) modal.classList.add('is-open');
}

document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('login-modal');
  const form  = document.getElementById('login-form');
  const errEl = document.getElementById('login-error');
  if (!modal || !form) return;

  // Закрити по кліку на фон
  modal.addEventListener('click', e => {
    if (e.target === modal) modal.classList.remove('is-open');
  });

  // Закрити по Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') modal.classList.remove('is-open');
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    errEl.textContent = '';
    const username = form.querySelector('[name="username"]').value;
    const password = form.querySelector('[name="password"]').value;
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Вхід…';
    try {
      await fbSignIn(username, password);
      modal.classList.remove('is-open');
      form.reset();
    } catch {
      errEl.textContent = 'Невірний логін або пароль';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Увійти';
    }
  });
});
