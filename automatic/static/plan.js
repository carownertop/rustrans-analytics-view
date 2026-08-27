(function () {
  const STATE = {
    rows: [],
    summary: null,
    view: [],
    sortKey: "priority",
    sortDir: 1,
    planFilter: "all",
    revenueBuckets: [],
    search: "",
    colWidths: {},
    colFilters: {},
    openFilter: null,
    expanded: {},
  };

  const COLS = [
    { key: "gk", title: "ГК" },
    { key: "name", title: "Клиент" },
    { key: "manager", title: "МОП" },
    { key: "priority", title: "Приоритет" },
    { key: "rfm", title: "RFM" },
    { key: "lifecycle", title: "Жизн. цикл" },
    { key: "days_since_buy", title: "Дней без покупки" },
    { key: "median_interval", title: "Мед. интервал" },
    { key: "avg_check", title: "Ср. чек" },
    { key: "days_in_base", title: "Дней в базе" },
    { key: "revenue", title: "Выручка" },
    { key: "stock_hits", title: "На складе" },
    { key: "brands", title: "Бренды" },
    { key: "top_bought", title: "Топ товара" },
    { key: "offers", title: "Что предложить" },
  ];
  const COL_DEFAULT_W = {
    gk: 56, name: 220, manager: 140, priority: 110, rfm: 110, lifecycle: 120,
    days_since_buy: 90, median_interval: 90, avg_check: 100, days_in_base: 90,
    revenue: 110, stock_hits: 80, brands: 140, top_bought: 260, offers: 280,
  };
  const MULTI_FILTER_COLS = { brands: true };
  const PRIO_RANK = { "1. Горячие": 0, "2. Новые": 1, "3. Задержались": 2, "4. Спящие": 3 };

  function $(id) { return document.getElementById(id); }
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
    const msg = $("plan-msg");
    if (!msg) return;
    msg.textContent = text || "";
    msg.className = text ? ("msg show " + (ok ? "ok" : "err")) : "msg";
  }
  function money(v) {
    if (v == null || v === "") return "—";
    const n = Number(v);
    if (!isFinite(n)) return "—";
    return Math.round(n).toLocaleString("ru-RU") + " ₽";
  }
  function num(v) {
    if (v == null || v === "") return "—";
    return String(v);
  }
  function blockHtml(text) {
    const raw = String(text || "—");
    return escapeHtml(raw).replace(/\n/g, "<br>");
  }
  function selectedManagers() {
    return Array.prototype.slice.call(document.querySelectorAll("input[name=mop]:checked"))
      .map(function (el) { return el.value; });
  }
  function colFilterActive(key) {
    return Object.prototype.hasOwnProperty.call(STATE.colFilters, key);
  }
  function splitTokens(text) {
    return String(text || "").split(",").map(function (s) { return s.trim(); })
      .filter(function (s) { return s && s !== "—"; });
  }
  function cellFilterText(row, key) {
    if (key === "gk") return String(row.members_count || 1);
    if (key === "avg_check") return row.avg_check == null ? "—" : money(row.avg_check);
    if (key === "revenue") return money(row.revenue);
    if (key === "with_stock" || key === "stock_hits") {
      return row.with_stock || (row.stock_hits || 0) > 0 ? "да" : "нет";
    }
    if (key === "days_since_buy" || key === "median_interval" || key === "days_in_base" || key === "stock_hits") {
      return row[key] == null || row[key] === "" ? "—" : String(row[key]);
    }
    if (key === "brands") return String(row.brands || "—");
    if (key === "top_bought") return String(row.top_bought || "—");
    if (key === "offers") return String(row.offers || "—");
    const raw = row[key];
    return String(raw == null || raw === "" ? "—" : raw);
  }
  function rowMatchesColFilter(row, key, allowed) {
    if (!allowed.length) return false;
    if (MULTI_FILTER_COLS[key]) {
      const tokens = splitTokens(row.brands);
      if (!tokens.length) return false;
      return allowed.some(function (v) { return tokens.indexOf(v) >= 0; });
    }
    return allowed.indexOf(cellFilterText(row, key)) >= 0;
  }
  function matchesPlanFilter(row) {
    const f = STATE.planFilter;
    if (f === "all") return true;
    if (f === "with_stock") return !!row.with_stock;
    if (f === "without") return !row.with_stock;
    if (f === "hot") return row.priority === "1. Горячие";
    if (f === "new") return row.priority === "2. Новые";
    if (f === "delayed") return row.priority === "3. Задержались";
    if (f === "sleep") return row.priority === "4. Спящие";
    return true;
  }
  function matchesRevenueFilter(row) {
    if (!STATE.revenueBuckets.length) return true;
    return STATE.revenueBuckets.indexOf(row.revenue_bucket) >= 0;
  }
  function sortValue(row, key) {
    if (key === "gk") return row.members_count || 1;
    if (key === "priority") return PRIO_RANK[row.priority] != null ? PRIO_RANK[row.priority] : 9;
    if (key === "avg_check" || key === "revenue" || key === "days_since_buy" ||
        key === "median_interval" || key === "days_in_base" || key === "stock_hits") {
      const n = Number(row[key]);
      return isFinite(n) ? n : -1;
    }
    return String(row[key] == null ? "" : row[key]).toLowerCase();
  }
  function baseFilteredRows() {
    const q = (STATE.search || "").trim().toLowerCase();
    let rows = STATE.rows.slice().filter(matchesPlanFilter).filter(matchesRevenueFilter);
    if (q) {
      rows = rows.filter(function (r) {
        const members = (r.members || []).map(function (m) { return m.name; }).join(" ");
        return [r.name, r.manager, r.priority, r.rfm, r.lifecycle, r.brands,
          r.top_bought, r.offers, members].join(" ").toLowerCase().indexOf(q) >= 0;
      });
    }
    return rows;
  }
  function applyColFilters(rows, skipKey) {
    return rows.filter(function (r) {
      for (let i = 0; i < COLS.length; i++) {
        const key = COLS[i].key;
        if (skipKey && key === skipKey) continue;
        if (!colFilterActive(key)) continue;
        if (!rowMatchesColFilter(r, key, STATE.colFilters[key] || [])) return false;
      }
      return true;
    });
  }
  function uniqueColValues(key) {
    const rows = applyColFilters(baseFilteredRows(), key);
    if (MULTI_FILTER_COLS[key]) {
      const seen = {};
      const out = [];
      rows.forEach(function (r) {
        splitTokens(r.brands).forEach(function (v) {
          if (seen[v]) return;
          seen[v] = true;
          out.push(v);
        });
      });
      return out.sort(function (a, b) { return String(a).localeCompare(String(b), "ru"); });
    }
    const seen = {};
    const out = [];
    rows.forEach(function (r) {
      const v = cellFilterText(r, key);
      if (seen[v]) return;
      seen[v] = true;
      out.push(v);
    });
    out.sort(function (a, b) { return String(a).localeCompare(String(b), "ru", { numeric: true }); });
    return out;
  }
  function visibleRows() {
    let rows = applyColFilters(baseFilteredRows());
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
  function hasColFilters() {
    return Object.keys(STATE.colFilters).some(function (k) { return colFilterActive(k); });
  }
  function closeColFilter() {
    STATE.openFilter = null;
    const pop = $("plan-col-filter-pop");
    if (pop) pop.hidden = true;
  }
  function openColFilter(key, anchor) {
    let pop = $("plan-col-filter-pop");
    if (!pop) {
      pop = document.createElement("div");
      pop.id = "plan-col-filter-pop";
      pop.className = "cov-col-filter-pop";
      document.body.appendChild(pop);
    }
    STATE.openFilter = key;
    const values = uniqueColValues(key);
    const hasFilter = colFilterActive(key);
    const selected = hasFilter ? (STATE.colFilters[key] || []) : null;
    const allOn = !hasFilter;
    const set = {};
    (selected || []).forEach(function (v) { set[v] = true; });
    pop.hidden = false;
    pop.innerHTML =
      "<div class=\"cov-col-filter-head\">Фильтр: " + escapeHtml(
        (COLS.filter(function (c) { return c.key === key; })[0] || {}).title || key
      ) + "</div>" +
      "<input type=\"search\" class=\"cov-col-filter-q\" placeholder=\"Найти значение…\" />" +
      "<div class=\"cov-col-filter-actions\">" +
      "<button type=\"button\" data-act=\"all\">Выделить все</button>" +
      "<button type=\"button\" data-act=\"clear\">Снять все</button>" +
      "<button type=\"button\" data-act=\"none\">Сбросить</button>" +
      "<button type=\"button\" data-act=\"apply\" class=\"primary\">Ок</button></div>" +
      "<div class=\"cov-col-filter-list\">" +
      (values.length ? values.map(function (v) {
        const on = allOn || set[v];
        return "<label><input type=\"checkbox\" value=\"" + escapeHtml(v) + "\"" +
          (on ? " checked" : "") + " /> <span>" + escapeHtml(v) + "</span></label>";
      }).join("") : "<p class=\"hint\" style=\"margin:8px\">Нет значений</p>") +
      "</div>";
    const rect = anchor.getBoundingClientRect();
    const width = 280;
    let left = rect.left;
    if (left + width > window.innerWidth - 12) left = Math.max(12, window.innerWidth - width - 12);
    pop.style.left = left + "px";
    pop.style.top = Math.min(rect.bottom + 6, window.innerHeight - 320) + "px";
    const q = pop.querySelector(".cov-col-filter-q");
    if (q) {
      q.addEventListener("input", function () {
        const needle = q.value.trim().toLowerCase();
        pop.querySelectorAll(".cov-col-filter-list label").forEach(function (lab) {
          const text = (lab.textContent || "").toLowerCase();
          lab.style.display = !needle || text.indexOf(needle) >= 0 ? "" : "none";
        });
      });
      setTimeout(function () { q.focus(); }, 0);
    }
    pop.onclick = function (e) {
      e.stopPropagation();
      const btn = e.target.closest ? e.target.closest("[data-act]") : null;
      if (!btn) return;
      const act = btn.getAttribute("data-act");
      if (act === "all") {
        pop.querySelectorAll(".cov-col-filter-list input").forEach(function (el) {
          if (el.closest("label").style.display === "none") return;
          el.checked = true;
        });
        return;
      }
      if (act === "clear") {
        pop.querySelectorAll(".cov-col-filter-list input").forEach(function (el) { el.checked = false; });
        return;
      }
      if (act === "none") {
        delete STATE.colFilters[key];
        closeColFilter();
        paintTable();
        return;
      }
      if (act === "apply") {
        const picked = Array.prototype.slice.call(pop.querySelectorAll(".cov-col-filter-list input:checked"))
          .map(function (el) { return el.value; });
        if (!picked.length) STATE.colFilters[key] = [];
        else if (picked.length === values.length) delete STATE.colFilters[key];
        else STATE.colFilters[key] = picked;
        closeColFilter();
        paintTable();
      }
    };
  }
  function syncChips() {
    document.querySelectorAll("#plan-chips .cov-chip").forEach(function (btn) {
      btn.classList.toggle("on", btn.getAttribute("data-plan") === STATE.planFilter);
    });
  }
  function syncRevChips() {
    const set = {};
    STATE.revenueBuckets.forEach(function (id) { set[id] = true; });
    document.querySelectorAll("#plan-rev-chips .cov-chip").forEach(function (btn) {
      const id = btn.getAttribute("data-rev");
      btn.classList.toggle("on", !!set[id]);
    });
  }
  function renderSummary(summary) {
    const box = $("plan-summary");
    if (!box) return;
    summary = summary || {};
    const items = [
      ["all", "В срезе", summary.total],
      ["with_stock", "На складе", summary.with_stock],
      ["without", "Без совпадения", summary.without],
      ["groups", "Групп ГК", summary.groups],
    ];
    box.innerHTML = items.map(function (item) {
      const clickable = item[0] !== "groups";
      const on = clickable && ((item[0] === "all" && STATE.planFilter === "all") || item[0] === STATE.planFilter);
      return "<div class=\"cov-kpi" + (on ? " on" : "") + "\" data-plan=\"" +
        (clickable ? item[0] : "") + "\"><span>" + item[1] + "</span><b>" + (item[2] == null ? 0 : item[2]) + "</b></div>";
    }).join("");
    box.querySelectorAll(".cov-kpi[data-plan]").forEach(function (el) {
      if (!el.getAttribute("data-plan")) return;
      el.addEventListener("click", function () {
        STATE.planFilter = el.getAttribute("data-plan");
        syncChips();
        paintTable();
        renderSummary(STATE.summary);
      });
    });
  }
  function prioBadge(priority) {
    const cls = priority && priority.indexOf("Горячие") >= 0 ? "ok"
      : priority && priority.indexOf("Новые") >= 0 ? ""
      : priority && priority.indexOf("Спящие") >= 0 ? "bad" : "mail";
    return "<span class=\"cov-badge " + cls + "\">" + escapeHtml(priority || "—") + "</span>";
  }
  function membersHtml(row) {
    const members = row.members || [];
    if (members.length <= 1) return "";
    return "<tr class=\"plan-members\"><td colspan=\"" + COLS.length + "\">" +
      "<div class=\"plan-members-list\">" + members.map(function (m) {
        return "<div class=\"plan-member" + (m.is_head ? " head" : "") + "\">" +
          "<strong>" + escapeHtml(m.name || "") + "</strong>" +
          (m.in_plan ? "" : " <span class=\"hint\">нет в плане МОПа</span>") +
          "<span class=\"hint\"> · ср.чек " + money(m.avg_check) +
          " · в базе " + num(m.days_in_base) +
          " · выручка " + money(m.revenue) + "</span></div>";
      }).join("") + "</div></td></tr>";
  }
  function paintTable() {
    STATE.view = visibleRows();
    const meta = $("plan-view-meta");
    if (meta) {
      const filt = hasColFilters() ? " · есть фильтры по столбцам" : "";
      meta.textContent = "На экране " + STATE.view.length + " из " + STATE.rows.length +
        filt + ". «Сформировать файл» — Excel видимого среза.";
    }
    const clearBtn = $("plan-clear-col-filters");
    if (clearBtn) clearBtn.hidden = !hasColFilters();
    const table = $("plan-table");
    if (!table) return;
    if (!STATE.rows.length) {
      table.innerHTML = "<p class='empty'>Нет строк.</p>";
      return;
    }
    function arrow(key) {
      if (STATE.sortKey !== key) return "";
      return STATE.sortDir > 0 ? " ↑" : " ↓";
    }
    function colStyle(key) {
      const w = STATE.colWidths[key] || COL_DEFAULT_W[key] || 120;
      return "width:" + w + "px;min-width:" + w + "px;max-width:" + w + "px";
    }
    const bodyHtml = STATE.view.length
      ? STATE.view.map(function (row) {
          const open = !!STATE.expanded[row.id];
          const canExpand = (row.members_count || 1) > 1;
          const gk = canExpand
            ? "<button type=\"button\" class=\"plan-exp\" data-id=\"" + escapeHtml(row.id) + "\">" +
              (open ? "−" : "+") + " " + (row.members_count || 1) + "</button>"
            : String(row.members_count || 1);
          return "<tr class=\"cov-row\">" +
            "<td style=\"" + colStyle("gk") + "\">" + gk + "</td>" +
            "<td style=\"" + colStyle("name") + "\">" + escapeHtml(row.name || "—") + "</td>" +
            "<td style=\"" + colStyle("manager") + "\">" + escapeHtml(row.manager || "—") + "</td>" +
            "<td style=\"" + colStyle("priority") + "\">" + prioBadge(row.priority) + "</td>" +
            "<td style=\"" + colStyle("rfm") + "\">" + escapeHtml(row.rfm || "—") + "</td>" +
            "<td style=\"" + colStyle("lifecycle") + "\">" + escapeHtml(row.lifecycle || "—") + "</td>" +
            "<td style=\"" + colStyle("days_since_buy") + "\">" + num(row.days_since_buy) + "</td>" +
            "<td style=\"" + colStyle("median_interval") + "\">" + num(row.median_interval) + "</td>" +
            "<td style=\"" + colStyle("avg_check") + "\">" + money(row.avg_check) + "</td>" +
            "<td style=\"" + colStyle("days_in_base") + "\">" + num(row.days_in_base) + "</td>" +
            "<td style=\"" + colStyle("revenue") + "\">" + money(row.revenue) + "</td>" +
            "<td style=\"" + colStyle("stock_hits") + "\">" + num(row.stock_hits) + "</td>" +
            "<td style=\"" + colStyle("brands") + "\">" + escapeHtml(row.brands || "—") + "</td>" +
            "<td class=\"cov-subject\" style=\"" + colStyle("top_bought") + "\">" + blockHtml(row.top_bought) + "</td>" +
            "<td class=\"cov-subject\" style=\"" + colStyle("offers") + "\">" + blockHtml(row.offers) + "</td>" +
            "</tr>" + (open ? membersHtml(row) : "");
        }).join("")
      : "<tr><td colspan=\"" + COLS.length + "\" class=\"empty\">Нет строк под текущий поиск и фильтры.</td></tr>";
    table.innerHTML =
      "<div class=\"table-wrap cov-wrap\"><table class=\"flat cov-grid\"><thead><tr>" +
      COLS.map(function (c) {
        const active = colFilterActive(c.key);
        return "<th data-sort=\"" + c.key + "\" style=\"" + colStyle(c.key) + "\">" +
          "<span class=\"cov-th-main\">" +
          "<span class=\"cov-th-title\">" + escapeHtml(c.title) + arrow(c.key) + "</span>" +
          "<button type=\"button\" class=\"cov-th-filter" + (active ? " on" : "") +
          "\" data-filter=\"" + c.key + "\" title=\"Фильтр по значениям\">▾</button>" +
          "</span></th>";
      }).join("") +
      "</tr></thead><tbody>" + bodyHtml + "</tbody></table></div>";

    table.querySelectorAll("th[data-sort]").forEach(function (th) {
      th.addEventListener("click", function (e) {
        if (e.target.closest && e.target.closest(".cov-th-filter")) return;
        const key = th.getAttribute("data-sort");
        if (STATE.sortKey === key) STATE.sortDir *= -1;
        else {
          STATE.sortKey = key;
          STATE.sortDir = key === "priority" || key === "name" ? 1 : -1;
        }
        paintTable();
      });
    });
    table.querySelectorAll(".cov-th-filter").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        const key = btn.getAttribute("data-filter");
        if (STATE.openFilter === key) closeColFilter();
        else openColFilter(key, btn);
      });
    });
    table.querySelectorAll(".plan-exp").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const id = btn.getAttribute("data-id");
        STATE.expanded[id] = !STATE.expanded[id];
        paintTable();
      });
    });
  }
  function showResult(rows, summary) {
    STATE.rows = rows || [];
    STATE.summary = summary || {};
    STATE.planFilter = "all";
    STATE.revenueBuckets = [];
    STATE.search = "";
    STATE.colFilters = {};
    STATE.expanded = {};
    closeColFilter();
    const search = $("plan-search");
    if (search) search.value = "";
    syncChips();
    syncRevChips();
    const result = must("plan-result");
    result.hidden = false;
    renderSummary(STATE.summary);
    paintTable();
    result.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function buildTable() {
    const btn = must("plan-btn");
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Сборка…";
    showMsg("", true);
    try {
      const res = await window.rtlFetch("api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          managers: selectedManagers(),
          report_date: ($("plan-date") && $("plan-date").value) || null,
        }),
      });
      const raw = await res.text();
      let body = null;
      try { body = raw ? JSON.parse(raw) : null; } catch (err) {
        showMsg("Сервер вернул ошибку (не JSON). Код " + res.status + ".", false);
        return;
      }
      if (!body || !body.ok) {
        showMsg((body && body.error) || ("Не собралось (код " + res.status + ")"), false);
        return;
      }
      showResult(body.rows || [], body.summary || {});
      showMsg("Таблица готова: " + ((body.summary && body.summary.total) || 0) + " строк. При необходимости сформируйте Excel.", true);
    } catch (err) {
      showMsg((err && err.message) || "Сервер не отвечает.", false);
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }
  async function exportXlsx() {
    if (!STATE.view.length) {
      showMsg("Нет видимых строк для Excel.", false);
      return;
    }
    const btn = must("plan-xlsx");
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Файл…";
    try {
      const summary = Object.assign({}, STATE.summary || {}, {
        total: STATE.view.length,
        with_stock: STATE.view.filter(function (r) { return r.with_stock; }).length,
        without: STATE.view.filter(function (r) { return !r.with_stock; }).length,
        groups: STATE.view.filter(function (r) { return (r.members_count || 1) > 1; }).length,
      });
      const res = await window.rtlFetch("api/plan/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: STATE.view, summary: summary }),
      });
      const body = await res.json();
      if (!body.ok) {
        showMsg(body.error || "Не удалось сформировать файл", false);
        return;
      }
      showMsg("Excel готов: " + ((body.file && body.file.name) || ""), true);
      if (typeof window.loadState === "function") await window.loadState();
    } catch (err) {
      showMsg((err && err.message) || "Сервер не отвечает.", false);
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }
  function bind() {
    if (!$("plan-btn")) return;
    must("plan-btn").addEventListener("click", buildTable);
    const xlsx = $("plan-xlsx");
    if (xlsx) xlsx.addEventListener("click", exportXlsx);
    const search = $("plan-search");
    if (search) {
      search.addEventListener("input", function () {
        STATE.search = search.value || "";
        paintTable();
      });
    }
    document.querySelectorAll("#plan-chips .cov-chip").forEach(function (btn) {
      btn.addEventListener("click", function () {
        STATE.planFilter = btn.getAttribute("data-plan") || "all";
        syncChips();
        paintTable();
        renderSummary(STATE.summary);
      });
    });
    document.querySelectorAll("#plan-rev-chips .cov-chip").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const id = btn.getAttribute("data-rev");
        if (!id) return;
        const idx = STATE.revenueBuckets.indexOf(id);
        if (idx >= 0) STATE.revenueBuckets.splice(idx, 1);
        else STATE.revenueBuckets.push(id);
        syncRevChips();
        paintTable();
      });
    });
    const clearBtn = $("plan-clear-col-filters");
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        STATE.colFilters = {};
        closeColFilter();
        paintTable();
      });
    }
    document.addEventListener("click", function (e) {
      const pop = $("plan-col-filter-pop");
      if (!pop || pop.hidden) return;
      if (!(e.target.closest && (e.target.closest("#plan-col-filter-pop") || e.target.closest(".cov-th-filter")))) {
        closeColFilter();
      }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
