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
    colWidths: {},
    colFilters: {},
    openFilter: null,
    booted: false,
  };

  const COLS = [
    { key: "name", title: "Карточка" },
    { key: "mop", title: "Отв. за компанию" },
    { key: "rfm", title: "RFM" },
    { key: "coverage_title", title: "Проработка" },
    { key: "last_kind", title: "Тип" },
    { key: "last_subject", title: "Тема / суть" },
    { key: "events_count", title: "Дел" },
    { key: "has_planned", title: "План" },
    { key: "has_overdue", title: "Просроч." },
    { key: "has_deal", title: "Сделка" },
    { key: "deal_links", title: "Открытые сделки" },
    { key: "has_sp", title: "СП" },
    { key: "sp_links", title: "Открытые СП" },
  ];
  const COL_DEFAULT_W = {
    name: 220, mop: 140, rfm: 90, coverage_title: 120, last_kind: 140,
    last_subject: 220, events_count: 64, has_planned: 64, has_overdue: 72,
    has_deal: 72, deal_links: 160, has_sp: 56, sp_links: 160,
  };

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
      const meta = item.cards != null ? " <span class=\"meta\">· " + item.cards + "</span>" : "";
      return "<label><input type=\"checkbox\" name=\"" + name + "\" value=\"" +
        escapeHtml(item.id) + "\"" + (on ? " checked" : "") + " /> " +
        escapeHtml(item.title) + meta + "</label>";
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
  function cardMopCopy(universe) {
    if (universe === "lead") {
      return {
        label: "Ответственный за лид",
        hint: "Кого берём в срез лидов (ASSIGNED лида).",
        col: "Отв. за лид",
        detail: "Отв. за лид",
      };
    }
    if (universe === "contact") {
      return {
        label: "Ответственный за контакт",
        hint: "Кого берём в срез контактов (ASSIGNED контакта).",
        col: "Отв. за контакт",
        detail: "Отв. за контакт",
      };
    }
    return {
      label: "Ответственный за компанию",
      hint: "Кого берём в срез компаний (ASSIGNED компании).",
      col: "Отв. за компанию",
      detail: "Отв. за компанию",
    };
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
    const copy = cardMopCopy(STATE.universe);
    const label = $("cov-card-mop-label");
    const hint = $("cov-card-mop-hint");
    if (label) label.textContent = copy.label;
    if (hint) hint.textContent = copy.hint;
    const mopCol = COLS.filter(function (c) { return c.key === "mop"; })[0];
    if (mopCol) mopCol.title = copy.col;
    fillPresets();
  }
  function applyPreset(id) {
    const enums = (STATE.meta && STATE.meta.enums) || {};
    if (!id) {
      checkAll("cov-company-mop", true);
      checkAll("cov-other-mop", true);
      checkAll("cov-activity-mop", true);
      checkAll("cov-planned", true);
      checkAll("cov-rfm", true);
      checkAll("cov-work", true);
      checkAll("cov-type", true);
      checkAll("cov-dir", true);
      checkAll("cov-lead-sem", true);
      return;
    }
    if (id === "rfm_work") {
      setUniverse("company");
      checkAll("cov-company-mop", true);
      checkAll("cov-other-mop", true);
      checkAll("cov-activity-mop", true);
      checkAll("cov-planned", true);
      checkAll("cov-work", true);
      checkAll("cov-type", true);
      checkAll("cov-dir", true);
      setChecks("cov-rfm", (enums.rfm || []).map(function (x) { return x.id; })
        .filter(function (x) { return x !== "8538" && x !== "9026"; }));
    } else if (id === "no_purchases") {
      setUniverse("company");
      checkAll("cov-company-mop", true);
      checkAll("cov-other-mop", true);
      checkAll("cov-activity-mop", true);
      checkAll("cov-planned", true);
      checkAll("cov-work", true);
      checkAll("cov-type", true);
      checkAll("cov-dir", true);
      setChecks("cov-rfm", ["9026"]);
    } else if (id === "leads_open") {
      setUniverse("lead");
      checkAll("cov-company-mop", true);
      checkAll("cov-other-mop", true);
      checkAll("cov-activity-mop", true);
      checkAll("cov-planned", true);
      setChecks("cov-lead-sem", ["P"]);
    } else if (id === "contacts_solo") {
      setUniverse("contact");
      checkAll("cov-company-mop", true);
      checkAll("cov-other-mop", true);
      checkAll("cov-activity-mop", true);
      checkAll("cov-planned", true);
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
      mop_ids: selected("cov-company-mop"),
      other_assignee_ids: selected("cov-other-mop"),
      activity_mop_ids: selected("cov-activity-mop"),
      planned: selected("cov-planned"),
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
    if (key === "has_deal" || key === "has_sp" || key === "has_planned" || key === "has_overdue") return row[key] ? 1 : 0;
    if (key === "deal_links" || key === "sp_links") return (row[key] || []).length;
    if (key === "events_count") return row.events_count || (row.events || []).length || 0;
    if (key === "last_kind") return ((row.last_kind || "") + " " + (row.last_at || "")).toLowerCase();
    return String(row[key] == null ? "" : row[key]).toLowerCase();
  }
  function cellFilterText(row, key) {
    if (key === "has_deal" || key === "has_sp" || key === "has_planned" || key === "has_overdue") {
      return row[key] ? "да" : "нет";
    }
    if (key === "deal_links" || key === "sp_links") {
      const list = row[key] || [];
      if (!list.length) return "нет";
      return list.map(function (l) { return l.title || l.id; }).join("; ");
    }
    if (key === "events_count") {
      return String(row.events_count || (row.events || []).length || 0);
    }
    if (key === "last_kind") {
      return ((row.last_kind || "—") + (row.last_at ? " · " + row.last_at : "")).trim();
    }
    if (key === "last_subject") {
      return String(row.last_subject || row.last_text || "—");
    }
    if (key === "coverage_title") return String(row.coverage_title || "");
    const raw = row[key];
    const text = String(raw == null || raw === "" ? "—" : raw);
    return text;
  }
  function hasColFilters() {
    return Object.keys(STATE.colFilters).some(function (k) {
      return STATE.colFilters[k] && STATE.colFilters[k].length;
    });
  }
  function baseFilteredRows() {
    const q = (STATE.search || "").trim().toLowerCase();
    let rows = STATE.rows.slice();
    if (STATE.covFilter !== "all") {
      rows = rows.filter(function (r) { return r.coverage === STATE.covFilter; });
    }
    if (q) {
      rows = rows.filter(function (r) {
        const eventBlob = (r.events || []).map(function (e) {
          return [e.label, e.subject, e.text, e.mop, e.author, e.duration, e.call_status].join(" ");
        }).join(" ");
        return [r.name, r.mop, r.rfm, r.work_status, r.client_type, r.direction,
          r.coverage_title, r.last_kind, r.last_subject, r.last_text, eventBlob]
          .join(" ").toLowerCase().indexOf(q) >= 0;
      });
    }
    return rows;
  }
  function applyColFilters(rows, skipKey) {
    return rows.filter(function (r) {
      for (let i = 0; i < COLS.length; i++) {
        const key = COLS[i].key;
        if (skipKey && key === skipKey) continue;
        const allowed = STATE.colFilters[key];
        if (!allowed || !allowed.length) continue;
        if (allowed.indexOf(cellFilterText(r, key)) < 0) return false;
      }
      return true;
    });
  }
  function uniqueColValues(key) {
    const rows = applyColFilters(baseFilteredRows(), key);
    const seen = {};
    const out = [];
    rows.forEach(function (r) {
      const v = cellFilterText(r, key);
      if (seen[v]) return;
      seen[v] = true;
      out.push(v);
    });
    out.sort(function (a, b) {
      return String(a).localeCompare(String(b), "ru", { numeric: true });
    });
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
  function closeColFilter() {
    STATE.openFilter = null;
    const pop = $("cov-col-filter-pop");
    if (pop) pop.hidden = true;
  }
  function openColFilter(key, anchor) {
    let pop = $("cov-col-filter-pop");
    if (!pop) {
      pop = document.createElement("div");
      pop.id = "cov-col-filter-pop";
      pop.className = "cov-col-filter-pop";
      document.body.appendChild(pop);
    }
    STATE.openFilter = key;
    const values = uniqueColValues(key);
    const selected = STATE.colFilters[key];
    const allOn = !selected || !selected.length;
    const set = {};
    (selected || []).forEach(function (v) { set[v] = true; });
    pop.hidden = false;
    pop.innerHTML =
      "<div class=\"cov-col-filter-head\">Фильтр: " + escapeHtml(
        (COLS.filter(function (c) { return c.key === key; })[0] || {}).title || key
      ) + "</div>" +
      "<input type=\"search\" class=\"cov-col-filter-q\" placeholder=\"Найти значение…\" />" +
      "<div class=\"cov-col-filter-actions\">" +
      "<button type=\"button\" data-act=\"all\">Все</button>" +
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
      if (act === "none") {
        delete STATE.colFilters[key];
        closeColFilter();
        paintTable();
        return;
      }
      if (act === "apply") {
        const picked = Array.prototype.slice.call(pop.querySelectorAll(".cov-col-filter-list input:checked"))
          .map(function (el) { return el.value; });
        if (!picked.length || picked.length === values.length) delete STATE.colFilters[key];
        else STATE.colFilters[key] = picked;
        closeColFilter();
        paintTable();
      }
    };
  }
  function bindColResize(tableRoot) {
    tableRoot.querySelectorAll(".cov-col-resize").forEach(function (handle) {
      handle.addEventListener("mousedown", function (e) {
        e.preventDefault();
        e.stopPropagation();
        const key = handle.getAttribute("data-resize");
        const th = handle.closest("th");
        if (!th || !key) return;
        const startX = e.clientX;
        const startW = th.getBoundingClientRect().width;
        function onMove(ev) {
          const w = Math.max(56, Math.round(startW + (ev.clientX - startX)));
          STATE.colWidths[key] = w;
          th.style.width = w + "px";
          th.style.minWidth = w + "px";
          th.style.maxWidth = w + "px";
          const idx = COLS.findIndex(function (c) { return c.key === key; });
          if (idx < 0) return;
          tableRoot.querySelectorAll("tbody tr").forEach(function (tr) {
            const td = tr.children[idx];
            if (!td) return;
            td.style.width = w + "px";
            td.style.maxWidth = w + "px";
          });
        }
        function onUp() {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          document.body.classList.remove("cov-resizing");
        }
        document.body.classList.add("cov-resizing");
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
    });
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
      panel.innerHTML = "<p class=\"hint\" style=\"margin:0\">Кликните строку в таблице ниже — здесь откроется полный список дел, звонков и описаний за период.</p>";
      return;
    }
    const events = row.events || [];
    const timeline = events.length
      ? "<div class=\"cov-timeline\">" + events.map(function (ev) {
          const head = escapeHtml(ev.label || ev.kind || "Событие") +
            (ev.at ? " · " + escapeHtml(ev.at) : "");
          const people = [];
          if (ev.mop) people.push("Ответственный: " + escapeHtml(ev.mop));
          if (ev.author) people.push("Создал: " + escapeHtml(ev.author));
          if (ev.duration) people.push("Длительность: " + escapeHtml(ev.duration));
          if (ev.call_status) {
            const stCls = ev.call_status_id === "ok" ? "ok"
              : ev.call_status_id === "missed" ? "bad"
              : ev.call_status_id === "short" ? "mail" : "";
            people.push("Статус: <span class=\"cov-call-st " + stCls + "\">" +
              escapeHtml(ev.call_status) + "</span>");
          }
          const meta = people.length
            ? "<div class=\"cov-event-meta\">" + people.join(" · ") + "</div>"
            : "";
          const title = ev.url
            ? "<a class=\"file-link\" href=\"" + escapeHtml(ev.url) +
              "\" target=\"_blank\" rel=\"noopener\">" + escapeHtml(ev.subject || "Без темы") + "</a>"
            : escapeHtml(ev.subject || "Без темы");
          const body = ev.text
            ? "<div class=\"cov-quote\">" + escapeHtml(ev.text) + "</div>"
            : "<p class=\"hint\" style=\"margin:4px 0 0\">Без описания в деле</p>";
          return "<div class=\"cov-event\"><div class=\"cov-event-head\">" + head +
            "</div>" + meta + "<div class=\"cov-event-title\">" + title + "</div>" + body + "</div>";
        }).join("") + "</div>"
      : "<p class=\"hint\" style=\"margin:8px 0 0\">В периоде нет дел/звонков/писем и нет открытых сделок/СП</p>";
    panel.innerHTML =
      "<div class=\"cov-detail-top\">" +
      "<h3><a class=\"file-link\" href=\"" + escapeHtml(row.url) +
      "\" target=\"_blank\" rel=\"noopener\">" + escapeHtml(row.name) + "</a></h3>" +
      "<span class=\"cov-detail-count\">" + (row.events_count || events.length) + " событий</span></div>" +
      "<div class=\"cov-detail-meta\">" +
      "<span>" + badge(row) + "</span>" +
      "<span>" + escapeHtml(cardMopCopy(row.universe || STATE.universe).detail) + ": " + escapeHtml(row.mop) + "</span>" +
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
      "<h4 class=\"cov-events-title\">Лента дел за период</h4>" + timeline;
  }
  function selectRow(row) {
    STATE.selected = row || null;
    paintTable();
    paintDetail(STATE.selected);
    const panel = $("cov-detail");
    if (panel && STATE.selected) {
      panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }
  function paintTable() {
    STATE.view = visibleRows();
    const meta = $("cov-view-meta");
    if (meta) {
      const filt = hasColFilters() ? " · есть фильтры по столбцам" : "";
      meta.textContent = "На экране " + STATE.view.length + " из " + STATE.rows.length +
        filt +
        ". Тяните край заголовка — ширина колонки. ▾ в заголовке — фильтр по значениям. «Сформировать файл» — Excel видимого среза.";
    }
    const clearBtn = $("cov-clear-col-filters");
    if (clearBtn) clearBtn.hidden = !hasColFilters();
    const table = $("cov-table");
    if (!table) return;
    if (!STATE.rows.length) {
      table.innerHTML = "<p class='empty'>Нет строк.</p>";
      if (!STATE.selected) paintDetail(null);
      return;
    }
    function arrow(key) {
      if (STATE.sortKey !== key && !(key === "coverage_title" && STATE.sortKey === "coverage")) return "";
      return STATE.sortDir > 0 ? " ↑" : " ↓";
    }
    function colStyle(key) {
      const w = STATE.colWidths[key] || COL_DEFAULT_W[key] || 120;
      return "width:" + w + "px;min-width:" + w + "px;max-width:" + w + "px";
    }
    const bodyHtml = STATE.view.length
      ? STATE.view.map(function (row, i) {
          const on = STATE.selected && STATE.selected.id === row.id ? " on" : "";
          const subject = row.last_subject || row.last_text || "—";
          const short = subject.length > 70 ? subject.slice(0, 69) + "…" : subject;
          const n = row.events_count || (row.events || []).length || 0;
          return "<tr class=\"cov-row" + on + "\" data-i=\"" + i + "\">" +
            "<td style=\"" + colStyle("name") + "\"><a class=\"file-link\" href=\"" + escapeHtml(row.url) +
            "\" target=\"_blank\" rel=\"noopener\">" + escapeHtml(row.name) + "</a></td>" +
            "<td style=\"" + colStyle("mop") + "\">" + escapeHtml(row.mop) + "</td>" +
            "<td style=\"" + colStyle("rfm") + "\">" + escapeHtml(row.rfm) + "</td>" +
            "<td style=\"" + colStyle("coverage_title") + "\">" + badge(row) + "</td>" +
            "<td style=\"" + colStyle("last_kind") + "\">" + escapeHtml(row.last_kind || "—") +
            (row.last_at ? " · " + escapeHtml(row.last_at) : "") + "</td>" +
            "<td class=\"cov-subject\" style=\"" + colStyle("last_subject") + "\" title=\"" + escapeHtml(subject) + "\">" +
            escapeHtml(short) + "</td>" +
            "<td style=\"" + colStyle("events_count") + "\"><button type=\"button\" class=\"cov-events-btn\" data-i=\"" +
            i + "\">" + n + " →</button></td>" +
            "<td style=\"" + colStyle("has_planned") + "\">" + (row.has_planned ? "да" : "") + "</td>" +
            "<td style=\"" + colStyle("has_overdue") + "\">" + (row.has_overdue ? "да" : "") + "</td>" +
            "<td style=\"" + colStyle("has_deal") + "\">" + (row.has_deal ? "да" : "") + "</td>" +
            "<td class=\"cov-links\" style=\"" + colStyle("deal_links") + "\">" + linkList(row.deal_links) + "</td>" +
            "<td style=\"" + colStyle("has_sp") + "\">" + (row.has_sp ? "да" : "") + "</td>" +
            "<td class=\"cov-links\" style=\"" + colStyle("sp_links") + "\">" + linkList(row.sp_links) + "</td></tr>";
        }).join("")
      : "<tr><td colspan=\"" + COLS.length + "\" class=\"empty\">Нет строк под текущий поиск и фильтры столбцов.</td></tr>";
    table.innerHTML =
      "<div class=\"table-wrap cov-wrap\"><table class=\"flat cov-grid\"><thead><tr>" +
      COLS.map(function (c) {
        const active = STATE.colFilters[c.key] && STATE.colFilters[c.key].length;
        return "<th data-sort=\"" + c.key + "\" style=\"" + colStyle(c.key) + "\">" +
          "<span class=\"cov-th-main\">" +
          "<span class=\"cov-th-title\">" + escapeHtml(c.title) + arrow(c.key) + "</span>" +
          "<button type=\"button\" class=\"cov-th-filter" + (active ? " on" : "") +
          "\" data-filter=\"" + c.key + "\" title=\"Фильтр по значениям\">▾</button>" +
          "</span>" +
          "<span class=\"cov-col-resize\" data-resize=\"" + c.key + "\" title=\"Тянуть ширину\"></span>" +
          "</th>";
      }).join("") +
      "</tr></thead><tbody>" + bodyHtml + "</tbody></table></div>";
    table.querySelectorAll("th[data-sort]").forEach(function (th) {
      th.addEventListener("click", function (e) {
        if (e.target.closest && (e.target.closest(".cov-th-filter") || e.target.closest(".cov-col-resize"))) return;
        const key = th.getAttribute("data-sort") === "coverage_title" ? "coverage" : th.getAttribute("data-sort");
        if (STATE.sortKey === key) STATE.sortDir *= -1;
        else {
          STATE.sortKey = key;
          STATE.sortDir = 1;
        }
        paintTable();
      });
    });
    table.querySelectorAll(".cov-th-filter").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        const key = btn.getAttribute("data-filter");
        if (STATE.openFilter === key) {
          closeColFilter();
          return;
        }
        openColFilter(key, btn);
      });
    });
    bindColResize(table);
    const tbody = table.querySelector("tbody");
    if (tbody) {
      tbody.addEventListener("click", function (e) {
        if (e.target.closest && e.target.closest("a")) return;
        const btn = e.target.closest ? e.target.closest(".cov-events-btn") : null;
        const tr = e.target.closest ? e.target.closest("tr.cov-row") : null;
        if (btn) {
          selectRow(STATE.view[Number(btn.getAttribute("data-i"))]);
          return;
        }
        if (!tr) return;
        selectRow(STATE.view[Number(tr.getAttribute("data-i"))]);
      });
    }
    if (STATE.selected) {
      const still = STATE.view.filter(function (r) { return r.id === STATE.selected.id; })[0];
      if (!still) {
        STATE.selected = null;
        paintDetail(null);
      }
    }
  }
  function showResult(rows, summary) {
    STATE.rows = rows || [];
    STATE.summary = summary || {};
    STATE.selected = null;
    STATE.covFilter = "all";
    STATE.search = "";
    STATE.colFilters = {};
    closeColFilter();
    const search = $("cov-search");
    if (search) search.value = "";
    syncChips();
    const result = must("cov-result");
    result.hidden = false;
    renderSummary(STATE.summary);
    paintDetail(null);
    paintTable();
    const detail = $("cov-detail");
    if (detail) detail.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function bindShell() {
    const bounds = monthBounds();
    must("cov-period-from").value = bounds.from;
    must("cov-period-to").value = bounds.to;
    if ($("cov-created-from")) $("cov-created-from").value = "";
    if ($("cov-created-to")) $("cov-created-to").value = "";

    document.querySelectorAll("#cov-universe .sub-pill").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setUniverse(btn.getAttribute("data-universe"));
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
    document.querySelectorAll(".cov-mini[data-check]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        checkAll(btn.getAttribute("data-check"), btn.getAttribute("data-on") === "1");
      });
    });
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
    const clearCols = $("cov-clear-col-filters");
    if (clearCols) {
      clearCols.addEventListener("click", function () {
        STATE.colFilters = {};
        closeColFilter();
        paintTable();
      });
    }
    document.addEventListener("click", function (e) {
      const pop = $("cov-col-filter-pop");
      if (!pop || pop.hidden) return;
      if (e.target.closest && (e.target.closest("#cov-col-filter-pop") || e.target.closest(".cov-th-filter"))) return;
      closeColFilter();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeColFilter();
    });
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
          " карточек. Лента дел — в блоке над таблицей.", true);
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
    checks($("cov-mops-company"), "cov-company-mop", body.mops);
    checks($("cov-mops-other"), "cov-other-mop", body.other_assignees || []);
    checks($("cov-mops-activity"), "cov-activity-mop", body.mops);
    checks($("cov-planned"), "cov-planned", body.planned_filters || []);
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
      ["cov-mops-company", "cov-mops-other", "cov-mops-activity", "cov-planned", "cov-rfm", "cov-work", "cov-type", "cov-dir", "cov-lead-sem"].forEach(function (id) {
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
