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
    autoBoostRunning: false,
    allProcesses: []
  };

  const PAGE_TITLES = {
    overview: 'Обзор системы',
    debloat: 'Управление приложениями',
    telemetry: 'Телеметрия и конфиденциальность',
    ram: 'Оптимизация памяти',
    processes: 'Диспетчер процессов'
  };

  // Priority values are sent to the backend/PowerShell as-is (they are
  // System.Diagnostics.ProcessPriorityClass names), only the label shown to
  // the user is translated.
  const PRIORITY_LABELS = {
    Idle: 'Простой',
    BelowNormal: 'Ниже среднего',
    Normal: 'Обычный',
    AboveNormal: 'Выше среднего',
    High: 'Высокий'
  };
  const PRIORITY_ORDER = ['Idle', 'BelowNormal', 'Normal', 'AboveNormal', 'High'];

  // disable-telemetry.ps1 returns plain-ASCII keys (see that file for why) -
  // this is where they get a human-readable Russian label.
  const TELEMETRY_KEY_LABELS = {
    core_telemetry: 'Диагностические данные',
    advertising_id: 'Рекламный идентификатор',
    cortana: 'Кортана',
    widgets: 'Виджеты',
    copilot: 'Copilot',
    service_DiagTrack: 'Служба DiagTrack',
    service_dmwappushservice: 'Служба dmwappushservice'
  };

  // Short descriptions for common process names, shown as a tooltip when
  // hovering a process in the table. "critical: true" means NeuroBoost
  // does not recommend changing its priority. Best-effort reference list,
  // not exhaustive - unrecognized processes simply get no tooltip.
  const PROCESS_INFO = {
    system: { d: 'Ядро системы Windows', critical: true },
    registry: { d: 'Процесс реестра Windows', critical: true },
    idle: { d: 'Системный процесс простоя - не реальная нагрузка', critical: true },
    csrss: { d: 'Клиент-серверная подсистема выполнения Windows', critical: true },
    wininit: { d: 'Инициализация Windows при запуске', critical: true },
    winlogon: { d: 'Процесс входа в систему Windows', critical: true },
    services: { d: 'Диспетчер служб Windows (SCM)', critical: true },
    lsass: { d: 'Служба проверки подлинности локальной системы', critical: true },
    smss: { d: 'Диспетчер сеансов Windows', critical: true },
    'secure system': { d: 'Изолированная защищённая среда Windows (VBS)', critical: true },
    'memory compression': { d: 'Сжатие памяти Windows для экономии ОЗУ', critical: true },
    svchost: { d: 'Процесс-контейнер для служб Windows', critical: false },
    dwm: { d: 'Диспетчер окон рабочего стола - визуальные эффекты', critical: false },
    explorer: { d: 'Проводник Windows - рабочий стол, панель задач, папки', critical: false },
    runtimebroker: { d: 'Посредник разрешений для приложений из Microsoft Store', critical: false },
    shellexperiencehost: { d: 'Компоненты оболочки Windows (меню Пуск, уведомления)', critical: false },
    startmenuexperiencehost: { d: 'Меню Пуск Windows 11', critical: false },
    searchapp: { d: 'Поиск Windows', critical: false },
    searchhost: { d: 'Поиск Windows', critical: false },
    searchindexer: { d: 'Индексация файлов для быстрого поиска', critical: false },
    textinputhost: { d: 'Служба ввода текста Windows', critical: false },
    ctfmon: { d: 'Языковая панель и служба ввода текста', critical: false },
    widgets: { d: 'Панель виджетов Windows 11', critical: false },
    taskhostw: { d: 'Хост фоновых задач Windows', critical: false },
    spoolsv: { d: 'Диспетчер очереди печати', critical: false },
    dllhost: { d: 'Хост-процесс COM-объектов Windows', critical: false },
    fontdrvhost: { d: 'Служба шрифтов Windows', critical: false },
    audiodg: { d: 'Изоляция звуковых устройств Windows', critical: false },
    securityhealthservice: { d: 'Центр безопасности Windows (Защитник)', critical: true },
    securityhealthsystray: { d: 'Значок Защитника Windows в трее', critical: false },
    msmpeng: { d: 'Антивирусный движок Защитника Windows', critical: true },
    nissrv: { d: 'Проверка сетевого трафика Защитником Windows', critical: true },
    smartscreen: { d: 'Windows SmartScreen - проверка файлов и ссылок на угрозы', critical: false },
    onedrive: { d: 'Синхронизация облачного хранилища Microsoft OneDrive', critical: false },
    phoneexperiencehost: { d: 'Связь с телефоном (Phone Link)', critical: false },
    yourphone: { d: 'Связь с телефоном', critical: false },
    chrome: { d: 'Браузер Google Chrome', critical: false },
    msedge: { d: 'Браузер Microsoft Edge', critical: false },
    msedgewebview2: { d: 'Встроенный компонент браузера Edge для других приложений', critical: false },
    firefox: { d: 'Браузер Mozilla Firefox', critical: false },
    opera: { d: 'Браузер Opera', critical: false },
    steam: { d: 'Игровая платформа Steam', critical: false },
    steamwebhelper: { d: 'Веб-компонент клиента Steam', critical: false },
    discord: { d: 'Мессенджер Discord', critical: false },
    obs64: { d: 'Запись и стриминг видео - OBS Studio', critical: false },
    obs32: { d: 'Запись и стриминг видео - OBS Studio', critical: false },
    code: { d: 'Редактор кода Visual Studio Code', critical: false },
    node: { d: 'Среда выполнения JavaScript Node.js', critical: false },
    powershell: { d: 'Командная оболочка Windows PowerShell', critical: false },
    pwsh: { d: 'Командная оболочка PowerShell (Core)', critical: false },
    cmd: { d: 'Командная строка Windows', critical: false },
    taskmgr: { d: 'Диспетчер задач Windows', critical: false },
    neuroboost: { d: 'Это сама программа NeuroBoost', critical: false },
    nvcontainer: { d: 'Служба драйвера видеокарты NVIDIA', critical: false },
    spotify: { d: 'Музыкальный сервис Spotify', critical: false },
    telegram: { d: 'Мессенджер Telegram', critical: false },
    skype: { d: 'Мессенджер Skype', critical: false },
    teams: { d: 'Microsoft Teams', critical: false }
  };

  // ---- helpers ------------------------------------------------------------
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

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  // ---- toasts ---------------------------------------------------------
  const TOAST_ICONS = {
    success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>',
    error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };
  const TOAST_COLORS = { success: 'text-good', error: 'text-danger', info: 'text-cyan' };

  function showToast(type, message) {
    const container = $('#toast-container');
    const el = document.createElement('div');
    el.className = 'nb-toast nb-slide-up';
    el.innerHTML =
      '<span class="' + (TOAST_COLORS[type] || 'text-cyan') + ' shrink-0">' + (TOAST_ICONS[type] || TOAST_ICONS.info) + '</span>' +
      '<span class="flex-1">' + escapeHtml(message) + '</span>';
    container.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity 0.3s, transform 0.3s';
      el.style.opacity = '0';
      el.style.transform = 'translateX(20px)';
      setTimeout(() => el.remove(), 300);
    }, 5000);
  }

  function showError(err) {
    showToast('error', typeof err === 'string' ? err : (err && err.message) || 'Что-то пошло не так.');
  }

  // ---- navigation -------------------------------------------------------
  function switchView(view) {
    state.view = view;
    $all('[data-panel]').forEach((panel) => {
      panel.style.display = panel.dataset.panel === view ? 'block' : 'none';
    });
    $all('.nb-nav-item').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.view === view);
    });
    $('#page-title').textContent = PAGE_TITLES[view] || view;

    if (view === 'processes') refreshProcesses();
  }

  function wireNav() {
    $all('.nb-nav-item').forEach((btn) => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });
    $all('[data-jump]').forEach((btn) => {
      btn.addEventListener('click', () => switchView(btn.dataset.jump));
    });
  }

  // ---- system info --------------------------------------------------
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
      const label = elevated ? 'Администратор' : 'Без повышенных прав';
      $('#adminPill').textContent = label;
      $('#adminPill').className = 'nb-pill ' + (elevated ? 'nb-pill-safe' : 'nb-pill-warn');
      $('#footerAdmin').textContent = label;
      $('#statusDot').innerHTML =
        '<span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style="background:' +
        (elevated ? '#4ade80' : '#f5c563') + '"></span>' +
        '<span class="relative inline-flex rounded-full h-2 w-2" style="background:' + (elevated ? '#4ade80' : '#f5c563') + '"></span>';
    } catch (_) {
      /* leave defaults if this fails */
    }
  }

  function renderSystemInfo(info) {
    if (!info || !info.supported) {
      const msg = (info && info.message) || 'ОС не поддерживается';
      $('#osPill').textContent = msg;
      $('#footerOs').textContent = msg;
      return;
    }

    const line = info.osName + ' \u00b7 ' + info.fullBuild;
    $('#osPill').textContent = line;
    $('#footerOs').textContent = line;

    toggleFeatureRow('cortanaRemovable', info.features.cortanaRemovable);
    toggleFeatureRow('widgetsToggle', info.features.widgetsToggle);
    toggleFeatureRow('copilotToggle', info.features.copilotToggle);
  }

  function toggleFeatureRow(feature, enabled) {
    $all('[data-feature="' + feature + '"]').forEach((row) => {
      row.style.display = enabled ? 'flex' : 'none';
    });
  }

  // ---- overview -----------------------------------------------------
  function updateOverviewRam(info) {
    $('#ovRamPercent').textContent = info.usedPercent.toFixed(0) + '%';
    $('#ovRamBar').style.width = Math.min(100, info.usedPercent) + '%';
    $('#ovRamUsedText').textContent = info.usedGB.toFixed(1) + ' ГБ занято';
    $('#ovRamTotalText').textContent = info.totalGB.toFixed(1) + ' ГБ всего';
  }

  async function loadOverview() {
    try {
      const info = await call(window.neuroboost.ram.info());
      updateOverviewRam(info);
    } catch (err) {
      showError('Не удалось получить данные о памяти: ' + err.message);
    }
  }

  function wireHeroBoost() {
    $('#heroBoostBtn').addEventListener('click', async () => {
      const btn = $('#heroBoostBtn');
      btn.disabled = true;
      try {
        const result = await call(window.neuroboost.ram.purge());
        updateOverviewRam(result);
        if (state.view === 'ram') renderRam(result);
        showToast(
          'success',
          'Готово: освобождено ' + result.freedGB.toFixed(2) + ' ГБ, очищено процессов: ' + result.trimmedCount
        );
      } catch (err) {
        showError('Не удалось выполнить ускорение: ' + err.message);
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ---- debloat --------------------------------------------------------
  async function loadDebloatCatalog() {
    const list = $('#debloatList');
    list.innerHTML = '<div class="col-span-2 py-6 text-center text-[12px] text-slate-500">Сканирование установленных приложений...</div>';
    try {
      const catalog = await call(window.neuroboost.debloat.list());
      state.debloatCatalog = catalog;
      state.debloatSelected.clear();
      renderDebloatList();
      updateDebloatButton();
      $('#ovAppsCount').textContent = String(catalog.length);
    } catch (err) {
      list.innerHTML = '';
      showError('Не удалось загрузить список приложений: ' + err.message);
    }
  }

  function renderDebloatList() {
    const list = $('#debloatList');
    list.innerHTML = '';

    if (state.debloatCatalog.length === 0) {
      list.innerHTML = '<div class="col-span-2 py-6 text-center text-[12px] text-slate-500">Не найдено приложений, которые можно безопасно удалить.</div>';
      return;
    }

    state.debloatCatalog.forEach((app) => {
      const rec = app.recommendation;
      const dotColor = rec === 'insist' ? 'bg-danger' : rec === 'suggest' ? 'bg-warn' : 'bg-slate-600';
      const borderStyle = rec === 'insist' ? 'border-danger/30' : rec === 'suggest' ? 'border-warn/30' : 'border-white/5';
      const badge =
        rec === 'insist'
          ? '<span class="nb-pill nb-pill-danger">настоятельно рекомендуется</span>'
          : rec === 'suggest'
          ? '<span class="nb-pill nb-pill-warn">можно удалить</span>'
          : '';

      const card = document.createElement('label');
      card.className = 'glass-card rounded-xl p-4 flex items-center gap-3 cursor-pointer border ' + borderStyle;
      card.innerHTML =
        '<span class="w-2 h-2 rounded-full shrink-0 ' + dotColor + '"></span>' +
        '<span class="w-9 h-9 rounded-lg bg-neuro-800 flex items-center justify-center text-slate-400 shrink-0">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.73V8z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/></svg>' +
        '</span>' +
        '<span class="flex-1 min-w-0">' +
        '<span class="block text-[13px] text-slate-200 truncate">' + escapeHtml(app.name) + '</span>' +
        (badge ? '<span class="block mt-1">' + badge + '</span>' : '') +
        '</span>' +
        '<input type="checkbox" class="h-4 w-4 accent-cyan shrink-0" data-app-id="' + escapeHtml(app.id) + '" />';
      list.appendChild(card);
    });

    $all('input[data-app-id]', list).forEach((cb) => {
      cb.addEventListener('change', () => {
        if (cb.checked) state.debloatSelected.add(cb.dataset.appId);
        else state.debloatSelected.delete(cb.dataset.appId);
        syncSelectAllCheckbox();
        updateDebloatButton();
      });
    });

    syncSelectAllCheckbox();
  }

  function debloatAppName(id) {
    const found = state.debloatCatalog.find((a) => a.id === id);
    return found ? found.name : id;
  }

  function syncSelectAllCheckbox() {
    const selectAll = $('#debloatSelectAll');
    const total = state.debloatCatalog.length;
    const selected = state.debloatSelected.size;
    selectAll.checked = total > 0 && selected === total;
    selectAll.indeterminate = selected > 0 && selected < total;
  }

  function wireSelectAll() {
    $('#debloatSelectAll').addEventListener('change', (e) => {
      if (e.target.checked) {
        state.debloatCatalog.forEach((app) => state.debloatSelected.add(app.id));
      } else {
        state.debloatSelected.clear();
      }
      $all('input[data-app-id]', $('#debloatList')).forEach((cb) => {
        cb.checked = state.debloatSelected.has(cb.dataset.appId);
      });
      updateDebloatButton();
    });
  }

  function updateDebloatButton() {
    const count = state.debloatSelected.size;
    $('#debloatSelectedCount').textContent = String(count);
    $('#debloatRemoveBtn').disabled = count === 0;
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
      const removed = results.filter((r) => r.status === 'removed').length;
      showToast('success', 'Удалено приложений: ' + removed + ' из ' + results.length);
      await loadDebloatCatalog();
    } catch (err) {
      showError('Ошибка при удалении приложений: ' + err.message);
    } finally {
      btn.disabled = state.debloatSelected.size === 0;
    }
  }

  function appendDebloatProgress(entry) {
    const el = document.createElement('div');
    const color = entry.status === 'removed' ? 'text-good' : entry.status === 'failed' ? 'text-danger' : 'text-slate-400';
    const label = entry.status === 'removed' ? 'удалено' : entry.status === 'failed' ? 'ошибка' : 'удаление...';
    el.className = color;
    el.textContent = debloatAppName(entry.id) + ' \u2014 ' + label + (entry.error ? ' (' + entry.error + ')' : '');
    el.dataset.appId = entry.id;

    const existing = $('#debloatProgress [data-app-id="' + CSS.escape(entry.id) + '"]');
    if (existing) existing.replaceWith(el);
    else $('#debloatProgress').appendChild(el);
  }

  // ---- telemetry --------------------------------------------------------
  function wireTelemetryToggles() {
    $all('.nb-toggle-input[data-toggle]').forEach((input) => {
      input.addEventListener('change', () => {
        state.telemetryOptions[input.dataset.toggle] = input.checked;
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
      state.telemetryCustomized = result.changed > 0;
      renderTelemetryStatus();

      if (result.failed > 0) {
        const failedLabels = result.results
          .filter((r) => r.status === 'failed')
          .map((r) => TELEMETRY_KEY_LABELS[r.key] || r.key)
          .join(', ');
        $('#telemetryStatusText').textContent = 'Применено: ' + result.changed + ', не удалось: ' + result.failed;
        showError('Не применилось: ' + failedLabels + '. Остальное применено успешно.');
      } else {
        $('#telemetryStatusText').textContent = 'Настроено \u00b7 применено: ' + result.changed;
        showToast('success', 'Настройки телеметрии применены (' + result.changed + ')');
      }
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
      showToast('success', 'Настройки телеметрии восстановлены');
    } catch (err) {
      showError('Не удалось восстановить настройки телеметрии: ' + err.message);
      btn.disabled = !state.telemetryCustomized;
    }
  }

  // ---- RAM --------------------------------------------------------------
  function renderRam(info) {
    const circumference = 2 * Math.PI * 70; // r=70, matches the SVG circle
    const offset = circumference * (1 - Math.min(100, info.usedPercent) / 100);
    $('#ram-progress').style.strokeDashoffset = String(offset);
    $('#ram-text').innerHTML = info.usedGB.toFixed(1) + '<span class="text-lg text-slate-400 font-normal"> ГБ</span>';
    $('#ramUsedGB').textContent = info.usedGB.toFixed(1) + ' ГБ';
    if (typeof info.freedGB === 'number') {
      $('#ramFreedGB').textContent = info.freedGB.toFixed(2) + ' ГБ';
    }
    if (typeof info.trimmedCount === 'number') {
      $('#ramTrimmedCount').textContent = String(info.trimmedCount);
    }
  }

  async function loadMemoryInfo() {
    try {
      const info = await call(window.neuroboost.ram.info());
      renderRam(info);
    } catch (err) {
      showError('Не удалось получить данные о памяти: ' + err.message);
    }
  }

  async function purgeStandbyList() {
    const btn = $('#btn-purge');
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'Очистка...';
    try {
      const info = await call(window.neuroboost.ram.purge());
      renderRam(info);
      updateOverviewRam(info);
      showToast('success', 'Освобождено ' + info.freedGB.toFixed(2) + ' ГБ \u00b7 очищено процессов: ' + info.trimmedCount);
    } catch (err) {
      showError('Не удалось очистить память: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }

  // ---- processes --------------------------------------------------------
  function processTooltip(name) {
    const info = PROCESS_INFO[name.toLowerCase()];
    if (!info) return '';
    return (info.critical ? '\u26a0\ufe0f Критический системный процесс. ' : '') + info.d;
  }

  async function refreshProcesses() {
    const btn = $('#processRefreshBtn');
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'Обновление...';
    try {
      const procs = await call(window.neuroboost.process.list());
      state.allProcesses = procs;
      renderProcessTable(filterProcesses());
    } catch (err) {
      showError('Не удалось получить список процессов: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }

  function filterProcesses() {
    const q = ($('#processSearch').value || '').trim().toLowerCase();
    const list = q ? state.allProcesses.filter((p) => p.name.toLowerCase().includes(q)) : state.allProcesses;
    return list.slice(0, 80);
  }

  function renderProcessTable(procs) {
    const body = $('#processTableBody');
    body.innerHTML = '';

    if (procs.length === 0) {
      body.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-slate-500 text-sm">Ничего не найдено</td></tr>';
      return;
    }

    procs.forEach((p) => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-white/5 transition-colors';

      const options = PRIORITY_ORDER
        .map((pr) => '<option value="' + pr + '"' + (pr === p.priority ? ' selected' : '') + '>' + PRIORITY_LABELS[pr] + '</option>')
        .join('');

      const info = PROCESS_INFO[p.name.toLowerCase()];
      const nameClass = info && info.critical ? 'text-warn' : 'text-slate-200';
      const tooltip = processTooltip(p.name);

      tr.innerHTML =
        '<td class="p-4 ' + nameClass + '"' + (tooltip ? ' title="' + escapeHtml(tooltip) + '"' : '') + '>' + escapeHtml(p.name) + '</td>' +
        '<td class="p-4 nb-mono text-slate-500">' + p.pid + '</td>' +
        '<td class="p-4 nb-mono">' + p.cpuPercent.toFixed(1) + '%</td>' +
        '<td class="p-4 nb-mono">' + p.memoryMB.toFixed(0) + ' МБ</td>' +
        '<td class="p-4 text-right">' +
        '<select data-pid="' + p.pid + '" class="bg-neuro-800 border border-white/10 rounded-md px-2 py-1 text-[12px] text-slate-200">' +
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
          showToast('success', 'Приоритет изменён: ' + PRIORITY_LABELS[priority]);
        } catch (err) {
          showError('Не удалось изменить приоритет: ' + err.message);
        }
      });
    });
  }

  function wireProcessSearch() {
    $('#processSearch').addEventListener('input', () => {
      renderProcessTable(filterProcesses());
    });
  }

  function wireAutoBoost() {
    const toggle = $('#autoBoostToggle');
    toggle.addEventListener('change', async () => {
      if (toggle.dataset.busy === '1') return;
      toggle.dataset.busy = '1';
      const wantRunning = toggle.checked;
      try {
        if (wantRunning) {
          await call(window.neuroboost.process.autoBoostStart({ intervalMs: 8000 }));
          state.autoBoostRunning = true;
          showToast('success', 'Авто-ускорение включено');
        } else {
          await call(window.neuroboost.process.autoBoostStop());
          state.autoBoostRunning = false;
          showToast('info', 'Авто-ускорение выключено');
        }
      } catch (err) {
        toggle.checked = !wantRunning;
        showError('Не удалось переключить Авто-ускорение: ' + err.message);
      } finally {
        toggle.dataset.busy = '0';
      }
    });

    window.neuroboost.process.onAutoBoostEvent((event) => {
      const log = $('#autoBoostLog');
      const line = document.createElement('div');
      const time = new Date().toLocaleTimeString();
      if (event.type === 'boosted') {
        line.textContent = '[' + time + '] Повышен приоритет: ' + event.name + ' (PID ' + event.pid + ') \u2192 Высокий';
      } else if (event.type === 'error') {
        line.textContent = '[' + time + '] ' + event.message;
        line.classList.add('text-danger');
      }
      log.prepend(line);
      while (log.children.length > 20) log.removeChild(log.lastChild);
    });
  }

  // ---- boot --------------------------------------------------------------
  function init() {
    wireNav();
    wireTelemetryToggles();
    wireAutoBoost();
    wireSelectAll();
    wireHeroBoost();
    wireProcessSearch();

    $('#debloatRemoveBtn').addEventListener('click', runDebloatRemoval);
    $('#debloatRescanBtn').addEventListener('click', loadDebloatCatalog);
    $('#telemetryApplyBtn').addEventListener('click', applyTelemetry);
    $('#telemetryRestoreBtn').addEventListener('click', restoreTelemetry);
    $('#btn-purge').addEventListener('click', purgeStandbyList);
    $('#processRefreshBtn').addEventListener('click', refreshProcesses);

    window.neuroboost.debloat.onProgress(appendDebloatProgress);

    loadSystemInfo().then(() => {
      loadDebloatCatalog();
      loadTelemetryStatus();
      loadOverview();
      loadMemoryInfo();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
