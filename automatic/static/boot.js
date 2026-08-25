(function () {
  const API = String(window.RTL_API || "").replace(/\/$/, "");
  const KEY = "rtl_web_password";
  window.RTL_API = API;

  function url(path) {
    const p = String(path).replace(/^\//, "");
    return API ? API + "/" + p : p;
  }
  window.rtlUrl = url;

  function basic(password) {
    const raw = unescape(encodeURIComponent("u:" + password));
    return "Basic " + btoa(raw);
  }

  function headers(extra) {
    const h = Object.assign({}, extra || {});
    if (!API) return h;
    const password = sessionStorage.getItem(KEY) || "";
    if (password) h.Authorization = basic(password);
    return h;
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
        <p>Тот же, что у планов и управления. Данные остаются на сервере.</p>
        <input id="rtl-gate-input" type="password" autocomplete="current-password" autofocus />
        <button type="submit" class="primary">Войти</button>
        <p class="rtl-gate-err" id="rtl-gate-err" hidden>Неверный пароль.</p>
      </form>`;
    document.body.appendChild(el);
    return el;
  }

  async function probe(password) {
    const res = await fetch(url("api/state"), {
      headers: password ? { Authorization: basic(password) } : {},
    });
    return res.ok;
  }

  let unlocking = null;
  function unlock() {
    if (!API) return Promise.resolve();
    if (unlocking) return unlocking;
    unlocking = (async () => {
      const saved = sessionStorage.getItem(KEY) || "";
      if (saved && await probe(saved)) return;
      sessionStorage.removeItem(KEY);
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
          sessionStorage.setItem(KEY, password);
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
    const res = await fetch(url(path), Object.assign({}, opts, { headers: headers(opts.headers) }));
    if (API && res.status === 401) {
      sessionStorage.removeItem(KEY);
      await unlock();
      return fetch(url(path), Object.assign({}, opts, { headers: headers(opts.headers) }));
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

  window.rtlReady = unlock();
})();
