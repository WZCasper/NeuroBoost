'use strict';

const path = require('path');
const { runPowerShellFile } = require('./powershell-runner');
const { scriptsDir } = require('./paths');

// The renderer only ever sends an `id`. Real AppX package names live here,
// server-side, so a compromised or buggy renderer can never inject an
// arbitrary package name into a PowerShell call.
const CATALOG = [
  { id: 'threedbuilder', name: '3D Builder', pkg: 'Microsoft.3DBuilder', risk: 'safe' },
  { id: 'mixedreality', name: 'Смешанная реальность (Mixed Reality Portal)', pkg: 'Microsoft.MixedReality.Portal', risk: 'safe' },
  { id: 'bingweather', name: 'Погода', pkg: 'Microsoft.BingWeather', risk: 'safe' },
  { id: 'bingnews', name: 'Новости', pkg: 'Microsoft.BingNews', risk: 'safe' },
  { id: 'getstarted', name: 'Советы / Приступая к работе', pkg: 'Microsoft.Getstarted', risk: 'safe' },
  { id: 'officehub', name: 'Мой Office (Office Hub)', pkg: 'Microsoft.MicrosoftOfficeHub', risk: 'safe' },
  { id: 'solitaire', name: 'Microsoft Solitaire Collection (пасьянсы)', pkg: 'Microsoft.MicrosoftSolitaireCollection', risk: 'safe' },
  { id: 'people', name: 'Люди', pkg: 'Microsoft.People', risk: 'safe' },
  { id: 'feedbackhub', name: 'Центр отзывов', pkg: 'Microsoft.WindowsFeedbackHub', risk: 'safe' },
  { id: 'zunemusic', name: 'Groove Музыка', pkg: 'Microsoft.ZuneMusic', risk: 'safe' },
  { id: 'zunevideo', name: 'Кино и ТВ', pkg: 'Microsoft.ZuneVideo', risk: 'safe' },
  { id: 'skypeapp', name: 'Skype (UWP)', pkg: 'Microsoft.SkypeApp', risk: 'safe' },
  { id: 'poweraut', name: 'Power Automate Desktop', pkg: 'Microsoft.PowerAutomateDesktop', risk: 'safe' },
  { id: 'clipchamp', name: 'Clipchamp', pkg: 'Clipchamp.Clipchamp', risk: 'safe' },
  { id: 'xboxoverlay', name: 'Игровая панель Xbox (Game Bar)', pkg: 'Microsoft.XboxGamingOverlay', risk: 'optional' },
  { id: 'xboxapp', name: 'Приложение Xbox', pkg: 'Microsoft.GamingApp', risk: 'optional' },
  { id: 'yourphone', name: 'Связь с телефоном (Phone Link)', pkg: 'Microsoft.YourPhone', risk: 'optional' },
  { id: 'cortana', name: 'Кортана', pkg: 'Microsoft.549981C3F5F10', risk: 'optional', win10Only: true }
];

// Hard block, checked even if a bad id somehow reaches this function —
// these must never be removable through NeuroBoost.
const PROTECTED_SUBSTRINGS = [
  'WindowsStore',
  'Microsoft.Windows.ShellExperienceHost',
  'Microsoft.Windows.StartMenuExperienceHost',
  'Microsoft.WindowsCalculator',
  'SecHealthUI',
  'Microsoft.Windows.SecureAssessmentBrowser'
];

function listRemovableApps() {
  return CATALOG.map(({ id, name, risk, win10Only }) => ({
    id,
    name,
    risk,
    win10Only: !!win10Only
  }));
}

async function removeApps(ids, onProgress) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('No apps selected.');
  }

  const entries = ids
    .map((id) => CATALOG.find((c) => c.id === id))
    .filter(Boolean)
    .filter((c) => !PROTECTED_SUBSTRINGS.some((p) => c.pkg.includes(p)));

  if (entries.length === 0) {
    throw new Error('None of the selected apps were recognized.');
  }

  const scriptPath = path.join(scriptsDir(), 'remove-appx.ps1');
  const results = [];

  for (const entry of entries) {
    if (onProgress) onProgress({ id: entry.id, name: entry.name, status: 'running' });
    try {
      await runPowerShellFile(scriptPath, ['-PackageName', entry.pkg], 45000);
      results.push({ id: entry.id, name: entry.name, status: 'removed' });
      if (onProgress) onProgress({ id: entry.id, name: entry.name, status: 'removed' });
    } catch (err) {
      results.push({ id: entry.id, name: entry.name, status: 'failed', error: err.message });
      if (onProgress) {
        onProgress({ id: entry.id, name: entry.name, status: 'failed', error: err.message });
      }
    }
  }

  return results;
}

module.exports = { listRemovableApps, removeApps };
