'use strict';

(function () {
  const { t, setLocale, applyStaticTranslations } = window.NeuroBoostI18n;

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
    allProcesses: [],
    startupItems: [],
    diskCategories: [],
    diskSelected: new Set(),
    settings: null
  };

  const pageTitle = (view) => t('page.' + view);

  // Priority values are sent to the backend/PowerShell as-is (they are
  // System.Diagnostics.ProcessPriorityClass names), only the label shown to
  // the user is translated.
  const priorityLabel = (p) => t('priority.' + p);
  const PRIORITY_ORDER = ['Idle', 'BelowNormal', 'Normal', 'AboveNormal', 'High'];

  // disable-telemetry.ps1 returns plain-ASCII keys (see that file for why) -
  // this is where they get a human-readable Russian label.
  const telemetryKeyLabel = (k) => t('telemetry.' + k);

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
    teams: { d: 'Microsoft Teams', critical: false },
    rundll32: { d: 'Хост для функций из библиотек DLL Windows', critical: false },
    conhost: { d: 'Хост консольного окна Windows', critical: false },
    applicationframehost: { d: 'Обёртка окна для приложений из Microsoft Store', critical: false },
    backgroundtaskhost: { d: 'Хост фоновых задач приложений из Microsoft Store', critical: false },
    wmiprvse: { d: 'Служба инструментария управления Windows (WMI)', critical: false },
    trustedinstaller: { d: 'Служба установки компонентов Windows', critical: true },
    msiexec: { d: 'Установщик Windows (запуск/удаление программ)', critical: false },
    'nvidia broadcast': { d: 'Обработка видео и звука NVIDIA Broadcast', critical: false },
    nvsphelper64: { d: 'Служебный процесс NVIDIA', critical: false },
    razersynapse: { d: 'Панель управления периферией Razer Synapse', critical: false },
    lghub: { d: 'Панель управления периферией Logitech G HUB', critical: false },
    realtekaudiouniversalservice: { d: 'Драйвер звука Realtek', critical: false },
    epicgameslauncher: { d: 'Лаунчер игр Epic Games', critical: false },
    battlenet: { d: 'Лаунчер игр Battle.net', critical: false },
    riotclientservices: { d: 'Клиент игр Riot Games', critical: false },
    origin: { d: 'Лаунчер игр EA Origin', critical: false },
    upc: { d: 'Лаунчер игр Ubisoft Connect', critical: false },
    creativecloud: { d: 'Adobe Creative Cloud - менеджер приложений Adobe', critical: false },
    photoshop: { d: 'Adobe Photoshop', critical: false },
    premierepro: { d: 'Adobe Premiere Pro - монтаж видео', critical: false },
    unityhub: { d: 'Менеджер версий Unity Hub', critical: false },
    'docker desktop': { d: 'Docker Desktop - контейнеры для разработки', critical: false },
    com: { d: 'Docker/WSL внутренний процесс', critical: false },
    vmmem: { d: 'Виртуальная машина WSL2 / Hyper-V - потребляет память по требованию', critical: false },
    vboxheadless: { d: 'Виртуальная машина VirtualBox', critical: false },
    'vmware-vmx': { d: 'Виртуальная машина VMware', critical: false },
    zoom: { d: 'Видеоконференции Zoom', critical: false },
    slack: { d: 'Корпоративный мессенджер Slack', critical: false },
    notion: { d: 'Заметки и база знаний Notion', critical: false },
    figma: { d: 'Дизайн-инструмент Figma', critical: false },
    postman: { d: 'Инструмент тестирования API Postman', critical: false },
    git: { d: 'Система контроля версий Git', critical: false },
    python: { d: 'Интерпретатор Python', critical: false },
    java: { d: 'Виртуальная машина Java', critical: false },
    javaw: { d: 'Виртуальная машина Java (без консоли)', critical: false }
  };

  // Row/metric highlighting thresholds - purely visual, informational only.
  const HEAVY_CPU_THRESHOLD = 25;
  const HEAVY_MEM_MB_THRESHOLD = 800;

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
      throw new Error((result && result.error) || t('common.unknownError'));
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
    showToast('error', typeof err === 'string' ? err : (err && err.message) || t('common.somethingWrong'));
  }

  // ---- navigation -------------------------------------------------------
  function switchView(view) {
    state.view = view;
    $all('[data-panel]').forEach((panel) => {
      panel.style.display = panel.dataset.panel === view ? 'block' : 'none';
    });
    $all('.nb-nav-item').forEach((btn) => {
      const active = btn.dataset.view === view;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    $('#page-title').textContent = pageTitle(view);

    if (view === 'processes') refreshProcesses();
    if (view === 'startup' && state.startupItems.length === 0) loadStartupItems();
    if (view === 'disk' && state.diskCategories.length === 0) loadDiskCategories();
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
      const label = elevated ? t('common.admin') : t('common.notElevated');
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
      const msg = (info && info.message) || t('common.osUnsupported');
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
          t('ram.toast', { freed: result.freedGB.toFixed(2), count: result.trimmedCount })
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
    list.innerHTML = '<div class="col-span-2 py-6 text-center text-[12px] text-slate-500">' + t('debloat.scanning') + '</div>';
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
      list.innerHTML = '<div class="col-span-2 py-6 text-center text-[12px] text-slate-500">' + t('debloat.none') + '</div>';
      return;
    }

    state.debloatCatalog.forEach((app) => {
      const rec = app.recommendation;
      const dotColor = rec === 'insist' ? 'bg-danger' : rec === 'suggest' ? 'bg-warn' : 'bg-slate-600';
      const borderStyle = rec === 'insist' ? 'border-danger/30' : rec === 'suggest' ? 'border-warn/30' : 'border-white/5';
      const badge =
        rec === 'insist'
          ? '<span class="nb-pill nb-pill-danger">' + t('debloat.insist') + '</span>'
          : rec === 'suggest'
          ? '<span class="nb-pill nb-pill-warn">' + t('debloat.suggest') + '</span>'
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
      const { results, restorePoint } = await call(window.neuroboost.debloat.remove(ids));
      results.forEach((r) => appendDebloatProgress(r));
      const removed = results.filter((r) => r.status === 'removed').length;
      showToast('success', t('debloat.result', { removed: removed, total: results.length }));
      reportRestorePoint(restorePoint);
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
    const label = entry.status === 'removed' ? t('debloat.removed') : entry.status === 'failed' ? t('debloat.failed') : t('debloat.removing');
    el.className = color;
    el.textContent = debloatAppName(entry.id) + ' \u2014 ' + label + (entry.error ? ' (' + entry.error + ')' : '');
    el.dataset.appId = entry.id;

    const existing = $('#debloatProgress [data-app-id="' + CSS.escape(entry.id) + '"]');
    if (existing) existing.replaceWith(el);
    else $('#debloatProgress').appendChild(el);
  }

  /**
   * Tells the user the truth about the safety net: "created", "one already
   * exists from today", or - importantly - "System Protection is off, so
   * there is NO restore point". Claiming protection that doesn't exist
   * would be worse than offering none.
   */
  function reportRestorePoint(rp) {
    if (!rp) return;
    if (rp.created) {
      showToast('info', t('restorePoint.created'));
    } else if (rp.reason === 'throttled') {
      showToast('info', t('restorePoint.throttled'));
    } else if (rp.reason === 'disabled') {
      showToast('error', t('restorePoint.disabled'));
    } else {
      showToast('error', t('restorePoint.error'));
    }
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
    $('#telemetryStatusText').textContent = state.telemetryCustomized ? t('telemetry.configured') : t('telemetry.notConfigured');
    $('#telemetryRestoreBtn').disabled = !state.telemetryCustomized;
    $('#ovTelemetryStatus').textContent = state.telemetryCustomized ? t('telemetry.configured') : t('telemetry.notConfigured');
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
          .map((r) => telemetryKeyLabel(r.key))
          .join(', ');
        $('#telemetryStatusText').textContent = t('telemetry.partial', { changed: result.changed, failed: result.failed });
        showError(t('telemetry.failedList', { list: failedLabels }));
      } else {
        $('#telemetryStatusText').textContent = 'Настроено \u00b7 применено: ' + result.changed;
        showToast('success', t('telemetry.applied', { count: result.changed }));
      }
      reportRestorePoint(result.restorePoint);
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
      showToast('success', t('telemetry.restored'));
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
    btn.innerHTML = t('ram.purging');

    const progressCard = $('#ramProgressCard');
    const progressLog = $('#ramProgressLog');
    progressLog.innerHTML = '';
    progressCard.classList.remove('hidden');
    appendRamProgress('Освобождение списка ожидания...');

    try {
      const info = await call(window.neuroboost.ram.purge());
      renderRam(info);
      updateOverviewRam(info);
      appendRamProgress(
        t('ram.done', { freed: info.freedGB.toFixed(2), count: info.trimmedCount })
      );
      showToast('success', t('ram.toast', { freed: info.freedGB.toFixed(2), count: info.trimmedCount }));
    } catch (err) {
      showError('Не удалось очистить память: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }

  function appendRamProgress(text) {
    const log = $('#ramProgressLog');
    const line = document.createElement('div');
    line.textContent = '\u2713 ' + text;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  }

  function wireRamProgress() {
    window.neuroboost.ram.onProgress((event) => {
      if (event.event === 'standby') {
        appendRamProgress(
          event.status === 'purged' ? t('ram.standbyPurged') : t('ram.standbySkipped')
        );
      } else if (event.event === 'trim') {
        appendRamProgress(t('ram.trimmed', { name: event.name }));
      }
    });
  }

  // ---- processes --------------------------------------------------------
  function processTooltip(p) {
    const info = PROCESS_INFO[p.name.toLowerCase()];
    if (info) {
      return (info.critical ? t('process.criticalWarn') : '') + info.d;
    }
    // Fallback for anything not in the dictionary: the executable path is
    // still genuinely useful (e.g. "...AppData\Local\Discord\..." tells you
    // what it is even if the name itself doesn't), so every row gets some
    // tooltip rather than only the ~60 processes we recognize by name.
    return p.path ? t('process.pathPrefix') + p.path : t('process.noDescription', { name: p.name });
  }

  async function refreshProcesses() {
    const btn = $('#processRefreshBtn');
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = t('common.refreshing');
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
      body.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-slate-500 text-sm">' + t('common.nothingFound') + '</td></tr>';
      return;
    }

    procs.forEach((p) => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-white/5 transition-colors';

      const options = PRIORITY_ORDER
        .map((pr) => '<option value="' + pr + '"' + (pr === p.priority ? ' selected' : '') + '>' + priorityLabel(pr) + '</option>')
        .join('');

      const info = PROCESS_INFO[p.name.toLowerCase()];
      const isCritical = !!(info && info.critical);
      const isHeavy = p.cpuPercent >= HEAVY_CPU_THRESHOLD || p.memoryMB >= HEAVY_MEM_MB_THRESHOLD;
      const nameClass = isCritical ? 'text-warn' : isHeavy ? 'text-danger' : 'text-slate-200';
      const tooltip = processTooltip(p);
      const cpuClass = p.cpuPercent >= HEAVY_CPU_THRESHOLD ? 'text-danger font-semibold' : '';
      const memClass = p.memoryMB >= HEAVY_MEM_MB_THRESHOLD ? 'text-danger font-semibold' : '';

      const killBtn = isCritical
        ? '<span class="text-[11px] text-slate-600" title="Критический процесс - завершение недоступно">-</span>'
        : '<button data-kill-pid="' + p.pid + '" data-kill-name="' + escapeHtml(p.name) + '" class="text-[11px] px-2 py-1 rounded-md border border-danger/30 text-danger hover:bg-danger/10 transition-colors" type="button">Завершить</button>';

      tr.innerHTML =
        '<td class="p-4 ' + nameClass + '" title="' + escapeHtml(tooltip) + '">' +
        escapeHtml(p.name) + (isHeavy && !isCritical ? ' <span class="nb-pill nb-pill-danger ml-1">' + t('process.highLoad') + '</span>' : '') +
        '</td>' +
        '<td class="p-4 nb-mono text-slate-500">' + p.pid + '</td>' +
        '<td class="p-4 nb-mono ' + cpuClass + '">' + p.cpuPercent.toFixed(1) + '%</td>' +
        '<td class="p-4 nb-mono ' + memClass + '">' + p.memoryMB.toFixed(0) + ' МБ</td>' +
        '<td class="p-4 text-right">' +
        '<select data-pid="' + p.pid + '" class="bg-neuro-800 border border-white/10 rounded-md px-2 py-1 text-[12px] text-slate-200">' +
        options +
        '</select>' +
        '</td>' +
        '<td class="p-4 text-right">' + killBtn + '</td>';
      body.appendChild(tr);
    });

    $all('select[data-pid]', body).forEach((select) => {
      select.addEventListener('change', async () => {
        const pid = Number(select.dataset.pid);
        const priority = select.value;
        try {
          await call(window.neuroboost.process.setPriority(pid, priority));
          showToast('success', t('process.priorityChanged', { priority: priorityLabel(priority) }));
        } catch (err) {
          showError('Не удалось изменить приоритет: ' + err.message);
        }
      });
    });

    $all('button[data-kill-pid]', body).forEach((btn) => {
      btn.addEventListener('click', async () => {
        const pid = Number(btn.dataset.killPid);
        const name = btn.dataset.killName;
        const confirmed = window.confirm(
          t('process.killConfirm', { name: name, pid: pid })
        );
        if (!confirmed) return;
        btn.disabled = true;
        try {
          const res = await call(window.neuroboost.process.kill(pid, name));
          showToast(
            'success',
            res.method === 'forced' ? t('process.killedForced', { name: name }) : t('process.killedGraceful', { name: name })
          );
          refreshProcesses();
        } catch (err) {
          showError('Не удалось завершить процесс: ' + err.message);
          btn.disabled = false;
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
    const statusBox = $('#autoBoostStatus');
    const statusText = $('#autoBoostStatusText');

    toggle.addEventListener('change', async () => {
      if (toggle.dataset.busy === '1') return;
      toggle.dataset.busy = '1';
      const wantRunning = toggle.checked;
      try {
        if (wantRunning) {
          await call(window.neuroboost.process.autoBoostStart({ intervalMs: 8000 }));
          state.autoBoostRunning = true;
          statusBox.classList.remove('hidden');
          statusText.textContent = t('autoboost.monitoring');
          showToast('success', t('autoboost.on'));
        } else {
          await call(window.neuroboost.process.autoBoostStop());
          state.autoBoostRunning = false;
          statusBox.classList.add('hidden');
          showToast('info', t('autoboost.off'));
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
        line.textContent = '[' + time + '] ' + t('autoboost.logBoosted', { name: event.name, cpu: event.cpuPercent.toFixed(0) });
        statusText.textContent = t('autoboost.boosting', { name: event.name, cpu: event.cpuPercent.toFixed(0) });
        showToast('success', t('autoboost.toast', { name: event.name }));
        if (state.view === 'processes') refreshProcesses();
      } else if (event.type === 'holding') {
        statusText.textContent = t('autoboost.boosted', { name: event.name, cpu: event.cpuPercent.toFixed(0) });
        return; // no log line - this fires every tick while steady, would spam the log
      } else if (event.type === 'idle') {
        statusText.textContent = event.topName
          ? t('autoboost.normal', { name: event.topName, cpu: event.topCpu.toFixed(0) })
          : t('autoboost.normalNoTop');
        return; // routine status, not worth a log line every tick
      } else if (event.type === 'error') {
        line.textContent = '[' + time + '] ' + event.message;
        line.classList.add('text-danger');
      }
      log.prepend(line);
      while (log.children.length > 20) log.removeChild(log.lastChild);
    });
  }

  // scan-disk.ps1 returns plain-ASCII ids only (same reasoning as the
  // telemetry keys) - labels live here.
  const diskCategoryLabel = (id) => t('disk.' + id);

  // ---- helpers: bytes formatting -----------------------------------------
  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 МБ';
    const mb = bytes / 1024 / 1024;
    if (mb >= 1024) return (mb / 1024).toFixed(2) + ' ГБ';
    return mb.toFixed(0) + ' МБ';
  }

  // ---- startup ------------------------------------------------------------
  async function loadStartupItems() {
    const list = $('#startupList');
    list.innerHTML = '<div class="py-6 text-center text-[12px] text-slate-500">' + t('startup.scanning') + '</div>';
    try {
      const items = await call(window.neuroboost.startup.list());
      state.startupItems = items;
      renderStartupList();
    } catch (err) {
      list.innerHTML = '';
      showError('Не удалось получить список автозагрузки: ' + err.message);
    }
  }

  function renderStartupList() {
    const list = $('#startupList');
    list.innerHTML = '';

    if (state.startupItems.length === 0) {
      list.innerHTML = '<div class="py-6 text-center text-[12px] text-slate-500">' + t('startup.none') + '</div>';
      return;
    }

    state.startupItems.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'glass-card rounded-xl p-4 flex items-center gap-4';
      row.innerHTML =
        '<div class="flex-1 min-w-0">' +
        '<div class="text-[13px] text-slate-200 truncate">' + escapeHtml(item.name) + '</div>' +
        '<div class="text-[11px] text-slate-500 truncate font-mono" title="' + escapeHtml(item.command) + '">' + escapeHtml(item.command) + '</div>' +
        '</div>' +
        '<div class="relative inline-block w-11 h-6 shrink-0">' +
        '<input type="checkbox" id="su-' + escapeHtml(item.id) + '" class="nb-toggle-input" data-startup-id="' + escapeHtml(item.id) + '"' + (item.enabled ? ' checked' : '') + ' />' +
        '<label for="su-' + escapeHtml(item.id) + '" class="nb-toggle-label"></label>' +
        '</div>';
      list.appendChild(row);
    });

    $all('input[data-startup-id]', list).forEach((input) => {
      input.addEventListener('change', async () => {
        const id = input.dataset.startupId;
        const enabled = input.checked;
        input.disabled = true;
        try {
          await call(window.neuroboost.startup.toggle(id, enabled));
          showToast('success', enabled ? t('startup.enabled') : t('startup.disabled'));
        } catch (err) {
          input.checked = !enabled;
          showError('Не удалось изменить автозагрузку: ' + err.message);
        } finally {
          input.disabled = false;
        }
      });
    });
  }

  // ---- disk cleanup ---------------------------------------------------------
  async function loadDiskCategories() {
    const list = $('#diskList');
    list.innerHTML = '<div class="col-span-2 py-6 text-center text-[12px] text-slate-500">' + t('disk.scanning') + '</div>';
    try {
      const categories = await call(window.neuroboost.disk.scan());
      state.diskCategories = categories;
      state.diskSelected.clear();
      renderDiskList();
      updateDiskCleanButton();
    } catch (err) {
      list.innerHTML = '';
      showError('Не удалось просканировать диск: ' + err.message);
    }
  }

  function renderDiskList() {
    const list = $('#diskList');
    list.innerHTML = '';

    state.diskCategories.forEach((cat) => {
      const card = document.createElement('label');
      card.className = 'glass-card rounded-xl p-4 flex items-center gap-3 cursor-pointer';
      card.innerHTML =
        '<span class="flex-1 min-w-0">' +
        '<span class="block text-[13px] text-slate-200">' + escapeHtml(diskCategoryLabel(cat.id)) + '</span>' +
        '<span class="block text-[12px] text-cyan nb-mono mt-0.5">' + formatBytes(cat.sizeBytes) + '</span>' +
        '</span>' +
        '<input type="checkbox" class="h-4 w-4 accent-cyan shrink-0" data-disk-id="' + escapeHtml(cat.id) + '" ' + (cat.sizeBytes > 0 ? '' : 'disabled') + ' />';
      list.appendChild(card);
    });

    $all('input[data-disk-id]', list).forEach((cb) => {
      cb.addEventListener('change', () => {
        if (cb.checked) state.diskSelected.add(cb.dataset.diskId);
        else state.diskSelected.delete(cb.dataset.diskId);
        updateDiskCleanButton();
      });
    });
  }

  function updateDiskCleanButton() {
    const selectedBytes = state.diskCategories
      .filter((c) => state.diskSelected.has(c.id))
      .reduce((sum, c) => sum + c.sizeBytes, 0);
    $('#diskCleanBtn').disabled = state.diskSelected.size === 0;
    $('#diskSelectedSize').textContent = state.diskSelected.size > 0 ? t('disk.willFree', { size: formatBytes(selectedBytes) }) : '';
  }

  function diskCategoryName(id) {
    return diskCategoryLabel(id);
  }

  async function runDiskClean() {
    const ids = Array.from(state.diskSelected);
    if (ids.length === 0) return;

    const btn = $('#diskCleanBtn');
    btn.disabled = true;
    const progressCard = $('#diskProgressCard');
    const progressLog = $('#diskProgressLog');
    progressLog.innerHTML = '';
    progressCard.classList.remove('hidden');

    try {
      const summary = await call(window.neuroboost.disk.clean(ids));
      showToast('success', t('disk.freed', { size: formatBytes(summary.freedBytes) }));
      await loadDiskCategories();
    } catch (err) {
      showError('Не удалось очистить диск: ' + err.message);
    } finally {
      btn.disabled = state.diskSelected.size === 0;
    }
  }

  function wireDiskProgress() {
    window.neuroboost.disk.onProgress((event) => {
      if (event.event === 'category') {
        const line = document.createElement('div');
        line.textContent = '\u2713 ' + t('disk.categoryFreed', { name: diskCategoryName(event.id), size: formatBytes(event.freedBytes) });
        $('#diskProgressLog').appendChild(line);
      }
    });
  }

  async function loadAppVersion() {
    try {
      const version = await window.neuroboost.getVersion();
      $('#appVersion').textContent = version;
    } catch (_) {
      $('#appVersion').textContent = '—';
    }
  }

  // ---- settings ------------------------------------------------------------
  async function loadSettings() {
    try {
      const settings = await call(window.neuroboost.settings.get());
      state.settings = settings;
      renderSettings();
    } catch (err) {
      showError('Не удалось загрузить настройки: ' + err.message);
    }
  }

  function renderSettings() {
    const s = state.settings;
    if (!s) return;
    $('#settingStartWithWindows').checked = !!s.startWithWindows;
    // Verify against the actual scheduled task - the stored flag can drift
    // if the task was removed outside NeuroBoost.
    window.neuroboost.settings
      .autostartStatus()
      .then((r) => {
        if (r && r.ok) $('#settingStartWithWindows').checked = !!r.data;
      })
      .catch(() => {});
    $('#settingMinimizeToTray').checked = !!s.minimizeToTray;
    $('#settingCpuThreshold').value = s.autoBoostCpuThreshold;
    $('#settingCpuThresholdValue').textContent = s.autoBoostCpuThreshold + '%';
    $('#settingCustomApps').value = (s.customHeavyApps || []).join(', ');
    $('#settingLanguage').value = s.language || 'ru';

    // Auto-Boost may already be running (e.g. main process auto-started it
    // on launch because it was on last session) - reflect that here.
    if (s.autoBoostEnabledOnLaunch) {
      state.autoBoostRunning = true;
      $('#autoBoostToggle').checked = true;
      $('#autoBoostStatus').classList.remove('hidden');
      $('#autoBoostStatusText').textContent = t('autoboost.monitoring');
    }
  }

  function wireSettings() {
    $('#settingCpuThreshold').addEventListener('input', (e) => {
      $('#settingCpuThresholdValue').textContent = e.target.value + '%';
    });

    $('#settingLanguage').addEventListener('change', async (e) => {
      const lang = e.target.value;
      setLocale(lang);
      applyLanguage();
      try {
        state.settings = await call(window.neuroboost.settings.update({ language: lang }));
      } catch (err) {
        showError(err.message);
      }
    });

    $('#openLogsBtn').addEventListener('click', async () => {
      try {
        await window.neuroboost.logs.reveal();
      } catch (err) {
        showError(err.message);
      }
    });

    $('#settingStartWithWindows').addEventListener('change', async (e) => {
      try {
        state.settings = await call(window.neuroboost.settings.update({ startWithWindows: e.target.checked }));
        showToast('success', e.target.checked ? t('settings.startupOn') : t('settings.startupOff'));
      } catch (err) {
        e.target.checked = !e.target.checked;
        showError('Не удалось сохранить настройку: ' + err.message);
      }
    });

    $('#settingMinimizeToTray').addEventListener('change', async (e) => {
      try {
        state.settings = await call(window.neuroboost.settings.update({ minimizeToTray: e.target.checked }));
        showToast('success', t('settings.saved'));
      } catch (err) {
        e.target.checked = !e.target.checked;
        showError('Не удалось сохранить настройку: ' + err.message);
      }
    });

    $('#settingsSaveBtn').addEventListener('click', async () => {
      const btn = $('#settingsSaveBtn');
      btn.disabled = true;
      try {
        const threshold = Number($('#settingCpuThreshold').value);
        const customApps = $('#settingCustomApps').value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        state.settings = await call(
          window.neuroboost.settings.update({ autoBoostCpuThreshold: threshold, customHeavyApps: customApps })
        );
        showToast('success', t('settings.autoBoostSaved'));
      } catch (err) {
        showError('Не удалось сохранить настройки: ' + err.message);
      } finally {
        btn.disabled = false;
      }
    });
  }

  /**
   * Re-applies the current locale to both the static markup (data-i18n) and
   * anything already rendered dynamically, so switching language takes
   * effect immediately without a restart.
   */
  function applyLanguage() {
    applyStaticTranslations();
    document.documentElement.lang = window.NeuroBoostI18n.getLocale();
    $('#page-title').textContent = pageTitle(state.view);
    renderTelemetryStatus();
    if (state.debloatCatalog.length) renderDebloatList();
    if (state.diskCategories.length) {
      renderDiskList();
      updateDiskCleanButton();
    }
    if (state.allProcesses.length) renderProcessTable(filterProcesses());
  }

  // ---- onboarding ---------------------------------------------------------
  function wireOnboarding() {
    const overlay = $('#onboarding');
    const closeBtn = $('#onboardingCloseBtn');

    const close = async () => {
      overlay.classList.add('hidden');
      overlay.classList.remove('flex');
      try {
        state.settings = await call(window.neuroboost.settings.update({ onboardingSeen: true }));
      } catch (_) {
        /* not worth bothering the user about */
      }
    };

    closeBtn.addEventListener('click', close);
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
  }

  function maybeShowOnboarding() {
    if (state.settings && !state.settings.onboardingSeen) {
      const overlay = $('#onboarding');
      overlay.classList.remove('hidden');
      overlay.classList.add('flex');
      $('#onboardingCloseBtn').focus();
    }
  }

  // ---- keyboard navigation --------------------------------------------------
  function wireKeyboardNav() {
    // Ctrl+1..8 jumps between sections - a system tool gets used repeatedly,
    // and reaching for the mouse every time is friction.
    const views = ['overview', 'debloat', 'telemetry', 'ram', 'processes', 'startup', 'disk', 'settings'];
    document.addEventListener('keydown', (e) => {
      if (!e.ctrlKey || e.altKey || e.metaKey) return;
      const idx = Number(e.key) - 1;
      if (idx >= 0 && idx < views.length) {
        e.preventDefault();
        switchView(views[idx]);
      }
    });

    // Make the nav a proper tablist for screen readers.
    $all('.nb-nav-item').forEach((btn) => {
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', String(btn.classList.contains('is-active')));
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
    wireRamProgress();
    wireDiskProgress();
    wireSettings();
    wireOnboarding();
    wireKeyboardNav();

    $('#debloatRemoveBtn').addEventListener('click', runDebloatRemoval);
    $('#debloatRescanBtn').addEventListener('click', loadDebloatCatalog);
    $('#telemetryApplyBtn').addEventListener('click', applyTelemetry);
    $('#telemetryRestoreBtn').addEventListener('click', restoreTelemetry);
    $('#btn-purge').addEventListener('click', purgeStandbyList);
    $('#processRefreshBtn').addEventListener('click', refreshProcesses);
    $('#startupRefreshBtn').addEventListener('click', loadStartupItems);
    $('#diskRescanBtn').addEventListener('click', loadDiskCategories);
    $('#diskCleanBtn').addEventListener('click', runDiskClean);

    window.neuroboost.debloat.onProgress(appendDebloatProgress);

    loadSystemInfo().then(() => {
      loadDebloatCatalog();
      loadTelemetryStatus();
      loadOverview();
      loadMemoryInfo();
      loadSettings().then(() => {
        if (state.settings && state.settings.language) {
          setLocale(state.settings.language);
          applyLanguage();
        }
        maybeShowOnboarding();
      });
      loadAppVersion();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
