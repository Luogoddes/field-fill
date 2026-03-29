/**
 * background.js — Service Worker
 * 字段填充 · Universal Field Filler v4.3
 * 洛 - 愿执一生笔，画汝眉上柳...
 *
 * ★ v4.3 修复：
 *   - 右键菜单 title 不能含 emoji，改为纯文字（emoji 导致创建失败）
 *   - 右键菜单在 onInstalled + onStartup 双重注册确保生效
 *   - 新增 pickerHover 消息：content.js 实时发回悬停元素信息，存入 storage 供 popup 轮询
 */
'use strict';

// ══════════════════════════════════════════════
//  Default Profile
// ══════════════════════════════════════════════
const DEFAULT_PROFILE = {
  id: 'profile-default', name: 'Redmine', isActive: true, tags: ['redmine'],
  fields: [
    { id:'field-soc',      name:'SoC 版本',    selector:'#issue_custom_field_values_1102', type:'text',   fullWidth:0 },
    { id:'field-mcu',      name:'MCU 版本',    selector:'#issue_custom_field_values_1103', type:'text',   fullWidth:0 },
    { id:'field-unified',  name:'统合版本',     selector:'#issue_custom_field_values_1101', type:'text',   fullWidth:0 },
    { id:'field-subject',  name:'主题',         selector:'#issue_subject',                  type:'text',   fullWidth:1 },
    { id:'field-phase',    name:'测试实施阶段', selector:'#issue_custom_field_values_1569', type:'select', fullWidth:0 },
    { id:'field-func',     name:'功能分类',     selector:'#issue_custom_field_values_1552', type:'select', fullWidth:0 },
    { id:'field-level',    name:'等级',         selector:'#issue_custom_field_values_45',   type:'select', fullWidth:0 },
    { id:'field-target',   name:'解决节点',     selector:'#issue_custom_field_values_1565', type:'select', fullWidth:0 },
    { id:'field-activity', name:'测试活动分类', selector:'#issue_custom_field_values_157',  type:'select', fullWidth:0 },
  ],
  presets: []
};

// ══════════════════════════════════════════════
//  Fill Helper (hotkey & context menu)
// ══════════════════════════════════════════════
async function doFillActiveProfile(tabId) {
  const { profiles } = await chrome.storage.local.get('profiles');
  const active = (profiles || []).find(p => p.isActive) || profiles?.[0];
  if (!active) return false;
  const preset = active.presets.find(p => p.isDefault) || active.presets[0];
  if (!preset) return false;
  const fieldMap = {};
  (active.fields || []).forEach(f => { fieldMap[f.id] = { selector: f.selector, type: f.type }; });
  try { await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }); } catch (_) {}
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'fillDirect', config: preset.data, fieldMap });
    return true;
  } catch (e) { console.warn('[UFF] fill failed:', e.message); return false; }
}

// ══════════════════════════════════════════════
//  Context Menu — plain text title only (no emoji), use 'all' contexts
// ══════════════════════════════════════════════
async function setupContextMenu() {
  const { contextMenuEnabled = true } = await chrome.storage.local.get('contextMenuEnabled');
  chrome.contextMenus.removeAll(() => {
    if (contextMenuEnabled) {
      chrome.contextMenus.create({
        id: 'uff-fill',
        title: '字段填充',
        contexts: ['all']   // 'all' ensures it shows on right-click anywhere
      }, () => {
        if (chrome.runtime.lastError) {
          console.error('[UFF] menu create error:', chrome.runtime.lastError.message);
        }
      });
    }
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === 'uff-fill') {
    await doFillActiveProfile(tab.id);
  }
});

// ══════════════════════════════════════════════
//  Install / Update / Startup
// ══════════════════════════════════════════════
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await setupContextMenu();
  if (reason === 'install') {
    await chrome.storage.local.set({ profiles: [DEFAULT_PROFILE], theme: 'auto', contextMenuEnabled: true });
    console.log('[UFF] v4.3 installed');
  } else if (reason === 'update') {
    await migrateData();
    console.log('[UFF] v4.3 updated');
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await setupContextMenu();
});

// ══════════════════════════════════════════════
//  Data Migration
// ══════════════════════════════════════════════
async function migrateData() {
  const data = await chrome.storage.local.get(['profiles', 'fieldConfig', 'presets', 'currentConfig']);
  if (data.profiles?.length) return;
  const profile = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
  if (data.fieldConfig?.length) {
    profile.fields = data.fieldConfig.map(f => ({
      id: f.id || 'f-' + Math.random().toString(36).slice(2),
      name: f.name || f.id, selector: f.selector, type: f.type || 'text', fullWidth: 0
    }));
  }
  if (data.presets?.length) {
    profile.presets = data.presets.map(p => ({
      id: 'preset-' + Date.now() + Math.random().toString(36).slice(2),
      name: p.name, data: p.data || p.config || {},
      tags: [], isDefault: p.isDefault || false, createdAt: p.createdAt || Date.now()
    }));
  }
  if (data.currentConfig && Object.keys(data.currentConfig).length && !profile.presets.some(p => p.isDefault)) {
    profile.presets.unshift({
      id: 'preset-migrated', name: '迁移的配置',
      data: data.currentConfig, tags: [], isDefault: true, createdAt: Date.now()
    });
  }
  await chrome.storage.local.set({ profiles: [profile], contextMenuEnabled: true });
}

// ══════════════════════════════════════════════
//  Hotkey
// ══════════════════════════════════════════════
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'quick-fill') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) await doFillActiveProfile(tab.id);
});

// ══════════════════════════════════════════════
//  Message Router
// ══════════════════════════════════════════════
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // Real-time hover picker: content sends element info → stored for popup to poll
  if (msg.action === 'pickerHover') {
    chrome.storage.local.set({
      __pickerHover: { selector: msg.selector, type: msg.type, label: msg.label, ts: Date.now() }
    });
    sendResponse({ ok: true });
    return true;
  }

  // Picker ended
  if (msg.action === 'pickerEnd') {
    chrome.storage.local.remove('__pickerHover');
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'rebuildMenu') {
    setupContextMenu();
    sendResponse({ ok: true });
    return true;
  }

  // Check for updates (called from IO panel)
  if (msg.action === 'checkUpdate') {
    // Chrome handles updates automatically via github_url in manifest.
    // We expose the current version so popup can compare with a remote version file.
    sendResponse({ version: chrome.runtime.getManifest().version });
    return true;
  }

  if (msg.action === 'getProfiles') {
    chrome.storage.local.get('profiles', ({ profiles }) => sendResponse({ profiles: profiles || [] }));
    return true;
  }
  if (msg.action === 'saveProfiles') {
    chrome.storage.local.set({ profiles: msg.profiles }, () => sendResponse({ ok: true }));
    return true;
  }
  if (msg.action === 'getTheme') {
    chrome.storage.local.get('theme', ({ theme }) => sendResponse({ theme: theme || 'auto' }));
    return true;
  }
  if (msg.action === 'saveTheme') {
    chrome.storage.local.set({ theme: msg.theme }, () => sendResponse({ ok: true }));
    return true;
  }
});
