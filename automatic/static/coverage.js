(function () {
  const STATE = {
    universe: "company",
    meta: null,
    rows: [],
    summary: null,
    view: [],
    selected: null,
    sortKey: "coverage",
    sortDir: 1,
    covFilter: "all",
    search: "",
    booted: false,
  };

  const COLS = [
    { key: "name", title: "Карточка" },
    { key: "mop", title: "Ответственный" },
    { key: "rfm", title: "RFM" },
    { key: "coverage_title", title: "Проработка" },
    { key: "last_kind", title: "Последнее" },
    { key: "has_deal", title: "Сделка" },
    { key: "deal_links", title: "Открытые сделки" },
    { key: "has_sp", title: "СП" },
    { key: "sp_links", title: "Открытые СП" },
  ];

  function $(id) {
    return document.getElementById(id);
  }
  function must(id) {
    const el = $(id);
    if (!el) throw new Error("Нет элемента #" + id);
    return el;
  }
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function showMsg(text, ok) {
    const msg = $("cov-msg");
    if (!msg) return;
    msg.textContent = text || "";
    msg.className = text ? ("msg show " + (ok ? "ok" : "err")) : "msg";
  }
  function monthBounds() {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    function iso(d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return y + "-" + m + "-" + day;
    }
    return { from: iso(from), to: iso(now) };
  }
  function checks(root, name, items, checkedIds) {
    if (!root) return;
    const list = items || [];
    const all = !(checkedIds && checkedIds.length);
    const set = {};
    (checkedIds || []).forEach(function (id) { set[String(id)] = true; });
    if (!list.length) {
      root.innerHTML = "<p class='empty'>Нет значений в складе</p>";
      return;
    }
    root.innerHTML = list.map(function (item) {
      const on = all || set[String(item.id)];
      return "<label><input type=\"checkbox\" name=\"" + name + "\" value=\"" +
        escapeHtml(item.id) + "\"" + (on ? " checked" : "") + " /> " +
        escapeHtml(item.title) + "</label>";
    }).join("");
  }
  function selected(name) {
    return Array.prototype.slice.call(document.querySelectorAll("input[name=\"" + name + "\"]:checked"))
      .map(function (el) { return el.value; });
  }
  function setChecks(name, ids) {
    const set = {};
    (ids || []).forEach(function (id) { set[String(id)] = true; });
    document.querySelectorAll("input[name=\"" + name + "\"]").forEach(function (el) {
      el.checked = !!set[el.value];
    });
  }
  function checkAll(name, on) {
    document.querySelectorAll("input[name=\"" + name + "\"]").forEach(function (el) {
      el.checked = on;
    });
  }
  function fillPresets() {
    const select = $("cov-preset");
    if (!select || !STATE.meta) return;
    const items = (STATE.meta.presets || []).filter(function (p) {
      return p.universe === STATE.universe;
    });
    select.innerHTML = "<option value=\"\">Без пресета</option>" + items.map(function (p) {
      return "<option value=\"" + escapeHtml(p.id) + "\">" + escapeHtml(p.title) + "</option>";
    }).join("");
  }
  function setUniverse(universe, syncUi) {
    STATE.universe = universe || "company";
    if (syncUi !== false) {
      document.querySelectorAll("#cov-universe .sub-pill").forEach(function (b) {
        b.classList.toggle("on", b.getAttribute("data-universe") === STATE.universe);
      });
    }
    const company = $("cov-company-fields");
    const lead = $("cov-lead-fields");
    if (company) company.hidden = STATE.universe !== "company";
    if (lead) lead.hidden = STATE.universe !== "lead";
    fillPresets();
  }
  function applyPreset(id) {
    const enums = (STATE.meta && STATE.meta.enums) || {};
    if (!id) {
      checkAll("cov-mop", true);
      checkAll("cov-rfm", true);
      checkAll("cov-work", true);
      checkAll("cov-type", true);
      checkAll("cov-dir", true);
      checkAll("cov-lead-sem", true);
      return;
    }
    if (id === "rfm_work") {
      setUniverse("company");
      checkAll("cov-mop", true);
      checkAll("cov-work", true);
      checkAll("cov-type", true);
      checkAll("cov-dir", true);
      setChecks("cov-rfm", (enums.rfm || []).map(function (x) { return x.id; })
        .filter(function (x) { return x !== "8538" && x !== "9026"; }));
    } else if (id === "no_purchases") {
      setUniverse("company");
      checkAll("cov-mop", true);
      checkAll("cov-work", true);
      checkAll("cov-type", true);
      checkAll("cov-dir", true);
      setChecks("cov-rfm", ["9026"]);
    } else if (id === "leads_open") {
      setUniverse("lead");
      checkAll("cov-mop", true);
      setChecks("cov-lead-sem", ["P"]);
    } else if (id === "contacts_solo") {
      setUniverse("contact");
      checkAll("cov-mop", true);
    }
  }
  function payload() {
    return {
      universe: STATE.universe,
      preset: "",
      period_from: must("cov-period-from").value || null,
      period_to: must("cov-period-to").value || null,
      created_from: ($("cov-created-from") && $("cov-created-from").value) || null,
      created_to: ($("cov-created-to") && $("cov-created-to").value) || null,
      rfm: selected("cov-rfm"),
      work_status: selected("cov-work"),
      client_type: selected("cov-type"),
      direction: selected("cov-dir"),
      lead_semantic: selected("cov-lead-sem"),
      mop_ids: selected("cov-mop"),
    };
  }
  function badge(row) {
    const cls = row.coverage === "touched" ? "ok" : row.coverage === "email" ? "mail" : "bad";
    return "<span class=\"cov-badge " + cls + "\">" + escapeHtml(row.coverage_title) + "</span>";
  }
  function linkList(items) {
    const list = items || [];
    if (!list.length) return "—";
    return list.map(function (link) {
      return "<a class=\"file-link\" href=\"" + escapeHtml(link.url) +
        "\" target=\"_blank\" rel=\"noopener\">" + escapeHtml(link.title || link.id) + "</a>";
    }).join("<br>");
  }
  function sortValue(row, key) {
    if (key === "coverage" || key === "coverage_title") {
      return ({ none: 0, email: 1, touched: 2 })[row.coverage] || 9;
    }
    if (key === "has_deal" || key === "has_sp") return row[key] ? 1 : 0;
    if (key === "deal_links" || key === "sp_links") return (row[key] || []).length;
    if (key === "last_kind") return ((row.last_kind || "") + " " + (row.last_at || "")).toLowerCase();
    return String(row[key] == null ? "" : row[key]).toLowerCase();
  }
  function visibleRows() {
    const q = (STATE.search || "").trim().toLowerCase();
    let rows = STATE.rows.slice();
    if (STATE.covFilter !== "all") {
      rows = rows.filter(function (r) { return r.coverage === STATE.covFilter; });
    }
    if (q) {
      rows = rows.filter(function (r) {
        return [r.name, r.mop, r.rfm, r.work_status, r.client_type, r.direction,
          r.coverage_title, r.last_kind, r.last_subject]
          .join(" ").toLowerCase().indexOf(q) >= 0;
      });
    }
    const dir = STATE.sortDir;
    const key = STATE.sortKey;
    rows.sort(function (a, b) {
      const va = sortValue(a, key);
      const vb = sortValue(b, key);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return String(a.name || "").localeCompare(String(b.name || ""), "ru") * dir;
    });
    return rows;
  }
  function renderSummary(summary) {
    const box = $("cov-summary");
    if (!box) return;
    summary = summary || {};
    const items = [
      ["all", "В срезе", summary.total],
      ["touched", "Потроганы", summary.touched],
      ["email", "Только письмо", summary.email],
      ["none", "Тишина", summary.none],
      ["deal", "Со сделкой", summary.with_deal],
      ["sp", "С СП", summary.with_sp],
    ];
    box.innerHTML = items.map(function (item) {
      const key = item[0];
      const label = item[1];
      const val = item[2] == null ? 0 : item[2];
      const clickable = key === "all" || key === "touched" || key === "email" || key === "none";
      const on = clickable && ((key === "all" && STATE.covFilter === "all") || key === STATE.covFilter);
      return "<div class=\"cov-kpi" + (on ? " on" : "") + "\" data-cov=\"" +
        (clickable ? key : "") + "\"><span>" + label + "</span><b>" + val + "</b></div>";
    }).join("");
    box.querySelectorAll(".cov-kpi[data-cov]").forEach(function (el) {
      if (!el.getAttribute("data-cov")) return;
      el.addEventListener("click", function () {
        STATE.covFilter = el.getAttribute("data-cov");
        syncChips();
        paintTable();
        renderSummary(STATE.summary);
      });
    });
  }
  function syncChips() {
    document.querySelectorAll("#cov-chips .cov-chip").forEach(function (btn) {
      btn.classList.toggle("on", btn.getAttribute("data-cov") === STATE.covFilter);
    });
  }
  function paintDetail(row) {
    const panel = $("cov-detail");
    if (!panel) return;
    if (!row) {
      panel.hidden = true;
      panel.innerHTML = "";
      return;
    }
    panel.hidden = false;
    panel.innerHTML =
      "<h3><a class=\"file-link\" href=\"" + escapeHtml(row.url) +
      "\" target=\"_blank\" rel=\"noopener\">" + escapeHtml(row.name) + "</a></h3>" +
      "<div class=\"cov-detail-meta\">" +
      "<span>" + badge(row) + "</span>" +
      "<span>Ответственный: " + escapeHtml(row.mop) + "</span>" +
      "<span>RFM: " + escapeHtml(row.rfm) + "</span>" +
      "<span>" + escapeHtml(row.last_kind || "Нет касания") +
      (row.last_at ? " · " + escapeHtml(row.last_at) : "") + "</span>" +
      "<span>Касаний: " + (row.touches || 0) + " · Писем: " + (row.emails || 0) + "</span>" +
      "<span>Сделка: " + (row.has_deal ? "да" : "нет") + " · СП: " +
      (row.has_sp ? "да" : "нет") + "</span></div>" +
      ((row.deal_links && row.deal_links.length)
        ? "<div class=\"cov-detail-meta\" style=\"margin-top:8px\"><span>Открытые сделки:</span> " +
          linkList(row.deal_links) + "</div>"
        : "") +
      ((row.sp_links && row.sp_links.length)
        ? "<div class=\"cov-detail-meta\" style=\"margin-top:8px\"><span>Открытые СП:</span> " +
          linkList(row.sp_links) + "</div>"
        : "") +
      (row.last_text || row.last_subject
        ? "<div class=\"cov-quote\">" + escapeHtml(row.last_subject || "") +
          (row.last_text ? "<br>" + escapeHtml(row.last_text) : "") + "</div>"
        : "<p class=\"hint\" style=\"margin:8px 0 0\">Нет текста последней активности</p>");
  }
  function paintTable() {
    STATE.view = visibleRows();
    const meta = $("cov-view-meta");
    if (meta) {
      meta.textContent = "На экране " + STATE.view.length + " из " + STATE.rows.length +
        ". «Сформировать файл» — Excel видимой таблицы во вкладку Готовые.";
    }
    const table = $("cov-table");
    if (!table) return;
    if (!STATE.view.length) {
      table.innerHTML = "<p class='empty'>Нет строк под текущий поиск и фильтр.</p>";
      paintDetail(null);
      return;
    }
    function arrow(key) {
      if (STATE.sortKey !== key && !(key === "coverage_title" && STATE.sortKey === "coverage")) return "";
      return STATE.sortDir > 0 ? " ↑" : " ↓";
    }
    table.innerHTML =
      "<div class=\"table-wrap cov-wrap\"><table class=\"flat\"><thead><tr>" +
      COLS.map(function (c) {
        return "<th data-sort=\"" + c.key + "\">" + c.title + arrow(c.key) + "</th>";
      }).join("") +
      "</tr></thead><tbody>" +
      STATE.view.map(function (row, i) {
        const on = STATE.selected && STATE.selected.id === row.id ? " on" : "";
        return "<tr class=\"cov-row" + on + "\" data-i=\"" + i + "\">" +
          "<td><a class=\"file-link\" href=\"" + escapeHtml(row.url) +
          "\" target=\"_blank\" rel=\"noopener\">" + escapeHtml(row.name) + "</a></td>" +
          "<td>" + escapeHtml(row.mop) + "</td>" +
          "<td>" + escapeHtml(row.rfm) + "</td>" +
          "<td>" + badge(row) + "</td>" +
          "<td>" + escapeHtml(row.last_kind || "—") +
          (row.last_at ? " · " + escapeHtml(row.last_at) : "") + "</td>" +
          "<td>" + (row.has_deal ? "да" : "") + "</td>" +
          "<td class=\"cov-links\">" + linkList(row.deal_links) + "</td>" +
          "<td>" + (row.has_sp ? "да" : "") + "</td>" +
          "<td class=\"cov-links\">" + linkList(row.sp_links) + "</td></tr>";
      }).join("") +
      "</tbody></table></div>";
    table.querySelectorAll("th[data-sort]").forEach(function (th) {
      th.addEventListener("click", function () {
        const key = th.getAttribute("data-sort") === "coverage_title" ? "coverage" : th.getAttribute("data-sort");
        if (STATE.sortKey === key) STATE.sortDir *= -1;
        else {
          STATE.sortKey = key;
          STATE.sortDir = 1;
        }
        paintTable();
      });
    });
    const tbody = table.querySelector("tbody");
    if (tbody) {
      tbody.addEventListener("click", function (e) {
        if (e.target.closest && e.target.closest("a")) return;
        const tr = e.target.closest ? e.target.closest("tr.cov-row") : null;
        if (!tr) return;
        STATE.selected = STATE.view[Number(tr.getAttribute("data-i"))];
        paintTable();
        paintDetail(STATE.selected);
      });
    }
    if (STATE.selected) {
      const still = STATE.view.filter(function (r) { return r.id === STATE.selected.id; })[0];
      paintDetail(still || null);
      if (!still) STATE.selected = null;
    }
  }
  function showResult(rows, summary) {
    STATE.rows = rows || [];
    STATE.summary = summary || {};
    STATE.selected = null;
    STATE.covFilter = "all";
    STATE.search = "";
    const search = $("cov-search");
    if (search) search.value = "";
    syncChips();
    const result = must("cov-result");
    result.hidden = false;
    renderSummary(STATE.summary);
    paintTable();
    result.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function bindShell() {
    const bounds = monthBounds();
    must("cov-period-from").value = bounds.from;
    must("cov-period-to").value = bounds.to;
    if ($("cov-created-from")) $("cov-created-from").value = "";
    if ($("cov-created-to")) $("cov-created-to").value = "";

    document.querySelectorAll("#cov-universe .sub-pill").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const universe = btn.getAttribute("data-universe");
        setUniverse(universe);
        const preset = $("cov-preset");
        if (preset) preset.value = "";
        applyPreset("");
      });
    });
    const preset = $("cov-preset");
    if (preset) {
      preset.addEventListener("change", function () {
        applyPreset(preset.value);
      });
    }
    document.querySelectorAll("#cov-chips .cov-chip").forEach(function (btn) {
      btn.addEventListener("click", function () {
        STATE.covFilter = btn.getAttribute("data-cov");
        syncChips();
        renderSummary(STATE.summary || {});
        paintTable();
      });
    });
    const search = $("cov-search");
    if (search) {
      search.addEventListener("input", function () {
        STATE.search = search.value || "";
        paintTable();
      });
    }
    must("cov-btn").addEventListener("click", async function () {
      const btn = must("cov-btn");
      btn.disabled = true;
      btn.textContent = "Сборка…";
      showMsg("");
      try {
        const res = await window.rtlFetch("api/coverage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload()),
        });
        const body = await res.json();
        if (!body.ok) {
          showMsg(body.error || "Не собралось", false);
          return;
        }
        showResult(body.rows || [], body.summary || {});
        showMsg("Готово: " + ((body.summary && body.summary.total) || 0) +
          " карточек. Изучите таблицу ниже, затем «Сформировать файл».", true);
      } catch (err) {
        showMsg((err && err.message) || "Сервер не отвечает.", false);
      } finally {
        btn.disabled = false;
        btn.textContent = "Собрать проработку";
      }
    });
    must("cov-xlsx").addEventListener("click", async function () {
      if (!STATE.view.length) {
        showMsg("Сначала соберите таблицу.", false);
        return;
      }
      const btn = must("cov-xlsx");
      btn.disabled = true;
      const prev = btn.textContent;
      btn.textContent = "Формирую…";
      try {
        const summary = Object.assign({}, STATE.summary || {}, {
          total: STATE.view.length,
          touched: STATE.view.filter(function (r) { return r.coverage === "touched"; }).length,
          email: STATE.view.filter(function (r) { return r.coverage === "email"; }).length,
          none: STATE.view.filter(function (r) { return r.coverage === "none"; }).length,
          with_deal: STATE.view.filter(function (r) { return r.has_deal; }).length,
          with_sp: STATE.view.filter(function (r) { return r.has_sp; }).length,
        });
        const res = await window.rtlFetch("api/coverage/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: STATE.view, summary: summary }),
        });
        const body = await res.json();
        if (!body.ok || !body.file) {
          showMsg(body.error || "Не удалось сделать Excel", false);
          return;
        }
        if (window.loadState) await window.loadState();
        if (window.goReady) window.goReady("coverage");
        showMsg("Файл в Готовых: " + body.file.name + " (" + STATE.view.length + " строк)", true);
      } catch (err) {
        showMsg((err && err.message) || "Сервер не отвечает.", false);
      } finally {
        btn.disabled = false;
        btn.textContent = prev;
      }
    });
    setUniverse(STATE.universe);
  }
  function fillMeta(body) {
    STATE.meta = body;
    const enums = body.enums || {};
    checks($("cov-rfm"), "cov-rfm", enums.rfm);
    checks($("cov-work"), "cov-work", enums.work_status);
    checks($("cov-type"), "cov-type", enums.client_type);
    checks($("cov-dir"), "cov-dir", enums.direction);
    checks($("cov-lead-sem"), "cov-lead-sem", body.lead_semantic);
    checks($("cov-mops"), "cov-mop", body.mops);
    fillPresets();
    applyPreset("");
  }

  async function boot() {
    if (STATE.booted) return;
    STATE.booted = true;
    try {
      bindShell();
    } catch (err) {
      showMsg("Форма проработки не собралась: " + ((err && err.message) || err), false);
      return;
    }
    try {
      if (!window.rtlFetch) throw new Error("нет rtlFetch — обновите страницу");
      const res = await window.rtlFetch("api/coverage/meta");
      const body = await res.json();
      if (!res.ok || body.ok === false) {
        throw new Error((body && body.error) || ("meta HTTP " + res.status));
      }
      fillMeta(body);
    } catch (err) {
      showMsg("Фильтры не загрузились: " + ((err && err.message) || err), false);
      ["cov-mops", "cov-rfm", "cov-work", "cov-type", "cov-dir", "cov-lead-sem"].forEach(function (id) {
        const el = $(id);
        if (el && !el.innerHTML) el.innerHTML = "<p class='empty'>Не загрузилось</p>";
      });
    }
  }

  function start() {
    const ready = window.rtlReady || Promise.resolve();
    ready.then(boot).catch(function (err) {
      showMsg("Проработка: " + ((err && err.message) || err), false);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
