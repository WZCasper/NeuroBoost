'use strict';

/**
 * Minimal i18n layer. Strings live here instead of being hardcoded across
 * index.html and renderer.js, so adding a language is a matter of adding
 * one object below rather than hunting through markup and logic.
 *
 * Markup opts in with data-i18n="key" (textContent) or
 * data-i18n-placeholder="key". Dynamic strings go through t('key', {...}),
 * where {placeholders} are substituted.
 */

const LOCALES = {
  ru: {
    'nav.overview': 'Обзор',
    'nav.debloat': 'Приложения',
    'nav.telemetry': 'Телеметрия',
    'nav.ram': 'Память',
    'nav.processes': 'Процессы',
    'nav.startup': 'Автозагрузка',
    'nav.disk': 'Диск',
    'nav.settings': 'Настройки',

    'page.overview': 'Обзор системы',
    'page.debloat': 'Управление приложениями',
    'page.telemetry': 'Телеметрия и конфиденциальность',
    'page.ram': 'Оптимизация памяти',
    'page.processes': 'Диспетчер процессов',
    'page.startup': 'Автозагрузка',
    'page.disk': 'Очистка диска',
    'page.settings': 'Настройки',

    'common.refresh': 'Обновить',
    'common.refreshing': 'Обновление...',
    'common.rescan': 'Пересканировать',
    'common.admin': 'Администратор',
    'common.notElevated': 'Без повышенных прав',
    'common.unknownError': 'Неизвестная ошибка',
    'common.somethingWrong': 'Что-то пошло не так.',
    'common.osUnsupported': 'ОС не поддерживается',
    'common.selected': 'Выбрано:',
    'common.save': 'Сохранить настройки',
    'common.nothingFound': 'Ничего не найдено',

    'priority.Idle': 'Простой',
    'priority.BelowNormal': 'Ниже среднего',
    'priority.Normal': 'Обычный',
    'priority.AboveNormal': 'Выше среднего',
    'priority.High': 'Высокий',

    'telemetry.core_telemetry': 'Диагностические данные',
    'telemetry.advertising_id': 'Рекламный идентификатор',
    'telemetry.cortana': 'Кортана',
    'telemetry.widgets': 'Виджеты',
    'telemetry.copilot': 'Copilot',
    'telemetry.service_DiagTrack': 'Служба DiagTrack',
    'telemetry.service_dmwappushservice': 'Служба dmwappushservice',
    'telemetry.configured': 'Настроено',
    'telemetry.notConfigured': 'Не настроено',
    'telemetry.applied': 'Настройки телеметрии применены ({count})',
    'telemetry.restored': 'Настройки телеметрии восстановлены',
    'telemetry.partial': 'Применено: {changed}, не удалось: {failed}',
    'telemetry.failedList': 'Не применилось: {list}. Остальное применено успешно.',

    'disk.temp_user': 'Временные файлы пользователя',
    'disk.temp_system': 'Временные файлы Windows',
    'disk.recycle_bin': 'Корзина',
    'disk.update_cache': 'Кэш центра обновления Windows',
    'disk.delivery_opt': 'Кэш оптимизации доставки',
    'disk.error_reports': 'Отчёты об ошибках Windows',
    'disk.chrome_cache': 'Кэш браузера Chrome',
    'disk.edge_cache': 'Кэш браузера Edge',
    'disk.scanning': 'Подсчёт размера временных файлов...',
    'disk.willFree': 'Будет освобождено: {size}',
    'disk.freed': 'Освобождено: {size}',
    'disk.categoryFreed': '{name}: освобождено {size}',

    'ram.purging': 'Очистка...',
    'ram.standbyPurged': 'Список ожидания освобождён',
    'ram.standbySkipped': 'Список ожидания: пропущено (недостаточно прав)',
    'ram.trimmed': 'Очищен рабочий набор: {name}.exe',
    'ram.done': 'Готово: освобождено {freed} ГБ, обработано процессов: {count}',
    'ram.toast': 'Освобождено {freed} ГБ · очищено процессов: {count}',

    'debloat.scanning': 'Сканирование установленных приложений...',
    'debloat.none': 'Не найдено приложений, которые можно безопасно удалить.',
    'debloat.insist': 'настоятельно рекомендуется',
    'debloat.suggest': 'можно удалить',
    'debloat.removed': 'удалено',
    'debloat.failed': 'ошибка',
    'debloat.removing': 'удаление...',
    'debloat.result': 'Удалено приложений: {removed} из {total}',

    'startup.scanning': 'Сканирование автозагрузки...',
    'startup.none': 'Программ в автозагрузке не найдено.',
    'startup.enabled': 'Включено в автозагрузке',
    'startup.disabled': 'Отключено из автозагрузки',

    'autoboost.on': 'Авто-ускорение включено — проверка каждые 8 секунд',
    'autoboost.off': 'Авто-ускорение выключено, приоритеты возвращены',
    'autoboost.monitoring': 'Мониторинг нагрузки...',
    'autoboost.boosting': '⚡ Ускоряется: {name}.exe ({cpu}% ЦП)',
    'autoboost.boosted': '⚡ Ускорено: {name}.exe ({cpu}% ЦП)',
    'autoboost.normal': 'Нагрузка в норме (максимум: {name}.exe, {cpu}% ЦП)',
    'autoboost.normalNoTop': 'Нагрузка в норме',

    'autoboost.logBoosted': 'Повышен приоритет: {name}.exe ({cpu}% ЦП) → Высокий',
    'autoboost.toast': 'Авто-ускорение: {name}.exe → Высокий приоритет',
    'process.killConfirm': 'Завершить процесс "{name}.exe" (PID {pid})?\n\nНесохранённые данные в этой программе будут потеряны.',
    'restorePoint.created': 'Перед изменениями создана точка восстановления Windows',
    'settings.saved': 'Настройки сохранены',
    'settings.autoBoostSaved': 'Настройки Авто-ускорения сохранены',
    'settings.startupOn': 'Автозапуск с Windows включён',
    'settings.startupOff': 'Автозапуск с Windows выключен',
    'process.priorityChanged': 'Приоритет изменён: {priority}',
    'process.killed': 'Процесс {name}.exe завершён',
    'process.criticalWarn': '⚠️ Критический системный процесс. ',
    'process.pathPrefix': 'Путь: ',
    'process.noDescription': 'Процесс: {name}.exe (нет описания в базе)',
    'process.highLoad': 'высокая нагрузка'
  },

  en: {
    'nav.overview': 'Overview',
    'nav.debloat': 'Apps',
    'nav.telemetry': 'Telemetry',
    'nav.ram': 'Memory',
    'nav.processes': 'Processes',
    'nav.startup': 'Startup',
    'nav.disk': 'Disk',
    'nav.settings': 'Settings',

    'page.overview': 'System overview',
    'page.debloat': 'App management',
    'page.telemetry': 'Telemetry & privacy',
    'page.ram': 'Memory optimization',
    'page.processes': 'Process manager',
    'page.startup': 'Startup programs',
    'page.disk': 'Disk cleanup',
    'page.settings': 'Settings',

    'common.refresh': 'Refresh',
    'common.refreshing': 'Refreshing...',
    'common.rescan': 'Rescan',
    'common.admin': 'Administrator',
    'common.notElevated': 'Not elevated',
    'common.unknownError': 'Unknown error',
    'common.somethingWrong': 'Something went wrong.',
    'common.osUnsupported': 'Unsupported OS',
    'common.selected': 'Selected:',
    'common.save': 'Save settings',
    'common.nothingFound': 'Nothing found',

    'priority.Idle': 'Idle',
    'priority.BelowNormal': 'Below normal',
    'priority.Normal': 'Normal',
    'priority.AboveNormal': 'Above normal',
    'priority.High': 'High',

    'telemetry.core_telemetry': 'Diagnostic data',
    'telemetry.advertising_id': 'Advertising ID',
    'telemetry.cortana': 'Cortana',
    'telemetry.widgets': 'Widgets',
    'telemetry.copilot': 'Copilot',
    'telemetry.service_DiagTrack': 'DiagTrack service',
    'telemetry.service_dmwappushservice': 'dmwappushservice',
    'telemetry.configured': 'Configured',
    'telemetry.notConfigured': 'Not configured',
    'telemetry.applied': 'Telemetry settings applied ({count})',
    'telemetry.restored': 'Telemetry settings restored',
    'telemetry.partial': 'Applied: {changed}, failed: {failed}',
    'telemetry.failedList': 'Failed: {list}. Everything else applied successfully.',

    'disk.temp_user': 'User temporary files',
    'disk.temp_system': 'Windows temporary files',
    'disk.recycle_bin': 'Recycle Bin',
    'disk.update_cache': 'Windows Update cache',
    'disk.delivery_opt': 'Delivery Optimization cache',
    'disk.error_reports': 'Windows error reports',
    'disk.chrome_cache': 'Chrome browser cache',
    'disk.edge_cache': 'Edge browser cache',
    'disk.scanning': 'Measuring temporary files...',
    'disk.willFree': 'Will free: {size}',
    'disk.freed': 'Freed: {size}',
    'disk.categoryFreed': '{name}: freed {size}',

    'ram.purging': 'Cleaning...',
    'ram.standbyPurged': 'Standby list purged',
    'ram.standbySkipped': 'Standby list: skipped (insufficient rights)',
    'ram.trimmed': 'Working set trimmed: {name}.exe',
    'ram.done': 'Done: freed {freed} GB, processes handled: {count}',
    'ram.toast': 'Freed {freed} GB · processes cleaned: {count}',

    'debloat.scanning': 'Scanning installed apps...',
    'debloat.none': 'No apps found that can be safely removed.',
    'debloat.insist': 'strongly recommended',
    'debloat.suggest': 'can be removed',
    'debloat.removed': 'removed',
    'debloat.failed': 'error',
    'debloat.removing': 'removing...',
    'debloat.result': 'Apps removed: {removed} of {total}',

    'startup.scanning': 'Scanning startup programs...',
    'startup.none': 'No startup programs found.',
    'startup.enabled': 'Enabled at startup',
    'startup.disabled': 'Disabled at startup',

    'autoboost.on': 'Auto-Boost enabled — checking every 8 seconds',
    'autoboost.off': 'Auto-Boost disabled, priorities restored',
    'autoboost.monitoring': 'Monitoring load...',
    'autoboost.boosting': '⚡ Boosting: {name}.exe ({cpu}% CPU)',
    'autoboost.boosted': '⚡ Boosted: {name}.exe ({cpu}% CPU)',
    'autoboost.normal': 'Load is normal (top: {name}.exe, {cpu}% CPU)',
    'autoboost.normalNoTop': 'Load is normal',

    'autoboost.logBoosted': 'Priority raised: {name}.exe ({cpu}% CPU) → High',
    'autoboost.toast': 'Auto-Boost: {name}.exe → High priority',
    'process.killConfirm': 'Terminate process "{name}.exe" (PID {pid})?\n\nUnsaved data in this program will be lost.',
    'restorePoint.created': 'A Windows restore point was created before the changes',
    'settings.saved': 'Settings saved',
    'settings.autoBoostSaved': 'Auto-Boost settings saved',
    'settings.startupOn': 'Start with Windows enabled',
    'settings.startupOff': 'Start with Windows disabled',
    'process.priorityChanged': 'Priority changed: {priority}',
    'process.killed': 'Process {name}.exe terminated',
    'process.criticalWarn': '⚠️ Critical system process. ',
    'process.pathPrefix': 'Path: ',
    'process.noDescription': 'Process: {name}.exe (no description available)',
    'process.highLoad': 'high load'
  }
};

let currentLocale = 'ru';

function setLocale(locale) {
  if (LOCALES[locale]) currentLocale = locale;
}

function getLocale() {
  return currentLocale;
}

function t(key, params) {
  const table = LOCALES[currentLocale] || LOCALES.ru;
  let str = table[key];
  if (str === undefined) str = (LOCALES.ru && LOCALES.ru[key]) !== undefined ? LOCALES.ru[key] : key;
  if (params) {
    Object.keys(params).forEach((k) => {
      str = str.split('{' + k + '}').join(String(params[k]));
    });
  }
  return str;
}

/** Applies translations to any element carrying a data-i18n* attribute. */
function applyStaticTranslations(root) {
  const scope = root || document;
  scope.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  scope.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
}

window.NeuroBoostI18n = { t, setLocale, getLocale, applyStaticTranslations, LOCALES };
