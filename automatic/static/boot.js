(function () {
  const API = String(window.RTL_API || "").replace(/\/$/, "");
  const KEY = "rtl_web_password";
  const TTL = 7 * 24 * 60 * 60;
  window.RTL_API = API;

  function url(path) {
    const p = String(path).replace(/^\//, "");
    return API ? API + "/" + p : p;
  }
  window.rtlUrl = url;

  function cookiePath() {
    const match = location.pathname.match(/^(.*\/automatic)(?:\/|$)/);
    return match ? match[1] : "/";
  }

  function cookieSuffix() {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    return "; Path=" + cookiePath() + "; SameSite=Lax" + secure;
  }

  function readPassword() {
    const prefix = KEY + "=";
    for (const part of document.cookie.split(";")) {
      const item = part.trim();
      if (item.startsWith(prefix)) return decodeURIComponent(item.slice(prefix.length));
    }
    return sessionStorage.getItem(KEY) || "";
  }

  function writePassword(password) {
    document.cookie = KEY + "=" + encodeURIComponent(password) + "; Max-Age=" + TTL + cookieSuffix();
    sessionStorage.removeItem(KEY);
  }

  function clearPassword() {
    document.cookie = KEY + "=; Max-Age=0" + cookieSuffix();
    sessionStorage.removeItem(KEY);
  }

  function basic(password) {
    const raw = unescape(encodeURIComponent("u:" + password));
    return "Basic " + btoa(raw);
  }

  function headers(extra) {
    const h = Object.assign({}, extra || {});
    if (!API) return h;
    const password = readPassword();
    if (password) h.Authorization = basic(password);
    return h;
  }

  function fetchOpts(extra) {
    return Object.assign({ credentials: "include" }, extra || {});
  }

  function gateCard() {
    let el = document.getElementById("rtl-gate");
    if (el) return el;
    el = document.createElement("div");
    el.id = "rtl-gate";
    el.className = "rtl-gate";
    el.innerHTML = `
      <form class="rtl-gate-card" id="rtl-gate-form">
        <h2>Пароль</h2>
        <p>Данные остаются на сервере.</p>
        <input id="rtl-gate-input" type="password" autocomplete="current-password" autofocus />
        <button type="submit" class="primary">Войти</button>
        <p class="rtl-gate-err" id="rtl-gate-err" hidden>Неверный пароль.</p>
      </form>`;
    document.body.appendChild(el);
    return el;
  }

  async function hubSession() {
    try {
      const r = await fetch("/auth/me", { credentials: "include" });
      if (!r.ok) return null;
      return await r.json();
    } catch (err) {
      return null;
    }
  }

  async function blockHubUserWithoutAccess() {
    const u = await hubSession();
    if (!u) return false;
    if ((u.services || []).indexOf("automatic") >= 0) return false;
    window.RTL_HUB_BLOCKED = true;
    return true;
  }

  async function hubAllowed() {
    const u = await hubSession();
    if (!u) return false;
    return (u.services || []).indexOf("automatic") >= 0;
  }

  async function hubDenied() {
    const u = await hubSession();
    if (!u) return false;
    return (u.services || []).indexOf("automatic") < 0;
  }

  async function waitHubGate() {
    for (let i = 0; i < 300; i += 1) {
      if (!document.documentElement.classList.contains("rtl-auth-lock")) return true;
      if (document.querySelector(".rtl-auth-overlay")) return false;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return !document.documentElement.classList.contains("rtl-auth-lock");
  }

  async function probe(password) {
    try {
      const opts = { credentials: "include" };
      if (password) opts.headers = { Authorization: basic(password) };
      const res = await fetch(url("api/state"), opts);
      return res.ok;
    } catch (err) {
      return false;
    }
  }

  let unlocking = null;
  function unlock() {
    if (window.RTL_HUB_BLOCKED) return Promise.resolve();
    if (!API) return Promise.resolve();
    if (unlocking) return unlocking;
    unlocking = (async () => {
      if (await blockHubUserWithoutAccess()) return;
      const hasHubAuth = !!document.querySelector('script[src*="rtl_auth.js"]');
      if (hasHubAuth) {
        if (await probe("")) return;
        window.RTL_HUB_BLOCKED = true;
        return;
      }
      if (await hubDenied()) {
        window.RTL_HUB_BLOCKED = true;
        return;
      }
      if (await probe("")) return;
      const saved = readPassword();
      if (saved && await probe(saved)) {
        writePassword(saved);
        return;
      }
      clearPassword();
      const gate = gateCard();
      gate.hidden = false;
      const form = document.getElementById("rtl-gate-form");
      const input = document.getElementById("rtl-gate-input");
      const err = document.getElementById("rtl-gate-err");
      input.value = "";
      input.focus();
      await new Promise((resolve) => {
        form.onsubmit = async (e) => {
          e.preventDefault();
          const password = input.value;
          err.hidden = true;
          if (!password || !(await probe(password))) {
            err.hidden = false;
            return;
          }
          writePassword(password);
          gate.hidden = true;
          resolve();
        };
      });
    })().finally(() => { unlocking = null; });
    return unlocking;
  }

  window.rtlFetch = async function (path, opts) {
    opts = opts || {};
    await unlock();
    const res = await fetch(url(path), fetchOpts(Object.assign({}, opts, { headers: headers(opts.headers) })));
    if (API && res.status === 401) {
      clearPassword();
      await unlock();
      return fetch(url(path), fetchOpts(Object.assign({}, opts, { headers: headers(opts.headers) })));
    }
    return res;
  };

  window.rtlDownload = async function (name) {
    const res = await window.rtlFetch("api/download/" + encodeURIComponent(name));
    if (!res.ok) throw new Error("файл не скачался");
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  window.rtlReady = (async function () {
    if (document.readyState === "loading") {
      await new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve));
    }
    if (await blockHubUserWithoutAccess()) return;
    if (document.querySelector('script[src*="rtl_auth.js"]')) {
      const passed = await waitHubGate();
      if (!passed || !(await hubAllowed())) {
        window.RTL_HUB_BLOCKED = true;
        return;
      }
    } else if (await hubDenied()) {
      window.RTL_HUB_BLOCKED = true;
      return;
    }
    await unlock();
  })();
})();
