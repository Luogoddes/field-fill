/**
 * background.js — Service Worker
 * 字段填充 · Universal Field Filler v1.4.5
 * 洛 - 愿执一生笔，画汝眉上柳...
 *
 * ★ v1.4.5 修复：
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
  sharedValues: {},
  presets: []
};

// ══════════════════════════════════════════════
//  Shared Field Resolution
// ══════════════════════════════════════════════
function resolveSharedValues(config, sharedValues) {
  if (!config || typeof config !== 'object') return config;
  const resolved = {};
  for (const [fid, val] of Object.entries(config)) {
    if (typeof val === 'string' && val.includes('{{shared:')) {
      resolved[fid] = val.replace(/\{\{shared:([^}]+)\}\}/g, (_, sid) => {
        if (!sharedValues) return '';
        // 兼容旧格式 sharedFields 数组
        if (Array.isArray(sharedValues)) {
          const sf = sharedValues.find(s => s.id === sid);
          return sf ? sf.value : '';
        }
        return sharedValues[sid] !== undefined ? sharedValues[sid] : '';
      });
    } else {
      resolved[fid] = val;
    }
  }
  return resolved;
}

// ══════════════════════════════════════════════
//  Fill Helper (hotkey & context menu)
// ══════════════════════════════════════════════
async function doFillActiveProfile(tabId) {
  const { profiles } = await chrome.storage.local.get('profiles');
  const active = (profiles || []).find(p => p.isActive) || profiles?.[0];
  // 错误反馈：无激活 Profile 时通过 content.js 显示 Toast
  if (!active) {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }).catch(() => {});
      await chrome.tabs.sendMessage(tabId, { action: 'showToast', msg: '⚠️ 无激活 Profile，请先在扩展弹窗中创建', type: 'error' }).catch(() => {});
    } catch (_) {}
    return false;
  }
  const preset = active.presets.find(p => p.isDefault) || active.presets[0];
  if (!preset) {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }).catch(() => {});
      await chrome.tabs.sendMessage(tabId, { action: 'showToast', msg: '⚠️ 无默认预设，请先在扩展弹窗中配置', type: 'error' }).catch(() => {});
    } catch (_) {}
    return false;
  }
  const fieldMap = {};
  (active.fields || []).forEach(f => { fieldMap[f.id] = { selector: f.selector, type: f.type }; });
  const config = resolveSharedValues(preset.data || {}, active.sharedValues);
  try { await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }); } catch (_) {}
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'fillDirect', config, fieldMap });
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
    console.log('[UFF] v1.4.5 installed');
  } else if (reason === 'update') {
    await migrateData();
    console.log('[UFF] v1.4.5 updated');
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
  // 仅当 profiles 键完全不存在时才迁移；空数组视为已初始化的合法状态
  if (Array.isArray(data.profiles)) return;
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
  if (typeof profile.sharedValues !== 'object' || profile.sharedValues === null) profile.sharedValues = {};
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
    // 先读取已有状态，确保确认结果（clicked=true）不会被普通 hover 消息覆盖
    chrome.storage.local.get('__pickerHover', data => {
      const existing = data.__pickerHover || {};
      chrome.storage.local.set({
        __pickerHover: {
          selector: msg.selector,
          type: msg.type,
          label: msg.label,
          clicked: !!msg.clicked || !!existing.clicked,
          ts: Date.now()
        }
      }, () => sendResponse({ ok: true }));
    });
    return true;
  }

  // Picker ended
  if (msg.action === 'pickerEnd') {
    // 延迟清理：给重新打开的 popup 足够时间读取结果
    // 已确认结果保留 30 秒；未确认也保留 3 秒，避免与 pickerHover 写入竞态
    chrome.storage.local.get('__pickerHover', data => {
      const ttl = data.__pickerHover?.clicked ? 30000 : 3000;
      setTimeout(() => chrome.storage.local.remove('__pickerHover'), ttl);
    });
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

  if (msg.action === 'jumpFill') {
    (async () => {
      try {
        const tabId = msg.tabId;
        if (!tabId) return;

        // ★ 修复竞态：先把待填充数据存入 storage，content.js 加载时主动拉取
        // 这样即使自动填充先触发，content.js 也会先看到 pendingJumpFill 并抑制自动填充
        const pendingKey = `__uffJumpFill_${tabId}`;
        await chrome.storage.local.set({
          [pendingKey]: { config: msg.config, fieldMap: msg.fieldMap, ts: Date.now() }
        });

        const MAX = 20000; let done = false;
        const fill = async () => {
          if (done) return; done = true;
          try {
            await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
            await chrome.tabs.sendMessage(tabId, { action: 'fillDirect', config: msg.config, fieldMap: msg.fieldMap });
          } catch (_) {}
          // 清理 pending 数据
          chrome.storage.local.remove(pendingKey);
        };

        // 先检查当前 tab 状态：若已 complete 则直接填充（避免错过 complete 事件）
        const tab = await chrome.tabs.get(tabId).catch(() => null);
        if (tab && tab.status === 'complete') {
          setTimeout(fill, 300);
        } else {
          const l = (tid, ci) => {
            if (tid === tabId && ci.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(l);
              setTimeout(fill, 600);
            }
          };
          chrome.tabs.onUpdated.addListener(l);
          // 兜底超时
          setTimeout(() => { chrome.tabs.onUpdated.removeListener(l); fill(); }, MAX);
        }
      } catch (_) {}
    })();
    sendResponse({ ok: true });
    return true;
  }

  // ★ content.js 启动时检查是否有 jumpFill 待处理数据（修复与自动填充的竞态）
  if (msg.action === 'checkJumpFill') {
    const tabId = sender.tab?.id;
    if (!tabId) { sendResponse({}); return true; }
    const key = `__uffJumpFill_${tabId}`;
    chrome.storage.local.get(key, (data) => {
      const pending = data[key];
      if (pending && (Date.now() - pending.ts < 60000)) {
        sendResponse({ config: pending.config, fieldMap: pending.fieldMap });
        chrome.storage.local.remove(key);
      } else {
        if (pending) chrome.storage.local.remove(key);
        sendResponse({});
      }
    });
    return true;
  }

  // ★ 从 content.js 打开 popup 窗口（避免内容脚本 window.open 被浏览器拦截）
  if (msg.action === 'openPopupWindow') {
    chrome.windows.create({
      url: chrome.runtime.getURL('popup.html'),
      type: 'popup',
      width: 420,
      height: 640
    });
    sendResponse({ ok: true });
    return true;
  }

  // ★ content.js 请求显示 Toast（用于 background 触发的提示）
  if (msg.action === 'showToast') {
    // no-op: this is handled by content.js directly; kept for compatibility
    sendResponse({ ok: true });
    return true;
  }
});
