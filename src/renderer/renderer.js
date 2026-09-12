'use strict';

(function () {
  const state = {
    view: 'overview',
    systemInfo: null,
    debloatCatalog: [],
    debloatSelected: new Set(),
    telemetryOptions: {
      disableAdvertisingId: false,
      disableCortana: false,
      disableWidgets: false,
      disableCopilot: false
    },
    telemetryCustomized: false,
    autoBoostRunning: false
  };

  // Приоритеты передаются в backend/PowerShell как есть (System.Diagnostics.
  // ProcessPriorityClass), поэтому value остаётся английским — переводим
  // только то, что видит пользователь.
  const PRIORITY_LABELS = {
    Idle: 'Простой',
    BelowNormal: 'Ниже среднего',
    Normal: 'Обычный',
    AboveNormal: 'Выше среднего',
    High: 'Высокий'
  };
  const PRIORITY_ORDER = ['Idle', 'BelowNormal', 'Normal', 'AboveNormal', 'High'];

  // ---- маленькие помощники --------------------------------------------------
  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $all(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  async function call(promise) {
    const result = await promise;
    if (!result || result.ok !== true) {
      throw new Error((result && result.error) || 'Неизвестная ошибка');
    }
    return result.data;
  }

  let toastTimer = null;
  function showError(err) {
    const toast = $('#toast');
    const msg = $('#toastMessage');
    msg.textContent = typeof err === 'string' ? err : err.message || 'Что-то пошло не так.';
    toast.style.display = 'flex';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.style.display = 'none';
    }, 5000);
  }

  // ---- навигация -------------------------------------------------------
  function switchView(view) {
    state.view = view;
    $all('[data-panel]').forEach((panel) => {
      panel.style.display = panel.dataset.panel === view ? 'flex' : 'none';
    });
    $all('.nb-nav-item').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.view === view);
    });
    $('#viewTitle').textContent = viewLabel(view);

    if (view === 'processes') refreshProcesses();
  }

  function viewLabel(view) {
    const labels = {
      overview: 'Обзор',
      debloat: 'Приложения',
      telemetry: 'Телеметрия',
      ram: 'Память',
      processes: 'Процессы'
    };
    return labels[view] || view;
  }

  function wireNav() {
    $all('.nb-nav-item').forEach((btn) => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });
    $all('[data-jump]').forEach((btn) => {
      btn.addEventListener('click', () => switchView(btn.dataset.jump));
    });
  }

  // ---- информация о системе --------------------------------------------------
  async function loadSystemInfo() {
    try {
      const info = await call(window.neuroboost.system.getInfo());
      state.systemInfo = info;
      renderSystemInfo(info);
    } catch (err) {
      showError('Не удалось получить информацию о системе: ' + err.message);
    }

    try {
      const elevated = await call(window.neuroboost.system.isElevated());
      const pill = $('#adminPill');
      pill.textContent = elevated ? 'Администратор' : 'Без повышенных прав';
      pill.className = 'nb-pill ' + (elevated ? 'nb-pill-safe' : 'nb-pill-optional');
    } catch (_) {
      /* оставляем текст плашки по умолчанию, если запрос не удался */
    }
  }

  function renderSystemInfo(info) {
    if (!info || !info.supported) {
      $('#osPill').textContent = (info && info.message) || 'ОС не поддерживается';
      return;
    }

    $('#osPill').textContent = info.osName + ' · ' + info.fullBuild;
    $('#ovOsName').textContent = info.osName;
    $('#ovBuild').textContent = info.fullBuild;
    $('#ovEdition').textContent = info.productName || info.osName;
    $('#ovArch').textContent = info.architecture;
    $('#ovMem').textContent = info.totalMemoryGB + ' ГБ';

    // Адаптация под ОС: Кортана — только на Windows 10, Виджеты/Copilot —
    // только на тех сборках Windows 11, где они реально есть.
    toggleFeatureRow('cortanaRemovable', info.features.cortanaRemovable);
    toggleFeatureRow('widgetsToggle', info.features.widgetsToggle);
    toggleFeatureRow('copilotToggle', info.features.copilotToggle);
  }

  function toggleFeatureRow(feature, enabled) {
    $all('[data-feature="' + feature + '"]').forEach((row) => {
      row.style.display = enabled ? 'flex' : 'none';
    });
  }

  // ---- приложения (debloat) --------------------------------------------------
  async function loadDebloatCatalog() {
    try {
      const catalog = await call(window.neuroboost.debloat.list());
      state.debloatCatalog = catalog;
      renderDebloatList();
      $('#ovDebloatCount').textContent = catalog.length + ' приложений для удаления';
    } catch (err) {
      showError('Не удалось загрузить список приложений: ' + err.message);
    }
  }

  function renderDebloatList() {
    const isWin11 = state.systemInfo && state.systemInfo.isWindows11;
    const list = $('#debloatList');
    list.innerHTML = '';

    state.debloatCatalog
      .filter((app) => !(app.win10Only && isWin11)) // например, скрыть Кортану на Windows 11
      .forEach((app) => {
        const row = document.createElement('label');
        row.className = 'nb-row cursor-pointer';
        row.innerHTML =
          '<span class="flex items-center gap-3">' +
          '<input type="checkbox" class="h-4 w-4 accent-[#ff8a3d]" data-app-id="' + app.id + '" />' +
          '<span class="text-[13px]">' + escapeHtml(app.name) + '</span>' +
          '</span>' +
          '<span class="nb-pill ' + (app.risk === 'safe' ? 'nb-pill-safe' : 'nb-pill-optional') + '">' +
          (app.risk === 'safe' ? 'безопасно' : 'опционально') +
          '</span>';
        list.appendChild(row);
      });

    $all('input[data-app-id]', list).forEach((cb) => {
      cb.addEventListener('change', () => {
        if (cb.checked) state.debloatSelected.add(cb.dataset.appId);
        else state.debloatSelected.delete(cb.dataset.appId);
        updateDebloatButton();
      });
    });
  }

  function updateDebloatButton() {
    const count = state.debloatSelected.size;
    $('#debloatSelectedCount').textContent = String(count);
    $('#debloatRemoveBtn').disabled = count === 0;
    $('#debloatHint').textContent = count === 0 ? 'Выберите хотя бы одно приложение' : 'Готово к удалению: ' + count;
  }

  async function runDebloatRemoval() {
    const ids = Array.from(state.debloatSelected);
    if (ids.length === 0) return;

    const btn = $('#debloatRemoveBtn');
    btn.disabled = true;
    const progressCard = $('#debloatProgressCard');
    const progressEl = $('#debloatProgress');
    progressCard.classList.remove('hidden');
    progressEl.innerHTML = '';

    try {
      const results = await call(window.neuroboost.debloat.remove(ids));
      results.forEach((r) => appendDebloatProgress(r));
    } catch (err) {
      showError('Ошибка при удалении приложений: ' + err.message);
    } finally {
      btn.disabled = state.debloatSelected.size === 0;
    }
  }

  function appendDebloatProgress(entry) {
    const el = document.createElement('div');
    const color = entry.status === 'removed' ? 'text-good' : entry.status === 'failed' ? 'text-danger' : 'text-text-dim';
    const label = entry.status === 'removed' ? 'удалено' : entry.status === 'failed' ? 'ошибка' : 'удаление…';
    el.className = color;
    el.textContent = entry.name + ' — ' + label + (entry.error ? ' (' + entry.error + ')' : '');
    el.dataset.appId = entry.id;

    const existing = $('#debloatProgress [data-app-id="' + entry.id + '"]');
    if (existing) existing.replaceWith(el);
    else $('#debloatProgress').appendChild(el);
  }

  // ---- телеметрия --------------------------------------------------------
  function wireTelemetryToggles() {
    $all('[data-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.toggle;
        state.telemetryOptions[key] = !state.telemetryOptions[key];
        btn.classList.toggle('is-on', state.telemetryOptions[key]);
        btn.setAttribute('aria-pressed', String(state.telemetryOptions[key]));
      });
    });
  }

  async function loadTelemetryStatus() {
    try {
      const status = await call(window.neuroboost.telemetry.status());
      state.telemetryCustomized = status.customized;
      renderTelemetryStatus();
    } catch (err) {
      showError('Не удалось получить статус телеметрии: ' + err.message);
    }
  }

  function renderTelemetryStatus() {
    $('#telemetryStatusText').textContent = state.telemetryCustomized ? 'Настроено' : 'Не настроено';
    $('#telemetryRestoreBtn').disabled = !state.telemetryCustomized;
    $('#ovTelemetryStatus').textContent = state.telemetryCustomized ? 'Настроено' : 'Не настроено';
  }

  async function applyTelemetry() {
    const btn = $('#telemetryApplyBtn');
    btn.disabled = true;
    try {
      const result = await call(window.neuroboost.telemetry.disable(state.telemetryOptions));
      state.telemetryCustomized = true;
      renderTelemetryStatus();
      $('#telemetryStatusText').textContent = 'Настроено · изменено значений: ' + result.changed;
    } catch (err) {
      showError('Не удалось применить настройки телеметрии: ' + err.message);
    } finally {
      btn.disabled = false;
    }
  }

  async function restoreTelemetry() {
    const btn = $('#telemetryRestoreBtn');
    btn.disabled = true;
    try {
      await call(window.neuroboost.telemetry.restore());
      state.telemetryCustomized = false;
      renderTelemetryStatus();
    } catch (err) {
      showError('Не удалось восстановить настройки телеметрии: ' + err.message);
      btn.disabled = !state.telemetryCustomized;
    }
  }

  // ---- память (RAM) --------------------------------------------------------------
  async function loadMemoryInfo() {
    try {
      const info = await call(window.neuroboost.ram.info());
      renderMemoryInfo(info);
    } catch (err) {
      showError('Не удалось получить данные о памяти: ' + err.message);
    }
  }

  function renderMemoryInfo(info) {
    $('#ramUsedGB').textContent = info.usedGB.toFixed(1);
    $('#ramTotalGB').textContent = info.totalGB.toFixed(1);
    $('#ramPercent').textContent = info.usedPercent.toFixed(0) + '%';
    $('#ramBar').style.width = Math.min(100, info.usedPercent) + '%';
    $('#ovRamUsed').textContent = info.usedPercent.toFixed(0) + '% занято';
  }

  async function purgeStandbyList() {
    const btn = $('#ramPurgeBtn');
    btn.disabled = true;
    $('#ramStatusText').textContent = 'Очистка…';
    try {
      const info = await call(window.neuroboost.ram.purge());
      renderMemoryInfo(info);
      $('#ramStatusText').textContent = 'Готово';
    } catch (err) {
      $('#ramStatusText').textContent = '';
      showError('Не удалось очистить список ожидания: ' + err.message);
    } finally {
      btn.disabled = false;
    }
  }

  // ---- процессы --------------------------------------------------------
  async function refreshProcesses() {
    try {
      const procs = await call(window.neuroboost.process.list());
      renderProcessTable(procs.slice(0, 60));
    } catch (err) {
      showError('Не удалось получить список процессов: ' + err.message);
    }
  }

  function renderProcessTable(procs) {
    const body = $('#processTableBody');
    body.innerHTML = '';

    procs.forEach((p) => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-border last:border-b-0';

      const options = PRIORITY_ORDER
        .map((pr) => '<option value="' + pr + '"' + (pr === p.priority ? ' selected' : '') + '>' + PRIORITY_LABELS[pr] + '</option>')
        .join('');

      tr.innerHTML =
        '<td class="px-4 py-2">' + escapeHtml(p.name) + '</td>' +
        '<td class="px-4 py-2 nb-mono text-text-dim">' + p.pid + '</td>' +
        '<td class="px-4 py-2 nb-mono">' + p.cpuPercent.toFixed(1) + '%</td>' +
        '<td class="px-4 py-2 nb-mono">' + p.memoryMB.toFixed(0) + ' МБ</td>' +
        '<td class="px-4 py-2">' +
        '<select data-pid="' + p.pid + '" class="rounded-sm border border-border bg-panel-2 px-2 py-1 text-[12px]">' +
        options +
        '</select>' +
        '</td>';
      body.appendChild(tr);
    });

    $all('select[data-pid]', body).forEach((select) => {
      select.addEventListener('change', async () => {
        const pid = Number(select.dataset.pid);
        const priority = select.value;
        try {
          await call(window.neuroboost.process.setPriority(pid, priority));
        } catch (err) {
          showError('Не удалось изменить приоритет: ' + err.message);
        }
      });
    });
  }

  function wireAutoBoost() {
    const toggle = $('#autoBoostToggle');
    toggle.addEventListener('click', async () => {
      try {
        if (!state.autoBoostRunning) {
          await call(window.neuroboost.process.autoBoostStart({ intervalMs: 8000 }));
          state.autoBoostRunning = true;
        } else {
          await call(window.neuroboost.process.autoBoostStop());
          state.autoBoostRunning = false;
        }
        toggle.classList.toggle('is-on', state.autoBoostRunning);
        toggle.setAttribute('aria-pressed', String(state.autoBoostRunning));
      } catch (err) {
        showError('Не удалось переключить Автоускорение: ' + err.message);
      }
    });

    window.neuroboost.process.onAutoBoostEvent((event) => {
      const log = $('#autoBoostLog');
      const line = document.createElement('div');
      const time = new Date().toLocaleTimeString();
      if (event.type === 'boosted') {
        line.textContent = '[' + time + '] Повышен приоритет: ' + event.name + ' (PID ' + event.pid + ') → Высокий';
      } else if (event.type === 'error') {
        line.textContent = '[' + time + '] ' + event.message;
        line.classList.add('text-danger');
      }
      log.prepend(line);
      while (log.children.length > 20) log.removeChild(log.lastChild);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---- загрузка --------------------------------------------------------------
  function init() {
    wireNav();
    wireTelemetryToggles();
    wireAutoBoost();

    $('#debloatRemoveBtn').addEventListener('click', runDebloatRemoval);
    $('#telemetryApplyBtn').addEventListener('click', applyTelemetry);
    $('#telemetryRestoreBtn').addEventListener('click', restoreTelemetry);
    $('#ramPurgeBtn').addEventListener('click', purgeStandbyList);
    $('#processRefreshBtn').addEventListener('click', refreshProcesses);

    window.neuroboost.debloat.onProgress(appendDebloatProgress);

    loadSystemInfo().then(() => {
      loadDebloatCatalog();
      loadTelemetryStatus();
      loadMemoryInfo();
    });

    updateDebloatButton();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
