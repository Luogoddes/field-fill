/**
 * popup.js — 字段填充 · Universal Field Filler v4.3
 * 洛 - 愿执一生笔，画汝眉上柳...
 *
 * ★ v4.3 修复：
 *   1. 预设填充显示所有 Profile 的预设（不再只显示 activeProfile）
 *   2. 详情「复制」→「文本预览」按钮，展示 "字段名：值" 格式文本
 *   3. 拾取器：popup 保持打开，通过 storage 轮询实时更新选择器输入框
 *   4. 字段配置顺序：Profile 管理 → 添加字段 → 已配置字段
 *   5. 右键菜单修复说明在 IO 页面
 */
'use strict';

// ════════════════════════════════════════════
//  State
// ════════════════════════════════════════════
let profiles        = [];
let activeProfileId = null;   // which profile is shown in fields tab
let currentPanel    = 'presets';
let currentParsed   = null;
let batchMode       = false;
let ctxChipId       = null;

// Picker state
let pickerActive    = false;
let pickerTabId     = null;
let pickerChangeListener = null; // storage 变化监听器

// ════════════════════════════════════════════
//  Helpers
// ════════════════════════════════════════════
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}
function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function getActiveProfile() {
  return profiles.find(p => p.id === activeProfileId)
      || profiles.find(p => p.isActive)
      || profiles[0];
}

// ════════════════════════════════════════════
//  Storage
// ════════════════════════════════════════════
const loadAll = () => new Promise(r => chrome.storage.local.get(['profiles', 'theme'], r));

// 检查存储容量并清理过期数据
async function checkAndCleanStorage() {
  try {
    const data = await chrome.storage.local.get(null);
    const jsonStr = JSON.stringify(data);
    const bytes = new Blob([jsonStr]).size;
    const maxBytes = 5 * 1024 * 1024; // Chrome storage.local 限制约 5MB
    const usagePercent = (bytes / maxBytes * 100).toFixed(1);

    // 如果超过 80%，清理过期数据
    if (bytes > maxBytes * 0.8) {
      console.warn(`[UFF] 存储空间使用 ${usagePercent}%，开始清理...`);

      // 清理过期的 pickerHover 数据（超过 5 分钟）
      const now = Date.now();
      if (data.__pickerHover && (now - data.__pickerHover.ts > 5 * 60 * 1000)) {
        await chrome.storage.local.remove('__pickerHover');
      }

      // 清理其他临时数据
      const keysToRemove = [];
      for (const key of Object.keys(data)) {
        if (key.startsWith('__temp_')) {
          keysToRemove.push(key);
        }
      }
      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
      }

      showToast(`⚠️ 存储空间清理完成`, 'warning');
    }

    return { bytes, usagePercent };
  } catch (e) {
    console.error('[UFF] 存储检查失败:', e);
    return { bytes: 0, usagePercent: 0 };
  }
}

// 带容量检查的保存函数
async function saveProfiles() {
  await checkAndCleanStorage();
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ profiles }, () => {
      if (chrome.runtime.lastError) {
        showToast('❌ 保存失败：' + chrome.runtime.lastError.message, 'error');
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

const saveTheme = t => new Promise(r => chrome.storage.local.set({ theme: t }, r));

// ════════════════════════════════════════════
//  Toast
// ════════════════════════════════════════════
let _tt;
function showToast(msg, type = 'info', ms = 2600) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = `toast ${type} show`;
  clearTimeout(_tt); _tt = setTimeout(() => el.classList.remove('show'), ms);
}

// ════════════════════════════════════════════
//  Theme
// ════════════════════════════════════════════
function applyTheme(theme) {
  const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme:dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  document.getElementById('theme-btn').textContent = dark ? '☀️' : '🌙';
}

// ════════════════════════════════════════════
//  Dialog
// ════════════════════════════════════════════
let _dlgOk = null;
function openDialog({ title, hint = '', placeholder = '', defaultValue = '' }) {
  return new Promise(resolve => {
    _dlgOk = resolve;
    document.getElementById('dlg-title').textContent = title;
    document.getElementById('dlg-hint').textContent  = hint;
    const inp = document.getElementById('dlg-inp');
    inp.placeholder = placeholder; inp.value = defaultValue;
    document.getElementById('dlg-ov').classList.add('show');
    setTimeout(() => { inp.focus(); inp.select(); }, 40);
  });
}
function closeDialog(val) {
  document.getElementById('dlg-ov').classList.remove('show');
  if (_dlgOk) { _dlgOk(val); _dlgOk = null; }
}

// ════════════════════════════════════════════
//  Tab Navigation
// ════════════════════════════════════════════
function switchPanel(id) {
  currentPanel = id;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.panel === id));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === `panel-${id}`));
  if (id === 'presets') renderPresets();
  if (id === 'fields')  { renderProfileChips(); renderFields(); }
}

// ════════════════════════════════════════════
//  Fill — primary path (popup sends data directly)
// ════════════════════════════════════════════
async function fillWithData(profile, data) {
  if (!data || !Object.values(data).some(v => v && String(v).trim())) {
    showToast('⚠️ 预设数据为空，请先在详情中填写字段值', 'warning'); return;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) { showToast('无法获取当前页面', 'error'); return; }
  const fieldMap = {};
  (profile.fields || []).forEach(f => { fieldMap[f.id] = { selector: f.selector, type: f.type }; });
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }).catch(() => {});
    const resp = await chrome.tabs.sendMessage(tab.id, { action: 'fillDirect', config: data, fieldMap });
    if (resp?.result?.success > 0)
      showToast(`✅ 填充成功 ${resp.result.success} 个字段`, 'success');
    else if (resp?.result?.success === 0)
      showToast('⚠️ 未匹配到字段，请检查选择器', 'warning');
    else
      showToast('⚠️ ' + (resp?.error || '填充失败'), 'error');
  } catch (e) {
    showToast('⚠️ 页面通信失败，请刷新目标页面后重试', 'error');
  }
}

async function fillWithPreset(profile, presetId) {
  const preset = profile.presets.find(p => p.id === presetId);
  if (!preset) { showToast('预设不存在', 'error'); return; }
  await fillWithData(profile, preset.data);
}

// ════════════════════════════════════════════
//  Presets Panel — show ALL profiles' presets
//  Global single default: only one preset across all profiles can be "default"
// ════════════════════════════════════════════
function getGlobalDefault() {
  // Find the one global default preset (first isDefault=true found across all profiles)
  for (const profile of profiles) {
    const def = (profile.presets || []).find(p => p.isDefault);
    if (def) return { preset: def, profile };
  }
  return null;
}

function setGlobalDefault(profileId, presetId) {
  // Clear ALL isDefault across all profiles, then set the one
  profiles.forEach(profile => {
    (profile.presets || []).forEach(p => { p.isDefault = false; });
  });
  const profile = profiles.find(p => p.id === profileId);
  const preset  = profile?.presets.find(p => p.id === presetId);
  if (preset) preset.isDefault = true;
}

function renderPresets() {
  const container = document.getElementById('preset-list');
  const search    = (document.getElementById('preset-search').value || '').toLowerCase().trim();

  const globalDef = getGlobalDefault();

  // Collect presets from ALL profiles
  let allPresets = [];
  profiles.forEach(profile => {
    (profile.presets || []).forEach(p => {
      allPresets.push({ preset: p, profile });
    });
  });

  // Filter by search
  if (search) {
    allPresets = allPresets.filter(({ preset, profile }) =>
      preset.name.toLowerCase().includes(search) ||
      profile.name.toLowerCase().includes(search) ||
      (preset.tags || []).some(t => t.toLowerCase().includes(search))
    );
  }

  if (!allPresets.length) {
    const msg = profiles.length === 0 ? '请先创建 Profile 并添加预设' : (search ? '无匹配预设' : '暂无预设，点击右上角 ＋ 添加');
    container.innerHTML = `<div class="empty"><div class="empty-i">📭</div><div class="empty-t">${msg}</div></div>`;
    return;
  }

  container.innerHTML = allPresets.map(({ preset: p, profile }) => {
    const isGlobalDef = globalDef?.preset.id === p.id;
    // Tags: profile name first, then user-defined tags
    const displayTags = [profile.name, ...(p.tags || [])];
    const tagsHtml = displayTags.map((t, i) =>
      `<span class="ptag${i === 0 ? ' profile-tag' : ''}">${esc(t)}</span>`
    ).join('');

    return `
      <div class="pcard ${isGlobalDef ? 'is-def' : ''}"
           data-pid="${p.id}" data-profileid="${profile.id}">
        <div class="pcard-hd">
          <div class="pcard-info">
            <div class="pcard-ico">${isGlobalDef ? '⭐' : '📋'}</div>
            <div style="min-width:0;">
              <div class="pcard-name">${esc(p.name)}</div>
              <div class="pcard-tags">${tagsHtml}</div>
            </div>
            ${isGlobalDef ? '<span class="pcard-badge">全局默认</span>' : ''}
          </div>
          <div class="pcard-acts">
            <button class="pact fill" data-pid="${p.id}" data-profileid="${profile.id}">✨ 填充</button>
            <button class="pact toggle" data-pid="${p.id}" data-profileid="${profile.id}">▼</button>
          </div>
        </div>
        <div class="pdetail" id="pd-${p.id}"></div>
      </div>`;
  }).join('');

  // Fill buttons — find correct profile for each
  container.querySelectorAll('.pact.fill').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const profile = profiles.find(p => p.id === btn.dataset.profileid);
      if (profile) await fillWithPreset(profile, btn.dataset.pid);
    });
  });

  // Toggle detail
  container.querySelectorAll('.pact.toggle').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const pid       = btn.dataset.pid;
      const profileId = btn.dataset.profileid;
      const panel     = document.getElementById(`pd-${pid}`);
      const open      = panel.classList.contains('open');
      document.querySelectorAll('.pdetail.open').forEach(p => { p.classList.remove('open'); p.innerHTML = ''; });
      document.querySelectorAll('.pact.toggle').forEach(b => b.textContent = '▼');
      if (!open) {
        const profile = profiles.find(p => p.id === profileId);
        const preset  = profile?.presets.find(p => p.id === pid);
        if (preset && profile) {
          panel.innerHTML = buildDetailHTML(preset, profile);
          panel.classList.add('open');
          btn.textContent = '▲';
          bindDetailEvents(panel, preset, profile);
        }
      }
    });
  });
}

// ════════════════════════════════════════════
//  Preset Detail
// ════════════════════════════════════════════
function buildDetailHTML(preset, profile) {
  const fields = profile.fields || [];

  // Text preview string
  const previewText = fields
    .filter(f => preset.data?.[f.id])
    .map(f => `${f.name}：${preset.data[f.id]}`)
    .join('\n') || '（暂无数据）';

  // Edit grid
  const gridHTML = fields.map(f => {
    const val    = preset.data?.[f.id] || '';
    const isFull = f.fullWidth === 1 || f.type === 'textarea' || val.length > 60;
    const inp = isFull
      ? `<textarea class="inp dfi" data-fid="${f.id}" rows="2">${esc(val)}</textarea>`
      : `<input class="inp dfi" type="text" data-fid="${f.id}" value="${esc(val)}">`;
    return `<div class="dfield ${isFull ? 'full' : ''}"><div class="dlbl">${esc(f.name)}</div>${inp}</div>`;
  }).join('');

  return `
    <div class="detail-meta">
      <input class="inp" id="dn-${preset.id}" value="${esc(preset.name)}" placeholder="预设名称" style="flex:2;">
      <input class="inp" id="dt-${preset.id}" value="${esc((preset.tags||[]).join(', '))}" placeholder="标签（逗号分隔）" style="flex:3;">
    </div>

    <!-- View mode toggle -->
    <div style="display:flex;gap:5px;margin-bottom:8px;">
      <button class="btn btn-g btn-sm view-mode-btn active-mode" data-mode="edit" style="flex:1;justify-content:center;">✏️ 编辑</button>
      <button class="btn btn-g btn-sm view-mode-btn" data-mode="text" style="flex:1;justify-content:center;">📄 文本</button>
    </div>

    <!-- Edit view -->
    <div class="detail-view" data-view="edit">
      <div class="detail-grid">
        ${gridHTML || '<div style="color:var(--t2);font-size:12px;grid-column:1/-1;">此 Profile 暂无字段，请先在「字段配置」中添加。</div>'}
      </div>
    </div>

    <!-- Text view — editable textarea, format: 字段名：值 -->
    <div class="detail-view" data-view="text" style="display:none;">
      <textarea class="preset-text-preview-edit inp" id="ptxt-${preset.id}"
        rows="6" spellcheck="false">${esc(previewText)}</textarea>
      <div style="font-size:10px;color:var(--t2);margin-top:4px;">
        格式：每行 <code>字段名：值</code>，保存时按此格式解析并覆盖对应字段
      </div>
    </div>

    <div class="detail-acts">
      <button class="btn btn-ok btn-sm" data-act="use" style="flex:1;justify-content:center;">✨ 填充</button>
      <button class="btn btn-p btn-sm"  data-act="save" style="flex:1;justify-content:center;">💾 保存</button>
      <button class="btn btn-g btn-sm"  data-act="def" style="flex:1;justify-content:center;">⭐ 默认</button>
      <button class="btn btn-g btn-sm"  data-act="exp" style="flex:1;justify-content:center;">📤 导出</button>
      <button class="btn btn-err btn-sm" data-act="del" style="flex:1;justify-content:center;">🗑️</button>
    </div>`;
}

function bindDetailEvents(panel, preset, profile) {
  // View mode toggle
  panel.querySelectorAll('.view-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      panel.querySelectorAll('.view-mode-btn').forEach(b => {
        b.classList.toggle('active-mode', b === btn);
        b.style.fontWeight = b === btn ? '700' : '';
      });
      panel.querySelectorAll('.detail-view').forEach(v => {
        v.style.display = v.dataset.view === mode ? '' : 'none';
      });
      // Sync text textarea with current edit inputs
      if (mode === 'text') {
        const lines = [];
        (profile.fields || []).forEach(f => {
          const inp = panel.querySelector(`.dfi[data-fid="${f.id}"]`);
          const v   = inp ? inp.value : (preset.data?.[f.id] || '');
          lines.push(`${f.name}：${v}`);  // include all fields, even empty
        });
        const ta = document.getElementById(`ptxt-${preset.id}`);
        if (ta) ta.value = lines.join('\n') || '（暂无数据）';
      }
      // Sync edit inputs from text textarea when switching back
      if (mode === 'edit') {
        const ta = document.getElementById(`ptxt-${preset.id}`);
        if (ta) _parseTextIntoInputs(ta.value, panel, profile);
      }
    });
  });

  // Track changes → pulse save button
  panel.querySelectorAll('.dfi').forEach(inp => {
    inp.addEventListener('input', () => {
      panel.querySelector('[data-act="save"]')?.classList.add('has-changes');
    });
  });
  const txtArea = document.getElementById(`ptxt-${preset.id}`);
  if (txtArea) {
    txtArea.addEventListener('input', () => {
      panel.querySelector('[data-act="save"]')?.classList.add('has-changes');
    });
  }

  // Fill: use live DOM values (from whichever view is active)
  panel.querySelector('[data-act="use"]')?.addEventListener('click', () => {
    const data = _collectData(panel, profile);
    fillWithData(profile, data);
  });

  // Save: collect from both views
  panel.querySelector('[data-act="save"]')?.addEventListener('click', async () => {
    const name = document.getElementById(`dn-${preset.id}`)?.value.trim();
    const tags  = document.getElementById(`dt-${preset.id}`)?.value.split(',').map(t=>t.trim()).filter(Boolean);
    const data  = _collectData(panel, profile);
    const p = profile.presets.find(x => x.id === preset.id);
    if (p) { p.name = name || p.name; p.tags = tags; p.data = data; }
    await saveProfiles();
    panel.querySelector('[data-act="save"]')?.classList.remove('has-changes');
    renderPresets();
    showToast('💾 预设已保存', 'success');
  });

  // Set global default (clear all others first)
  panel.querySelector('[data-act="def"]')?.addEventListener('click', async () => {
    setGlobalDefault(profile.id, preset.id);
    await saveProfiles(); renderPresets();
    showToast('⭐ 已设为全局默认（快捷键和右键菜单将使用此预设）', 'success');
  });

  // Export
  panel.querySelector('[data-act="exp"]')?.addEventListener('click', () => {
    downloadJSON({ _type:'uff-preset', profileId:profile.id, profileName:profile.name, preset:{...preset} }, `preset-${preset.name}.json`);
    showToast('📤 预设已导出', 'info');
  });

  // Delete
  panel.querySelector('[data-act="del"]')?.addEventListener('click', async () => {
    if (!confirm(`确定删除预设「${preset.name}」？`)) return;
    profile.presets = profile.presets.filter(p => p.id !== preset.id);
    await saveProfiles(); renderPresets();
    showToast('🗑️ 已删除', 'info');
  });
}

// Collect field data from whichever view is active
function _collectData(panel, profile) {
  // Check if text view is visible
  const textView = panel.querySelector('.detail-view[data-view="text"]');
  if (textView && textView.style.display !== 'none') {
    const ta = textView.querySelector('textarea');
    if (ta) return _parseTextToData(ta.value, profile);
  }
  // Fallback: edit view inputs
  const data = {};
  panel.querySelectorAll('.dfi[data-fid]').forEach(inp => { data[inp.dataset.fid] = inp.value; });
  return data;
}

// Parse "字段名：值" text into {fieldId: value}
function _parseTextToData(text, profile) {
  const data = {};
  const lines = text.split('\n');
  lines.forEach(line => {
    const m = line.match(/^(.+?)[:：]\s*(.*)/);
    if (!m) return;
    const name = m[1].trim(), val = m[2].trim();
    const field = (profile.fields || []).find(f => f.name === name || f.name.toLowerCase() === name.toLowerCase());
    if (field) data[field.id] = val;
  });
  return data;
}

// Sync text content back into edit inputs
function _parseTextIntoInputs(text, panel, profile) {
  const data = _parseTextToData(text, profile);
  (profile.fields || []).forEach(f => {
    const inp = panel.querySelector(`.dfi[data-fid="${f.id}"]`);
    if (inp && data[f.id] !== undefined) inp.value = data[f.id];
  });
}

async function addPreset() {
  // Ask which profile if multiple
  let targetProfile = getActiveProfile();
  if (profiles.length > 1) {
    const options = profiles.map((p, i) => `${i+1}. ${p.name}`).join('\n');
    // Use dialog to pick, just use active for now (simpler UX)
    // The profile tag on preset makes it clear which profile it belongs to
  }
  if (!targetProfile) { showToast('请先创建 Profile', 'error'); return; }
  const name = await openDialog({ title:'新建预设', placeholder:'如：800D R#2 版本配置', hint:`将添加到 Profile：${targetProfile.name}` });
  if (!name?.trim()) return;
  const np = { id:'preset-'+uid(), name:name.trim(), data:{}, tags:[], isDefault:targetProfile.presets.length===0, createdAt:Date.now() };
  targetProfile.presets.push(np);
  await saveProfiles(); renderPresets();
  showToast(`✅ 预设「${np.name}」已添加到 ${targetProfile.name}`, 'success');
}

// ════════════════════════════════════════════
//  Profile Chips
// ════════════════════════════════════════════
function renderProfileChips() {
  const chips = document.getElementById('profile-chips');
  if (!chips) return;

  chips.innerHTML = profiles.map(p => `
    <div class="chip ${p.id === activeProfileId ? 'active' : ''}" data-pid="${p.id}">
      <span class="chip-label">${esc(p.name)}</span>
      ${p.isActive ? '<span style="font-size:9px;opacity:.75;margin-left:2px;">●</span>' : ''}
      <button class="chip-m" data-pid="${p.id}" title="更多操作">⋮</button>
    </div>
  `).join('') + `<button class="chip-new" id="chip-new-btn">＋ 新建</button>`;

  chips.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', e => {
      if (e.target.classList.contains('chip-m')) return;
      activeProfileId = chip.dataset.pid;
      renderProfileChips(); renderFields();
    });
  });

  chips.querySelectorAll('.chip-m').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      ctxChipId = btn.dataset.pid;
      const r = btn.getBoundingClientRect();
      const menu = document.getElementById('ctx-menu');
      menu.classList.add('show');
      const vw = window.innerWidth, vh = window.innerHeight;
      menu.style.left = Math.min(r.right, vw - 145) + 'px';
      menu.style.top  = Math.min(r.bottom + 4, vh - 115) + 'px';
    });
  });

  document.getElementById('chip-new-btn')?.addEventListener('click', createProfile);

  // Update active profile badge in field list header
  const badge = document.getElementById('active-profile-badge');
  const p = getActiveProfile();
  if (p && badge) { badge.textContent = p.name; badge.style.display = 'inline-flex'; }
  else if (badge) badge.style.display = 'none';
}

async function createProfile() {
  const name = await openDialog({ title:'新建 Profile', placeholder:'如：GitHub Issues、内网 OA...', hint:'每个 Profile 独立管理字段配置和预设' });
  if (!name?.trim()) return;
  const np = { id:'profile-'+uid(), name:name.trim(), isActive:profiles.length===0, tags:[], fields:[], presets:[] };
  profiles.push(np);
  activeProfileId = np.id;
  await saveProfiles();
  renderProfileChips(); renderFields();
  showToast(`✅ Profile「${np.name}」已创建`, 'success');
}

async function activateProfile(id) {
  profiles.forEach(p => { p.isActive = p.id === id; });
  activeProfileId = id;
  await saveProfiles();
  renderProfileChips(); renderPresets();
  showToast('✅ 已设为激活 Profile（快捷键和右键菜单将使用此 Profile）', 'success');
}

async function renameProfile(id) {
  const profile = profiles.find(p => p.id === id);
  if (!profile) return;
  const name = await openDialog({ title:'重命名 Profile', defaultValue:profile.name, placeholder:'新名称' });
  if (!name?.trim() || name.trim() === profile.name) return;
  profile.name = name.trim();
  await saveProfiles(); renderProfileChips(); renderPresets();
  showToast('✅ 已重命名', 'success');
}

async function deleteProfile(id) {
  if (profiles.length <= 1) { showToast('⚠️ 至少保留一个 Profile', 'error'); return; }
  const p = profiles.find(x => x.id === id);
  if (!confirm(`确定删除 Profile「${p?.name}」及其所有预设？此操作不可恢复。`)) return;
  profiles = profiles.filter(x => x.id !== id);
  if (activeProfileId === id) activeProfileId = profiles[0]?.id;
  if (!profiles.some(x => x.isActive)) profiles[0].isActive = true;
  await saveProfiles();
  renderProfileChips(); renderFields(); renderPresets();
  showToast('🗑️ Profile 已删除', 'info');
}

// ════════════════════════════════════════════
//  Fields Panel
// ════════════════════════════════════════════
function renderFields() {
  const profile = getActiveProfile();
  const list    = document.getElementById('field-list');
  const countEl = document.getElementById('field-count');
  const badge   = document.getElementById('active-profile-badge');

  if (profile && badge) { badge.textContent = profile.name; badge.style.display = 'inline-flex'; }
  else if (badge) badge.style.display = 'none';

  if (!profile) { if(list) list.innerHTML = ''; return; }
  const fields = profile.fields || [];
  if (countEl) countEl.textContent = `(${fields.length})`;

  if (!fields.length) {
    list.innerHTML = '<div class="empty" style="padding:14px 0;"><div class="empty-i">📋</div><div class="empty-t">暂无字段</div><div class="empty-d">上方扫描页面或手动添加</div></div>';
    return;
  }

  list.innerHTML = fields.map((f, i) => `
    <div class="fitem" draggable="true" data-idx="${i}" data-fid="${f.id}">
      <input type="checkbox" class="batch-cb" data-fid="${f.id}">
      <span class="drag-h" title="拖拽排序">⠿</span>
      <span class="ftype ${f.type}">${f.type === 'textarea' ? 'ta' : f.type}</span>
      <div class="finfo">
        <input class="fname-e" value="${esc(f.name)}" data-fid="${f.id}" title="点击修改字段名">
        <div class="fsel" title="${esc(f.selector)}">${esc(f.selector)}</div>
      </div>
      <label class="fw-toggle" title="独占一行">
        <input type="checkbox" data-fid="${f.id}" ${f.fullWidth ? 'checked' : ''}> 独行
      </label>
      <button class="bico d" data-fid="${f.id}" title="删除">✕</button>
    </div>
  `).join('');

  if (batchMode) list.querySelectorAll('.fitem').forEach(el => el.classList.add('batch-mode'));

  // Inline rename
  list.querySelectorAll('.fname-e').forEach(inp => {
    inp.addEventListener('change', async () => {
      const f = profile.fields.find(x => x.id === inp.dataset.fid);
      if (f && inp.value.trim()) { f.name = inp.value.trim(); await saveProfiles(); showToast('✅ 已更新字段名', 'success', 1400); }
    });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
  });

  // fullWidth
  list.querySelectorAll('.fw-toggle input').forEach(cb => {
    cb.addEventListener('change', async () => {
      const f = profile.fields.find(x => x.id === cb.dataset.fid);
      if (f) { f.fullWidth = cb.checked ? 1 : 0; await saveProfiles(); showToast('✅ 显示模式已更新', 'success', 1400); }
    });
  });

  // Delete single
  list.querySelectorAll('.bico.d').forEach(btn => {
    btn.addEventListener('click', async () => {
      profile.fields = profile.fields.filter(f => f.id !== btn.dataset.fid);
      await saveProfiles(); renderFields();
      showToast('🗑️ 字段已删除', 'info');
    });
  });

  // Batch checkboxes
  list.querySelectorAll('.batch-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const n = list.querySelectorAll('.batch-cb:checked').length;
      const sc = document.getElementById('sel-count');
      if (sc) sc.textContent = n > 0 ? `已选 ${n} 个` : '';
    });
  });

  initDragSort(list, profile);
}

function initDragSort(list, profile) {
  let di = null;
  list.querySelectorAll('.fitem').forEach(item => {
    item.addEventListener('dragstart', e => {
      if (e.target.type === 'checkbox' || e.target.classList.contains('fname-e')) { e.preventDefault(); return; }
      di = +item.dataset.idx; item.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragend',  () => { item.classList.remove('dragging'); list.querySelectorAll('.fitem').forEach(i=>i.classList.remove('drag-over')); });
    item.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect='move'; list.querySelectorAll('.fitem').forEach(i=>i.classList.remove('drag-over')); item.classList.add('drag-over'); });
    item.addEventListener('drop', async e => {
      e.preventDefault();
      const ti = +item.dataset.idx;
      if (di===null||di===ti) return;
      const [m] = profile.fields.splice(di,1); profile.fields.splice(ti,0,m);
      await saveProfiles(); renderFields();
    });
  });
}

function toggleBatchMode() {
  batchMode = !batchMode;
  document.getElementById('batch-bar').classList.toggle('show', batchMode);
  document.getElementById('batch-toggle-btn').textContent = batchMode ? '退出批量' : '批量管理';
  if (!batchMode) {
    document.getElementById('selall-fields').checked = false;
    document.getElementById('sel-count').textContent = '';
  }
  renderFields();
}

async function deleteSelectedFields() {
  const profile = getActiveProfile(); if (!profile) return;
  const selected = [...document.querySelectorAll('.batch-cb:checked')].map(cb => cb.dataset.fid);
  if (!selected.length) { showToast('请先选择字段', 'warning'); return; }
  if (!confirm(`确定删除选中的 ${selected.length} 个字段？`)) return;
  profile.fields = profile.fields.filter(f => !selected.includes(f.id));
  await saveProfiles();
  document.getElementById('selall-fields').checked = false;
  document.getElementById('sel-count').textContent = '';
  renderFields();
  showToast(`🗑️ 已删除 ${selected.length} 个字段`, 'info');
}

async function addFieldManually() {
  const profile = getActiveProfile();
  if (!profile) { showToast('请先选择 Profile', 'error'); return; }
  const name = document.getElementById('new-fname').value.trim();
  const sel  = document.getElementById('new-fsel').value.trim();
  const type = document.getElementById('new-ftype').value;
  if (!name) { showToast('请输入字段名称', 'error'); return; }
  if (!sel)  { showToast('请输入 CSS 选择器', 'error'); return; }
  if (profile.fields.find(f => f.selector === sel)) { showToast('该选择器已存在', 'error'); return; }
  profile.fields.push({ id:'field-'+uid(), name, selector:sel, type, fullWidth:0 });
  await saveProfiles();
  document.getElementById('new-fname').value = '';
  document.getElementById('new-fsel').value  = '';
  document.getElementById('new-ftype').value = 'text';
  renderFields();
  showToast(`✅ 字段「${name}」已添加`, 'success');
}

// ════════════════════════════════════════════
//  Live Hover Picker
//  Popup stays open. content.js sends pickerHover to background
//  background stores in __pickerHover. We use storage.onChanged for better performance.
// ════════════════════════════════════════════
async function startPicker() {
  if (pickerActive) { stopPicker(); return; }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) { showToast('无法获取页面', 'error'); return; }
  pickerTabId = tab.id;

  // Ensure content script loaded
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }).catch(() => {});
    await chrome.tabs.sendMessage(tab.id, { action: 'startPicker' });
  } catch (e) {
    showToast('启动失败：' + e.message, 'error'); return;
  }

  pickerActive = true;
  const selEl  = document.getElementById('new-fsel');
  const hint   = document.getElementById('picker-hint');
  const pickBtn = document.getElementById('pick-btn');

  selEl.classList.add('picker-active');
  selEl.placeholder = '拾取中，将鼠标悬停到目标字段…';
  hint.classList.add('show');
  pickBtn.textContent = '⏹ 停止';
  pickBtn.classList.add('btn-err');
  pickBtn.classList.remove('btn-g');

  // Clear old hover data
  await new Promise(r => chrome.storage.local.remove('__pickerHover', r));

  // Use storage.onChanged instead of polling for better performance
  pickerChangeListener = (changes, area) => {
    if (area !== 'local' || !changes.__pickerHover) return;
    const { newValue } = changes.__pickerHover;
    if (!newValue) return;
    const { selector, type, label } = newValue;
    if (selector) {
      selEl.value = selector;
      selEl.style.borderColor = '#10b981';
      if (type) document.getElementById('new-ftype').value = type;
      // Always update name to match current hovered element
      const nameEl = document.getElementById('new-fname');
      if (label) nameEl.value = label;
    }
  };
  chrome.storage.onChanged.addListener(pickerChangeListener);
}

function stopPicker() {
  if (!pickerActive) return;
  pickerActive = false;

  // Remove storage change listener
  if (pickerChangeListener) {
    chrome.storage.onChanged.removeListener(pickerChangeListener);
    pickerChangeListener = null;
  }

  chrome.storage.local.remove('__pickerHover');

  const selEl  = document.getElementById('new-fsel');
  const hint   = document.getElementById('picker-hint');
  const pickBtn = document.getElementById('pick-btn');

  selEl.classList.remove('picker-active');
  selEl.style.borderColor = '';
  selEl.placeholder = 'CSS 选择器（如：#issue_subject）';
  hint.classList.remove('show');
  pickBtn.textContent = '🎯 拾取';
  pickBtn.classList.remove('btn-err');
  pickBtn.classList.add('btn-g');

  // Tell content script to stop
  if (pickerTabId) {
    chrome.tabs.sendMessage(pickerTabId, { action: 'stopPicker' }).catch(() => {});
    pickerTabId = null;
  }
}

// ════════════════════════════════════════════
//  Batch Scan Page
// ════════════════════════════════════════════
function _extractScript() {
  const results = [], seen = new Set();
  function getLabel(el) {
    if (el.id) { try { const l=document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if(l) return l.textContent.trim(); } catch(_){} }
    const w=el.closest('label');
    if(w){ const c=w.cloneNode(true); c.querySelectorAll('input,select,textarea').forEach(x=>x.remove()); const t=c.textContent.trim(); if(t) return t; }
    let s=el.previousElementSibling;
    while(s){ if(['LABEL','DT','TH'].includes(s.tagName)) return s.textContent.trim(); s=s.previousElementSibling; }
    return el.getAttribute('aria-label')||el.placeholder||el.name||el.id||'';
  }
  function getSel(el){
    if(el.id){ try{ return '#'+CSS.escape(el.id); }catch(_){} }
    if(el.name) return `[name="${el.name}"]`;
    const p=[];let c=el;
    while(c&&c!==document.body){
      let seg=c.tagName.toLowerCase();
      if(c.id){try{p.unshift('#'+CSS.escape(c.id));break;}catch(_){}}
      const i=Array.from(c.parentNode?.children||[]).filter(x=>x.tagName===c.tagName).indexOf(c);
      if(i>0) seg+=`:nth-of-type(${i+1})`;
      p.unshift(seg);c=c.parentElement;
    }
    return p.join(' > ');
  }
  document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]):not([type=checkbox]):not([type=radio]),select,textarea').forEach(el=>{
    const sel=getSel(el);
    if(seen.has(sel)) return; seen.add(sel);
    const lbl=getLabel(el)||el.name||el.id||'未知字段';
    if(!lbl.trim()) return;
    let type='text';
    if(el.tagName==='SELECT') type='select';
    else if(el.tagName==='TEXTAREA') type='textarea';
    results.push({label:lbl.slice(0,60),selector:sel,type});
  });
  return results.slice(0,80);
}

async function scanPage() {
  const [tab] = await chrome.tabs.query({ active:true, currentWindow:true });
  if (!tab?.id) { showToast('无法获取页面', 'error'); return; }
  const btn = document.getElementById('scan-btn');
  btn.textContent = '⏳ 扫描中…'; btn.disabled = true;
  try {
    const res = await chrome.scripting.executeScript({ target:{tabId:tab.id}, func:_extractScript });
    btn.textContent = '📋 扫描页面'; btn.disabled = false;
    const fields = res?.[0]?.result || [];
    if (!fields.length) { showToast('未找到表单字段', 'warning'); return; }
    renderExtractResult(fields);
  } catch(e) {
    btn.textContent = '📋 扫描页面'; btn.disabled = false;
    showToast('扫描失败：' + e.message, 'error');
  }
}

function renderExtractResult(fields) {
  const wrap = document.getElementById('er-wrap');
  document.getElementById('er-title').textContent = `发现 ${fields.length} 个字段：`;
  const listEl = document.getElementById('er-list');
  listEl.innerHTML = fields.map((f,i) => `
    <label class="er-item">
      <input type="checkbox" data-idx="${i}" checked>
      <span class="er-lbl">${esc(f.label)}</span>
      <span class="er-type">${f.type}</span>
      <span class="er-sel" title="${esc(f.selector)}">${esc(f.selector.slice(0,32))}${f.selector.length>32?'…':''}</span>
    </label>`).join('');
  listEl._fields = fields;
  wrap.classList.add('show');
  let allChk = true;
  document.getElementById('er-selall').onclick = () => {
    allChk = !allChk;
    listEl.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = allChk);
    document.getElementById('er-selall').textContent = allChk ? '取消全选' : '全选';
  };
}

async function addExtractedFields() {
  const profile = getActiveProfile();
  if (!profile) { showToast('请先选择 Profile', 'error'); return; }
  const listEl = document.getElementById('er-list');
  const fields = listEl._fields || [];
  let added = 0;
  listEl.querySelectorAll('input[type=checkbox]:checked').forEach(cb => {
    const f = fields[+cb.dataset.idx];
    if (!f || profile.fields.find(x=>x.selector===f.selector)) return;
    profile.fields.push({ id:'field-'+uid(), name:f.label, selector:f.selector, type:f.type, fullWidth:0 });
    added++;
  });
  if (!added) { showToast('未选择或字段已存在', 'warning'); return; }
  await saveProfiles();
  document.getElementById('er-wrap').classList.remove('show');
  renderFields();
  showToast(`✅ 已添加 ${added} 个字段`, 'success');
}

// ════════════════════════════════════════════
//  Smart Parse
// ════════════════════════════════════════════
function parseText(text, profile) {
  const result = {}, fields = profile.fields || [];
  fields.forEach(field => {
    const pats = [new RegExp(`${escRe(field.name)}\\s*[:：]\\s*(.+?)(?:\n|$)`, 'i')];
    if (/[()（）]/.test(field.name)) pats.push(new RegExp(`${escRe(field.name.replace(/[()（）]/g,''))}\\s*[:：]\\s*(.+?)(?:\n|$)`, 'i'));
    for (const p of pats) { const m=text.match(p); if(m){result[field.id]=m[1].trim();break;} }
  });
  const aliases = [
    {a:['SOC','SoC'],fn:['SoC 版本','soc']},{a:['MCU'],fn:['MCU 版本','mcu']},
    {a:['综合版本','统合版本'],fn:['统合版本','unified']},{a:['主题','标题'],fn:['主题','subject']},
    {a:['测试实施阶段','实施阶段'],fn:['测试实施阶段','phase']},
    {a:['功能分类','测试用功能分类'],fn:['功能分类','func']},{a:['等级','级别'],fn:['等级','level']},
    {a:['解决节点','缺陷目标解决节点'],fn:['解决节点','target']},{a:['测试活动分类','活动分类'],fn:['测试活动分类','activity']},
  ];
  aliases.forEach(({a,fn})=>{
    const tf=fields.find(f=>fn.some(n=>f.name.toLowerCase().includes(n.toLowerCase())||f.id.includes(n)));
    if(!tf||result[tf.id]) return;
    for(const alias of a){const m=text.match(new RegExp(`${escRe(alias)}\\s*[:：]\\s*(.+?)(?:\n|$)`,'i'));if(m){result[tf.id]=m[1].trim();break;}}
  });
  return result;
}

async function onParse() {
  const text = document.getElementById('parse-input').value.trim();
  if (!text) { showToast('请输入要解析的文本', 'error'); return; }
  const scored = profiles.map(p => {
    const data = parseText(text, p);
    return { profile:p, data, count:Object.values(data).filter(v=>v).length };
  }).filter(x=>x.count>0).sort((a,b)=>b.count-a.count);
  if (!scored.length) { showToast('⚠️ 未识别到任何字段', 'warning'); return; }
  const top = scored[0].count, tied = scored.filter(s=>s.count===top);
  if (tied.length > 1) {
    const sec=document.getElementById('ppick-sec'), lst=document.getElementById('ppick-list');
    sec.style.display='block';
    lst.innerHTML = tied.map(m=>`<div class="ppick-item" data-pid="${m.profile.id}"><span style="font-size:12px;font-weight:600;">${esc(m.profile.name)}</span><span class="ppick-cnt">匹配 ${m.count} 个字段</span></div>`).join('');
    lst.querySelectorAll('.ppick-item').forEach(item=>{
      item.addEventListener('click',()=>{const match=tied.find(m=>m.profile.id===item.dataset.pid);if(match){sec.style.display='none';applyParseResult(match.profile,match.data);}});
    });
    return;
  }
  applyParseResult(scored[0].profile, scored[0].data);
}

function applyParseResult(profile, data) {
  currentParsed = { profile, data };
  activeProfileId = profile.id;
  const count = Object.values(data).filter(v=>v).length;
  document.getElementById('parse-cnt').textContent = count;
  document.getElementById('parse-pre').textContent = (profile.fields||[]).filter(f=>data[f.id]).map(f=>`${f.name}：${data[f.id]}`).join('\n')||'（无数据）';
  document.getElementById('parse-result').classList.add('show');
  showToast(`✅ 解析完成，识别 ${count} 个字段（${profile.name}）`, 'success');
}

async function saveParseAsPreset() {
  if (!currentParsed) { showToast('请先解析文本', 'error'); return; }
  const name = await openDialog({ title:'保存为预设', placeholder:'如：800D R#2 测试配置', hint:`保存到 Profile：${currentParsed.profile.name}` });
  if (!name?.trim()) return;
  const profile = profiles.find(p=>p.id===currentParsed.profile.id); if (!profile) return;
  const existing = profile.presets.find(p=>p.name===name.trim());
  if (existing && !confirm(`预设「${name.trim()}」已存在，是否覆盖？`)) return;
  const np = { id:existing?.id||'preset-'+uid(), name:name.trim(), data:{...currentParsed.data}, tags:[], isDefault:existing?.isDefault||profile.presets.length===0, createdAt:Date.now() };
  profile.presets = existing ? profile.presets.map(p=>p.id===np.id?np:p) : [...profile.presets,np];
  await saveProfiles();
  currentParsed=null;
  document.getElementById('parse-result').classList.remove('show');
  document.getElementById('parse-input').value='';
  showToast(`💾 预设「${np.name}」已保存`, 'success');
}

// ════════════════════════════════════════════
//  Import / Export
// ════════════════════════════════════════════
function downloadJSON(data, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)], {type:'application/json'}));
  const a = Object.assign(document.createElement('a'), {href:url, download:filename});
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}
const exportAll = () => { downloadJSON({_type:'uff-backup',version:'4.3',profiles,exportedAt:Date.now()}, 'uff-backup.json'); showToast('📤 备份已导出','success'); };
const exportProfile = () => {
  const p=getActiveProfile(); if(!p){showToast('请先选择 Profile','error');return;}
  downloadJSON({_type:'uff-profile',version:'4.3',profile:p},`profile-${p.name}.json`); showToast('📋 已导出','success');
};
async function importFile() {
  return new Promise(resolve=>{
    const inp=document.getElementById('file-import'); inp.value='';
    inp.onchange=async()=>{
      const f=inp.files?.[0]; if(!f){resolve(null);return;}
      try{resolve(JSON.parse(await f.text()));}catch(e){showToast('解析失败：'+e.message,'error');resolve(null);}
    };
    inp.click();
  });
}
async function importAll() {
  const j=await importFile(); if(!j) return;
  if(j._type!=='uff-backup'){showToast('⚠️ 需要 uff-backup 格式','error');return;}
  if(!confirm('导入将覆盖所有现有 Profiles，是否继续？')) return;
  profiles=j.profiles||[];
  activeProfileId=profiles.find(p=>p.isActive)?.id||profiles[0]?.id;
  await saveProfiles(); renderProfileChips(); renderPresets(); renderFields();
  showToast(`✅ 导入成功，共 ${profiles.length} 个 Profile`,'success');
}
async function importProfile() {
  const j=await importFile(); if(!j) return;
  if(j._type!=='uff-profile'||!j.profile){showToast('⚠️ 需要 uff-profile 格式','error');return;}
  const np={...j.profile,id:'profile-'+uid(),isActive:false};
  profiles.push(np); activeProfileId=np.id;
  await saveProfiles(); renderProfileChips(); renderPresets();
  showToast(`✅ Profile「${np.name}」导入成功`,'success');
}

// ════════════════════════════════════════════
//  Init
// ════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  const stored = await loadAll();
  profiles = stored.profiles || [];
  if (!profiles.length) {
    profiles = [{ id:'profile-default', name:'Default', isActive:true, tags:[], fields:[], presets:[] }];
    await saveProfiles();
  }
  activeProfileId = profiles.find(p=>p.isActive)?.id || profiles[0].id;

  // Theme
  let theme = stored.theme || 'auto';
  applyTheme(theme);
  document.getElementById('theme-btn').addEventListener('click', async () => {
    const t=['auto','light','dark'];
    theme=t[(t.indexOf(theme)+1)%t.length];
    applyTheme(theme); await saveTheme(theme);
    showToast(`主题：${theme}`,'info',1200);
  });

  // About
  document.getElementById('about-btn').addEventListener('click', () => document.getElementById('about-ov').classList.add('show'));
  document.getElementById('about-close').addEventListener('click', () => document.getElementById('about-ov').classList.remove('show'));
  document.getElementById('about-ov').addEventListener('click', e=>{ if(e.target===e.currentTarget) e.currentTarget.classList.remove('show'); });
  document.getElementById('github-link').addEventListener('click', e=>{ e.preventDefault(); chrome.tabs.create({url:'https://github.com/Luogoddes/field-fill'}); });

  // Tabs
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => switchPanel(t.dataset.panel)));

  // Dialog
  document.getElementById('dlg-cancel').addEventListener('click', () => closeDialog(null));
  document.getElementById('dlg-confirm').addEventListener('click', () => closeDialog(document.getElementById('dlg-inp').value));
  document.getElementById('dlg-inp').addEventListener('keydown', e=>{
    if(e.key==='Enter') closeDialog(document.getElementById('dlg-inp').value);
    if(e.key==='Escape') closeDialog(null);
  });
  document.getElementById('dlg-ov').addEventListener('click', e=>{ if(e.target===e.currentTarget) closeDialog(null); });

  // Context menu (chips)
  document.getElementById('ctx-activate').addEventListener('click', async()=>{ hideCtx(); if(ctxChipId) await activateProfile(ctxChipId); });
  document.getElementById('ctx-rename').addEventListener('click',   async()=>{ const id=ctxChipId; hideCtx(); if(id) await renameProfile(id); });
  document.getElementById('ctx-delete').addEventListener('click',   async()=>{ const id=ctxChipId; hideCtx(); if(id) await deleteProfile(id); });
  document.addEventListener('click', e=>{ if(!e.target.closest('#ctx-menu')) hideCtx(); });

  // Presets
  document.getElementById('add-preset-btn').addEventListener('click', addPreset);
  document.getElementById('preset-search').addEventListener('input', renderPresets);

  // Fields
  document.getElementById('new-profile-btn').addEventListener('click', createProfile);
  document.getElementById('scan-btn').addEventListener('click', scanPage);
  document.getElementById('pick-btn').addEventListener('click', startPicker);
  document.getElementById('stop-pick-link').addEventListener('click', e=>{ e.preventDefault(); stopPicker(); });
  document.getElementById('er-selall').addEventListener('click', ()=>{});  // bound in renderExtractResult
  document.getElementById('er-add').addEventListener('click', addExtractedFields);
  document.getElementById('add-field-btn').addEventListener('click', addFieldManually);
  document.getElementById('batch-toggle-btn').addEventListener('click', toggleBatchMode);
  document.getElementById('del-selected-btn').addEventListener('click', deleteSelectedFields);
  document.getElementById('selall-fields').addEventListener('change', function() {
    document.querySelectorAll('.batch-cb').forEach(cb=>{ cb.checked=this.checked; });
    const n=document.querySelectorAll('.batch-cb:checked').length;
    document.getElementById('sel-count').textContent=n>0?`已选 ${n} 个`:'';
  });

  // Parse
  document.getElementById('parse-btn').addEventListener('click', onParse);
  document.getElementById('parse-input').addEventListener('keydown', e=>{ if(e.ctrlKey&&e.key==='Enter') onParse(); });
  document.getElementById('save-parse-btn').addEventListener('click', saveParseAsPreset);
  // Height persistence
  const ta = document.getElementById('parse-input');
  const savedH = localStorage.getItem('uff-parse-h');
  if (savedH) ta.style.height = savedH;
  new ResizeObserver(() => { localStorage.setItem('uff-parse-h', ta.offsetHeight + 'px'); }).observe(ta);

  // IO
  document.getElementById('export-all-btn').addEventListener('click', exportAll);
  document.getElementById('export-profile-btn').addEventListener('click', exportProfile);
  document.getElementById('import-all-btn').addEventListener('click', importAll);
  document.getElementById('import-profile-btn').addEventListener('click', importProfile);

  // Rebuild context menu (for existing installs where onInstalled already ran)
  document.getElementById('rebuild-menu-btn').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'rebuildMenu' });
    showToast('✅ 右键菜单已重建，请在页面上右键试试', 'success', 3500);
  });

  // Context menu toggle
  async function setupContextMenuToggle() {
    const contextMenuToggle = document.getElementById('context-menu-toggle');
    if (contextMenuToggle) {
      // Load current setting
      const { contextMenuEnabled = true } = await chrome.storage.local.get('contextMenuEnabled');
      contextMenuToggle.checked = contextMenuEnabled;
      
      // Add change listener
      contextMenuToggle.addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        await chrome.storage.local.set({ contextMenuEnabled: enabled });
        await chrome.runtime.sendMessage({ action: 'rebuildMenu' });
        showToast(enabled ? '✅ 右键菜单已启用' : '✅ 右键菜单已禁用', 'success');
      });
    }
  }
  setupContextMenuToggle();

  // Show current version
  const manifest = chrome.runtime.getManifest();
  const verEl = document.getElementById('cur-version');
  const verEl1 = document.getElementById('cur-version1');
  if (verEl) verEl.textContent = manifest.version;
  if (verEl1) verEl1.textContent = manifest.version;

  // Check for updates — compares against a hosted version.json
  // Format: { "version": "4.4.0", "notes": "...", "url": "..." }
  document.getElementById('check-update-btn').addEventListener('click', async () => {
    const resultEl = document.getElementById('update-result');
    resultEl.style.display = 'block';
    resultEl.textContent = '正在检查…';
    try {
      const resp = await fetch('https://raw.githubusercontent.com/Luogoddes/field-fill/main/manifest.json', { cache: 'no-store' });
      if (!resp.ok) throw new Error('无法访问更新服务器');
      const remote = await resp.json();
      const cur = manifest.version.split('.').map(Number);
      const rem = remote.version.split('.').map(Number);
      const newer = rem[0] > cur[0] || (rem[0]===cur[0] && rem[1] > cur[1]) || (rem[0]===cur[0] && rem[1]===cur[1] && rem[2] > cur[2]);
      if (newer) {
        resultEl.innerHTML = `🎉 发现新版本 <strong>${remote.version}</strong>！${remote.version_name ? remote.version_name + ' ' : ''}<a href="${remote.update_url || 'https://github.com/Luogoddes/field-fill/archive/refs/heads/main.zip'}" target="_blank" style="color:var(--p);">点击下载</a>`;
        resultEl.style.color = 'var(--ok)';
      } else {
        resultEl.textContent = `✅ 当前已是最新版本 (${manifest.version})`;
        resultEl.style.color = 'var(--t2)';
      }
    } catch (e) {
      resultEl.textContent = '⚠️ 检查失败：' + e.message + '（如已上传 Edge/Chrome 商店，商店会自动推送更新）';
      resultEl.style.color = 'var(--warn)';
    }
  });

  // Stop picker if popup is closing
  window.addEventListener('beforeunload', () => { if (pickerActive) stopPicker(); });

  // Initial render
  renderPresets();
  renderProfileChips();
  renderFields();
});

function hideCtx() { document.getElementById('ctx-menu').classList.remove('show'); }
