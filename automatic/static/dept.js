(function () {
  const STATE = { payload: null, fileName: "" };

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
    const msg = $("dept-msg");
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
  function mln(v) {
    if (v == null || v === "") return "—";
    const n = Number(v);
    if (!isFinite(n)) return "—";
    return (n / 1e6).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " млн";
  }
  function num(v) {
    if (v == null || v === "") return "—";
    return Number(v).toLocaleString("ru-RU");
  }
  function cell(v, cls) {
    return "<td" + (cls ? " class=\"" + cls + "\"" : "") + ">" + escapeHtml(v) + "</td>";
  }
  function moneyCell(v) {
    return "<td class=\"num\">" + escapeHtml(money(v)) + "</td>";
  }
  function tableHtml(headers, rows, emptyText) {
    if (!rows || !rows.length) {
      return "<p class=\"hint\" style=\"margin:0\">" + escapeHtml(emptyText || "Нет строк") + "</p>";
    }
    const head = headers.map(function (h) {
      return "<th" + (h.cls ? " class=\"" + h.cls + "\"" : "") + ">" + escapeHtml(h.title) + "</th>";
    }).join("");
    const body = rows.join("");
    return "<table class=\"flat\"><thead><tr>" + head + "</tr></thead><tbody>" + body + "</tbody></table>";
  }

  function paint(payload) {
    STATE.payload = payload;
    STATE.fileName = (payload.file && payload.file.name) || STATE.fileName || "";
    const dept = payload.dept || {};
    const total = dept.total || {};
    const current = dept.current || {};
    const neu = dept.new || {};
    const r1 = dept.r1 || {};
    const growth = dept.growth || {};
    const market = payload.market || {};
    const uplift = payload.uplift || {};

    must("dept-result").hidden = false;
    must("dept-summary").innerHTML = [
      ["Песс", total.pess],
      ["Реал", total.real],
      ["Опт", total.opt],
    ].map(function (item) {
      return "<div class=\"cov-kpi dept-kpi\"><span>" + item[0] + "</span><b>" +
        escapeHtml(mln(item[1])) + "</b></div>";
    }).join("");

    const bits = [
      "Месяц " + (payload.forecast_label || "—"),
      "покупателей " + num(payload.n_buyers),
      "склад " + (payload.stock_updated || "—"),
      "цены " + (payload.price_stamp || market.stamp || "—"),
    ];
    if (uplift.synced_at) bits.push("CRM " + uplift.synced_at);
    must("dept-meta").textContent = bits.join(" · ");

    const layers = [
      ["Текущие после склада", current],
      ["Новые после склада", neu],
      ["Р1 без двойного счёта", r1],
      ["Задел на рост", growth],
      ["Итого план", total],
    ];
    must("dept-layers").innerHTML = tableHtml(
      [{ title: "Слой" }, { title: "Песс", cls: "num" }, { title: "Реал", cls: "num" }, { title: "Опт", cls: "num" }],
      layers.map(function (row) {
        const v = row[1] || {};
        return "<tr>" + cell(row[0]) + moneyCell(v.pess) + moneyCell(v.real) + moneyCell(v.opt) + "</tr>";
      })
    );

    const inMarket = (dept.current_in_market || {}).real;
    const riskRows = [
      ["Текущие после склада", current.real],
      ["из них на рыночных позициях", inMarket],
      ["спрос не в рынке", market.demand_off_market],
      ["ёмкость склада в рынке", market.stock_in_market],
      ["ёмкость склада не в рынке", market.stock_off_market],
    ];
    const offGroups = (payload.stock || []).filter(function (row) {
      return Number(row.demand_off_market) > 0;
    }).sort(function (a, b) {
      return Number(b.demand_off_market) - Number(a.demand_off_market);
    }).slice(0, 20);
    let riskHtml = tableHtml(
      [{ title: "Риск" }, { title: "Сумма", cls: "num" }],
      riskRows.map(function (row) {
        return "<tr>" + cell(row[0]) + moneyCell(row[1]) + "</tr>";
      })
    );
    if (offGroups.length) {
      riskHtml += "<p class=\"hint\" style=\"margin:12px 0 6px\">Группы, где спрос не закрывается рыночным остатком</p>";
      riskHtml += tableHtml(
        [{ title: "Группа" }, { title: "Статус" }, { title: "Спрос", cls: "num" }, { title: "Не в рынке", cls: "num" }],
        offGroups.map(function (row) {
          return "<tr>" + cell(row.display || "—") + cell(row.market_status || "—") +
            moneyCell(row.demand_real) + moneyCell(row.demand_off_market) + "</tr>";
        })
      );
    }
    must("dept-risk").innerHTML = riskHtml;

    const r1Rows = payload.r1 || [];
    must("dept-r1").innerHTML = tableHtml(
      [{ title: "Покупатель" }, { title: "МОП" }, { title: "Р1", cls: "num" }, { title: "В план", cls: "num" }, { title: "Пересечение", cls: "num" }, { title: "Что" }],
      r1Rows.map(function (row) {
        const name = row.url
          ? "<a href=\"" + escapeHtml(row.url) + "\" target=\"_blank\" rel=\"noopener\">" + escapeHtml(row.buyer || "—") + "</a>"
          : escapeHtml(row.buyer || "—");
        return "<tr><td class=\"wrap\">" + name + "</td>" + cell(row.manager || "—") +
          moneyCell(row.amount) + moneyCell(row.added) + moneyCell(row.overlap) +
          "<td class=\"wrap\">" + escapeHtml(row.what || "—") + "</td></tr>";
      }),
      uplift.r1_n ? "Нет расшифровки Р1" : "Открытых Р1 в план нет"
    );

    const mgr = (payload.managers || []).slice();
    must("dept-mgr").innerHTML = tableHtml(
      [{ title: "МОП" }, { title: "ГК", cls: "num" }, { title: "Текущие", cls: "num" }, { title: "Новые", cls: "num" }, { title: "Песс", cls: "num" }, { title: "Реал", cls: "num" }, { title: "Опт", cls: "num" }],
      mgr.map(function (row) {
        return "<tr>" + cell(row.manager || "—") +
          "<td class=\"num\">" + escapeHtml(num(row.buyers)) + "</td>" +
          moneyCell(row.ship_real) + moneyCell(row.new_ship_real) +
          moneyCell(row.total_pess) + moneyCell(row.total_real) + moneyCell(row.total_opt) + "</tr>";
      }),
      "Нет МОПов"
    );

    const xlsx = $("dept-xlsx");
    if (xlsx) {
      xlsx.hidden = !STATE.fileName;
      xlsx.textContent = STATE.fileName ? "Скачать Excel" : "Скачать Excel";
    }
  }

  async function run() {
    const btn = must("dept-btn");
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Считаем ~40 сек…";
    showMsg("Идёт расчёт: 1С, склад, цены, воронка 1С РТЛ.", true);
    const asOf = ($("dept-as-of") && $("dept-as-of").value) || "";
    const priceDate = ($("dept-price-date") && $("dept-price-date").value) || "";
    try {
      const res = await window.rtlFetch("api/dept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          as_of: asOf || null,
          price_date: priceDate || null,
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
      paint(body);
      const total = (body.dept && body.dept.total) || {};
      showMsg("Готово: реал " + mln(total.real) + ". Excel во вкладке «Готовые».", true);
      if (window.loadState) await window.loadState();
    } catch (err) {
      showMsg((err && err.message) || "Сервер не отвечает.", false);
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  async function loadLast() {
    try {
      if (!window.rtlFetch) return;
      const res = await window.rtlFetch("api/dept");
      if (!res.ok) return;
      const body = await res.json();
      if (body && body.ok) paint(body);
    } catch (err) {}
  }

  function bind() {
    if (!$("dept-btn")) return;
    $("dept-btn").addEventListener("click", run);
    const xlsx = $("dept-xlsx");
    if (xlsx) {
      xlsx.addEventListener("click", function () {
        if (!STATE.fileName || !window.rtlDownload) return;
        window.rtlDownload(STATE.fileName).catch(function () {
          showMsg("Файл не скачался.", false);
        });
      });
    }
    (window.rtlReady || Promise.resolve()).then(loadLast).catch(function () {});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
