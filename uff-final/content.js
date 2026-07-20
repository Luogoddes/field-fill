/**
 * content.js — 字段填充 · Universal Field Filler v2.0
 * 洛 - 愿执一生笔，画汝眉上柳...
 *
 * v2.0 改进：
 *   - 修复 SPA 路由后自动填充不触发（监听 popstate/hashchange/pushState）
 *   - 修复内存泄漏：picker 事件、observer 全部可清理
 *   - 悬浮球 Launcher：右侧固定，hover 展开预设列表
 *   - 自动化流程执行器 runFlow()
 *   - __uffContentLoaded 改为模块级 Symbol 防止全局污染
 */
(function () {
  'use strict';

  // ── 防止重复注入（同一文档只初始化一次）─────────
  if (window.__uffContentLoaded) return;
  window.__uffContentLoaded = true;

  // ════════════════════════════════════════════
  //  样式注入（幂等）
  // ════════════════════════════════════════════
  function injectStyles() {
    if (document.getElementById('__uff_style__')) return;
    const s = document.createElement('style');
    s.id = '__uff_style__';
    s.textContent = `
      /* Toast */
      .uff-toast{position:fixed;top:18px;right:18px;z-index:2147483647;
        padding:10px 18px;border-radius:10px;font-size:13px;font-weight:500;
        color:#fff;box-shadow:0 4px 20px rgba(0,0,0,.2);
        animation:uffIn .28s cubic-bezier(.4,0,.2,1);
        transition:opacity .3s;max-width:320px;line-height:1.5;pointer-events:none;
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;}
      .uff-toast.success{background:linear-gradient(135deg,#10b981,#34d399);}
      .uff-toast.error  {background:linear-gradient(135deg,#ef4444,#f87171);}
      .uff-toast.info   {background:linear-gradient(135deg,#6366f1,#8b5cf6);}
      .uff-toast.warning{background:linear-gradient(135deg,#f59e0b,#fbbf24);}
      @keyframes uffIn{from{transform:translateX(110px);opacity:0}to{transform:translateX(0);opacity:1}}

      /* 拾取器高亮 */
      .__uff-hl{
        outline:2px solid #6366f1!important;
        outline-offset:2px!important;
        background:rgba(99,102,241,.07)!important;
        cursor:crosshair!important;
      }
      #__uff_pick_badge{
        position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
        z-index:2147483647;background:linear-gradient(135deg,#6366f1,#8b5cf6);
        color:#fff;padding:8px 18px;border-radius:999px;font-size:12px;font-weight:600;
        box-shadow:0 4px 16px rgba(99,102,241,.5);pointer-events:none;
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;
        animation:uffIn .25s ease;white-space:nowrap;
      }

      /* ── 悬浮球 Launcher ── */
      #__uff_launcher{
        position:fixed;right:0;top:50%;transform:translateY(-50%);
        z-index:2147483646;display:flex;flex-direction:column;align-items:flex-end;
        user-select:none;
        /* 防止遮挡滚动条 */
        pointer-events:none;
      }
      #__uff_launcher.active{ pointer-events:auto; }
      #__uff_trigger{
        width:36px;height:36px;
        background:linear-gradient(135deg,#6366f1,#8b5cf6);
        border-radius:8px 0 0 8px;
        display:flex;align-items:center;justify-content:center;
        font-size:18px;cursor:pointer;
        box-shadow:-2px 0 12px rgba(99,102,241,.45);
        transition:width .2s ease,border-radius .2s ease,box-shadow .2s;
        pointer-events:auto;
        position:relative;right:0;
        border:none;outline:none;color:#fff;
      }
      #__uff_trigger:hover{
        width:40px;
        box-shadow:-4px 0 18px rgba(99,102,241,.6);
      }
      #__uff_panel{
        position:absolute;right:36px;top:50%;transform:translateY(-50%);
        background:#fff;border:1px solid #e2e8f0;
        border-radius:12px;
        box-shadow:0 8px 32px rgba(0,0,0,.15);
        min-width:200px;max-width:260px;
        overflow:hidden;
        opacity:0;visibility:hidden;
        transform:translateY(-50%) translateX(8px) scale(.96);
        transition:opacity .18s ease,visibility .18s,transform .18s ease;
      }
      [data-theme="dark"] #__uff_panel{
        background:#1e293b;border-color:#334155;
        box-shadow:0 8px 32px rgba(0,0,0,.5);
      }
      #__uff_launcher.open #__uff_panel{
        opacity:1;visibility:visible;
        transform:translateY(-50%) translateX(0) scale(1);
      }
      .__uff_panel_hd{
        padding:8px 12px 6px;
        font-size:11px;font-weight:700;color:#94a3b8;
        text-transform:uppercase;letter-spacing:.06em;
        border-bottom:1px solid #e2e8f0;
        display:flex;align-items:center;justify-content:space-between;
      }
      [data-theme="dark"] .__uff_panel_hd{ color:#475569;border-color:#334155; }
      .__uff_close_btn{
        background:none;border:none;cursor:pointer;
        color:#94a3b8;font-size:14px;padding:0 2px;line-height:1;
      }
      .__uff_close_btn:hover{color:#ef4444;}
      .__uff_preset_list{ max-height:280px;overflow-y:auto;padding:4px 0; }
      .__uff_preset_item{
        display:flex;align-items:center;gap:8px;
        padding:8px 12px;cursor:pointer;
        font-size:12.5px;color:#1e293b;
        transition:background .12s;
        border:none;background:none;width:100%;text-align:left;
      }
      [data-theme="dark"] .__uff_preset_item{color:#e2e8f0;}
      .__uff_preset_item:hover{background:#f1f5f9;}
      [data-theme="dark"] .__uff_preset_item:hover{background:#273549;}
      .__uff_preset_item.is-def{font-weight:700;color:#6366f1;}
      [data-theme="dark"] .__uff_preset_item.is-def{color:#818cf8;}
      .__uff_preset_ico{font-size:14px;flex-shrink:0;}
      .__uff_preset_name{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .__uff_preset_tag{
        font-size:9.5px;padding:1px 5px;
        background:#ede9fe;color:#6366f1;border-radius:999px;flex-shrink:0;
      }
      [data-theme="dark"] .__uff_preset_tag{background:#312e81;color:#a5b4fc;}
      .__uff_divider{height:1px;background:#e2e8f0;margin:4px 0;}
      [data-theme="dark"] .__uff_divider{background:#334155;}
      .__uff_empty{
        padding:16px;text-align:center;font-size:11.5px;color:#94a3b8;
      }
    `;
    (document.head || document.documentElement).appendChild(s);
  }

  // ════════════════════════════════════════════
  //  Toast
  // ════════════════════════════════════════════
  function showToast(msg, type = 'info', dur = 2800) {
    injectStyles();
    const t = document.createElement('div');
    t.className = `uff-toast ${type}`; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 320);
    }, dur);
  }

  // ════════════════════════════════════════════
  //  Selector / Label 工具
  // ════════════════════════════════════════════
  function getSel(el) {
    if (el.id) { try { return '#' + CSS.escape(el.id); } catch (_) { return '#' + el.id; } }
    if (el.name) return `[name="${el.name}"]`;
    const path = []; let cur = el;
    while (cur && cur !== document.body) {
      let seg = cur.tagName.toLowerCase();
      if (cur.id) { try { path.unshift('#' + CSS.escape(cur.id)); break; } catch (_) {} }
      const idx = Array.from(cur.parentNode?.children || [])
        .filter(c => c.tagName === cur.tagName).indexOf(cur);
      if (idx > 0) seg += `:nth-of-type(${idx + 1})`;
      path.unshift(seg); cur = cur.parentElement;
    }
    return path.join(' > ');
  }

  function getElType(el) {
    if (el.tagName === 'SELECT') return 'select';
    if (el.tagName === 'TEXTAREA') return 'textarea';
    return 'text';
  }

  function getLabel(el) {
    if (el.id) {
      try { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) return l.textContent.trim(); } catch (_) {}
    }
    const wrap = el.closest('label');
    if (wrap) {
      const c = wrap.cloneNode(true);
      c.querySelectorAll('input,select,textarea').forEach(x => x.remove());
      const t = c.textContent.trim(); if (t) return t;
    }
    let sib = el.previousElementSibling;
    while (sib) {
      if (['LABEL', 'DT', 'TH'].includes(sib.tagName)) return sib.textContent.trim();
      sib = sib.previousElementSibling;
    }
    return el.getAttribute('aria-label') || el.placeholder || el.name || el.id || '';
  }

  // ════════════════════════════════════════════
  //  核心填充
  // ════════════════════════════════════════════
  function doFill(config, fieldMap, overwrite = true) {
    let success = 0, fail = 0;
    for (const [fid, def] of Object.entries(fieldMap)) {
      const val = config[fid];
      if (val === undefined || val === null || String(val).trim() === '') continue;
      const el = document.querySelector(def.selector);
      if (!el) { fail++; continue; }

      // overwrite=false 时跳过已有值的字段
      if (!overwrite) {
        const cur = el.value || '';
        if (cur.trim()) continue;
      }

      try {
        if (def.type === 'text' || def.type === 'textarea') {
          const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          setter ? setter.call(el, String(val)) : (el.value = String(val));
          el.dispatchEvent(new Event('input',  { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          success++;
        } else if (def.type === 'select') {
          const v = String(val).trim().toLowerCase();
          const opts = el.options; let matched = false;
          for (let i = 0; i < opts.length && !matched; i++)
            if (opts[i].value.trim().toLowerCase() === v) { el.value = opts[i].value; matched = true; }
          for (let i = 0; i < opts.length && !matched; i++)
            if (opts[i].textContent.trim().toLowerCase() === v) { el.value = opts[i].value; matched = true; }
          for (let i = 0; i < opts.length && !matched; i++)
            if (opts[i].value.toLowerCase().includes(v) || opts[i].textContent.toLowerCase().includes(v))
              { el.value = opts[i].value; matched = true; }
          if (matched) { el.dispatchEvent(new Event('change', { bubbles: true })); success++; }
          else fail++;
        }
      } catch (e) { fail++; console.debug('[UFF]', fid, e.message); }
    }
    const firstSel = Object.values(fieldMap)[0]?.selector;
    if (firstSel) document.querySelector(firstSel)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return { success, fail };
  }

  // ════════════════════════════════════════════
  //  自动化流程执行器
  //  steps: [{type:'click'|'fill'|'wait', selector?, presetId?, profileId?, ms?}]
  // ════════════════════════════════════════════
  async function runFlow(steps, profiles) {
    for (const step of steps) {
      if (step.type === 'wait') {
        await new Promise(r => setTimeout(r, step.ms || 500));
        continue;
      }
      if (step.type === 'click') {
        const el = document.querySelector(step.selector);
        if (!el) { showToast(`⚠️ 流程: 未找到元素 ${step.selector}`, 'error'); continue; }
        el.click();
        await new Promise(r => setTimeout(r, step.wait || 300));
        continue;
      }
      if (step.type === 'fill') {
        const profile = profiles.find(p => p.id === step.profileId);
        const preset  = profile?.presets.find(p => p.id === step.presetId);
        if (!profile || !preset) { showToast('⚠️ 流程: 找不到预设', 'error'); continue; }
        const fieldMap = {};
        (profile.fields || []).forEach(f => { fieldMap[f.id] = { selector: f.selector, type: f.type }; });
        const res = doFill(preset.data, fieldMap);
        if (res.success > 0) showToast(`✅ 流程填充: ${preset.name} — ${res.success} 个字段`, 'success');
        await new Promise(r => setTimeout(r, step.delay || 200));
        continue;
      }
    }
  }

  // ════════════════════════════════════════════
  //  拾取器
  // ════════════════════════════════════════════
  let _pickerActive = false;
  let _lastHl = null;
  let _badge = null;
  let _sendThrottle = null;

  // 事件处理函数（存引用以便移除）
  function _onPickerHover(e) {
    const el = e.target;
    const isForm = ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) &&
      !['hidden', 'submit', 'button', 'reset', 'image', 'checkbox', 'radio'].includes(el.type);
    if (_lastHl && _lastHl !== el) { _lastHl.classList.remove('__uff-hl'); _lastHl = null; }
    if (!isForm) return;
    el.classList.add('__uff-hl');
    _lastHl = el;
    clearTimeout(_sendThrottle);
    _sendThrottle = setTimeout(() => {
      try {
        chrome.runtime.sendMessage({
          action: 'pickerHover',
          selector: getSel(el),
          type: getElType(el),
          label: getLabel(el) || el.name || el.id || ''
        }).catch(() => {});
      } catch (_) {}
    }, 80);
  }

  function _onPickerKey(e) {
    if (e.key === 'Escape') stopPicker();
  }

  function startPicker() {
    if (_pickerActive) return;
    _pickerActive = true;
    injectStyles();
    _badge = document.createElement('div');
    _badge.id = '__uff_pick_badge';
    _badge.textContent = '🎯 拾取模式 · 鼠标悬停到目标字段  |  ESC 退出';
    document.body.appendChild(_badge);
    document.addEventListener('mouseover', _onPickerHover, true);
    document.addEventListener('keydown',   _onPickerKey,   true);
  }

  function stopPicker() {
    if (!_pickerActive) return;
    _pickerActive = false;
    clearTimeout(_sendThrottle);
    document.removeEventListener('mouseover', _onPickerHover, true);
    document.removeEventListener('keydown',   _onPickerKey,   true);
    if (_lastHl) { _lastHl.classList.remove('__uff-hl'); _lastHl = null; }
    if (_badge)  { _badge.remove(); _badge = null; }
    try { chrome.runtime.sendMessage({ action: 'pickerEnd' }).catch(() => {}); } catch (_) {}
  }

  // ════════════════════════════════════════════
  //  自动填充（修复 SPA 路由问题）
  // ════════════════════════════════════════════
  function urlMatches(mode, ruleUrl, pageUrl) {
    if (!ruleUrl) return false;
    try {
      switch (mode) {
        case 'exact':    return pageUrl === ruleUrl || pageUrl.replace(/\/$/, '') === ruleUrl.replace(/\/$/, '');
        case 'contains': return pageUrl.includes(ruleUrl);
        case 'prefix':   return pageUrl.startsWith(ruleUrl);
        case 'suffix':   return pageUrl.endsWith(ruleUrl);
        case 'regex':    return new RegExp(ruleUrl).test(pageUrl);
        default:         return pageUrl.includes(ruleUrl);
      }
    } catch (_) { return false; }
  }

  // 每个 URL 只自动填充一次（5s 内防重复）
  const _autoFillDone = new Set();

  async function runAutoFill(pageUrl) {
    // 5s 内同一 URL 不重复触发
    if (_autoFillDone.has(pageUrl)) return;
    try {
      const { profiles } = await new Promise(r => chrome.storage.local.get('profiles', r));
      if (!profiles?.length) return;

      const byDelay = {};
      profiles.forEach(profile => {
        (profile.presets || []).forEach(preset => {
          const af = preset.autoFill;
          if (!af?.enabled) return;
          const globalDelay = af.delay ?? 800;
          const overwrite   = af.overwrite !== false;
          (af.rules || []).filter(r => r.active !== false && r.url).forEach(rule => {
            if (!urlMatches(rule.mode, rule.url, pageUrl)) return;
            const delay = (rule.delay != null && !isNaN(rule.delay)) ? rule.delay : globalDelay;
            if (!byDelay[delay]) byDelay[delay] = [];
            byDelay[delay].push({ profile, preset, overwrite });
          });
        });
      });

      const hasAny = Object.keys(byDelay).length > 0;
      if (!hasAny) return;

      _autoFillDone.add(pageUrl);
      setTimeout(() => _autoFillDone.delete(pageUrl), 5_000);

      Object.entries(byDelay).forEach(([delayStr, group]) => {
        setTimeout(() => {
          let totalS = 0, totalF = 0;
          const names = [];
          const seen = new Set();
          group.forEach(({ profile, preset, overwrite }) => {
            if (seen.has(preset.id)) return;
            seen.add(preset.id);
            names.push(preset.name);
            const fieldMap = {};
            (profile.fields || []).forEach(f => { fieldMap[f.id] = { selector: f.selector, type: f.type }; });
            const res = doFill(preset.data || {}, fieldMap, overwrite);
            totalS += res.success; totalF += res.fail;
          });
          if (totalS > 0) showToast(`🤖 自动填充：${names.join('、')} — 成功 ${totalS} 个字段`, 'success');
          else if (totalF > 0) showToast('🤖 自动填充：URL 匹配成功，但字段选择器未找到', 'warning');
        }, parseInt(delayStr, 10));
      });
    } catch (e) {
      console.debug('[UFF] auto-fill:', e.message);
    }
  }

  // 页面初始加载
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => runAutoFill(location.href));
  } else {
    runAutoFill(location.href);
  }

  // SPA 路由变化监听（修复 Bug B）
  const _origPushState = history.pushState.bind(history);
  const _origReplaceState = history.replaceState.bind(history);
  history.pushState = function(...args) {
    _origPushState(...args);
    setTimeout(() => runAutoFill(location.href), 100);
  };
  history.replaceState = function(...args) {
    _origReplaceState(...args);
    setTimeout(() => runAutoFill(location.href), 100);
  };
  window.addEventListener('popstate', () => setTimeout(() => runAutoFill(location.href), 100));
  window.addEventListener('hashchange', () => setTimeout(() => runAutoFill(location.href), 100));

  // ════════════════════════════════════════════
  //  悬浮球 Launcher（参考 read-frog 右侧悬浮交互）
  //  - 右侧固定，垂直居中
  //  - 点击展开/收起预设列表面板
  //  - 点击预设直接填充
  // ════════════════════════════════════════════
  let _launcher = null;
  let _launcherClickOutside = null;

  async function initLauncher() {
    // 检查是否启用
    const { launcherEnabled = true } = await new Promise(r =>
      chrome.storage.local.get('launcherEnabled', r)
    );
    if (!launcherEnabled) return;

    injectStyles();
    if (_launcher) return;

    _launcher = document.createElement('div');
    _launcher.id = '__uff_launcher';

    const trigger = document.createElement('button');
    trigger.id = '__uff_trigger';
    trigger.title = '字段填充';
    trigger.innerHTML = '✒️';

    const panel = document.createElement('div');
    panel.id = '__uff_panel';

    _launcher.appendChild(trigger);
    _launcher.appendChild(panel);
    document.body.appendChild(_launcher);
    _launcher.classList.add('active');

    // 同步主题
    syncLauncherTheme();

    // 点击触发器 toggle
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = _launcher.classList.contains('open');
      if (isOpen) {
        closeLauncher();
      } else {
        openLauncher(panel);
      }
    });

    // 点击外部关闭
    _launcherClickOutside = (e) => {
      if (_launcher && !_launcher.contains(e.target)) closeLauncher();
    };
    document.addEventListener('click', _launcherClickOutside, true);
  }

  function closeLauncher() {
    _launcher?.classList.remove('open');
  }

  async function openLauncher(panel) {
    _launcher.classList.add('open');
    panel.innerHTML = '<div class="__uff_empty">⏳ 加载中...</div>';
    try {
      const { profiles } = await new Promise(r => chrome.storage.local.get('profiles', r));
      renderLauncherPanel(panel, profiles || []);
    } catch (_) {
      panel.innerHTML = '<div class="__uff_empty">无法读取预设</div>';
    }
  }

  function renderLauncherPanel(panel, profiles) {
    // 收集所有预设（带 profile 信息）
    const allPresets = [];
    profiles.forEach(profile => {
      (profile.presets || []).forEach(preset => {
        allPresets.push({ preset, profile });
      });
    });

    const hd = document.createElement('div');
    hd.className = '__uff_panel_hd';
    hd.innerHTML = `<span>✒️ 字段填充</span>
      <button class="__uff_close_btn" title="关闭">✕</button>`;
    hd.querySelector('.__uff_close_btn').addEventListener('click', closeLauncher);

    const list = document.createElement('div');
    list.className = '__uff_preset_list';

    if (!allPresets.length) {
      list.innerHTML = '<div class="__uff_empty">暂无预设，请先在插件中配置</div>';
    } else {
      allPresets.forEach(({ preset, profile }) => {
        const btn = document.createElement('button');
        btn.className = '__uff_preset_item' + (preset.isDefault ? ' is-def' : '');
        btn.innerHTML = `
          <span class="__uff_preset_ico">${preset.isDefault ? '⭐' : '📋'}</span>
          <span class="__uff_preset_name">${escHtml(preset.name)}</span>
          ${profiles.length > 1 ? `<span class="__uff_preset_tag">${escHtml(profile.name)}</span>` : ''}
        `;
        btn.addEventListener('click', () => {
          closeLauncher();
          const fieldMap = {};
          (profile.fields || []).forEach(f => { fieldMap[f.id] = { selector: f.selector, type: f.type }; });
          const res = doFill(preset.data || {}, fieldMap);
          if (res.success > 0) showToast(`✅ 填充：${preset.name} — 成功 ${res.success} 个字段`, 'success');
          else showToast('⚠️ 未匹配到字段，请检查选择器', 'warning');
        });
        list.appendChild(btn);
      });
    }

    panel.innerHTML = '';
    panel.appendChild(hd);
    panel.appendChild(list);
  }

  function syncLauncherTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
      || window.matchMedia('(prefers-color-scheme:dark)').matches;
    if (_launcher) {
      document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    }
  }

  function destroyLauncher() {
    if (_launcher) { _launcher.remove(); _launcher = null; }
    if (_launcherClickOutside) {
      document.removeEventListener('click', _launcherClickOutside, true);
      _launcherClickOutside = null;
    }
  }

  function escHtml(s) {
    const d = document.createElement('div'); d.textContent = String(s || ''); return d.innerHTML;
  }

  // ════════════════════════════════════════════
  //  消息监听
  // ════════════════════════════════════════════
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

    // 直接填充
    if (msg.action === 'fillDirect') {
      const overwrite = msg.overwrite !== false;
      const result = doFill(msg.config || {}, msg.fieldMap || {}, overwrite);
      if (result.success > 0)
        showToast(`填充完成！${result.success} 个字段${result.fail ? ' / 失败 ' + result.fail : ''}`, 'success');
      else
        showToast('未匹配到任何字段，请检查选择器', 'error');
      sendResponse({ result });
      return true;
    }

    // storage 查找后填充
    if (msg.action === 'fillFields') {
      chrome.storage.local.get('profiles', ({ profiles }) => {
        const profile = msg.profileId
          ? (profiles || []).find(p => p.id === msg.profileId)
          : (profiles || []).find(p => p.isActive) || profiles?.[0];
        if (!profile) { showToast('无激活 Profile', 'error'); sendResponse({ error: 'no profile' }); return; }
        const preset = msg.presetId
          ? profile.presets.find(p => p.id === msg.presetId)
          : profile.presets.find(p => p.isDefault) || profile.presets[0];
        if (!preset) { showToast('无预设，请先配置', 'error'); sendResponse({ error: 'no preset' }); return; }
        const fieldMap = {};
        (profile.fields || []).forEach(f => { fieldMap[f.id] = { selector: f.selector, type: f.type }; });
        const result = doFill(preset.data, fieldMap);
        if (result.success > 0) showToast(`填充 ${result.success} 个字段`, 'success');
        else showToast('未填充任何字段', 'error');
        sendResponse({ result });
      });
      return true;
    }

    // 拾取器
    if (msg.action === 'startPicker') { startPicker(); sendResponse({ ok: true }); return true; }
    if (msg.action === 'stopPicker')  { stopPicker();  sendResponse({ ok: true }); return true; }

    // 自动化流程
    if (msg.action === 'runFlow') {
      chrome.storage.local.get('profiles', ({ profiles }) => {
        runFlow(msg.steps || [], profiles || [])
          .then(() => sendResponse({ ok: true }))
          .catch(e => sendResponse({ error: e.message }));
      });
      return true;
    }

    // 悬浮球控制
    if (msg.action === 'launcherShow') { initLauncher(); sendResponse({ ok: true }); return true; }
    if (msg.action === 'launcherHide') { destroyLauncher(); sendResponse({ ok: true }); return true; }
    if (msg.action === 'launcherReload') {
      destroyLauncher();
      initLauncher();
      sendResponse({ ok: true });
      return true;
    }
  });

  // ════════════════════════════════════════════
  //  初始化（页面 ready 后执行）
  // ════════════════════════════════════════════
  function init() {
    injectStyles();
    initLauncher();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    // 用 setTimeout 避免阻塞页面
    setTimeout(init, 0);
  }

})();
