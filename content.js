/**
 * content.js — 字段填充 · Universal Field Filler v4.3
 * 洛 - 愿执一生笔，画汝眉上柳...
 *
 * ★ v4.3 拾取器方案：
 *   鼠标悬停到表单元素时，通过 chrome.runtime.sendMessage 实时发送元素信息到 background
 *   background 存入 storage，popup 保持打开并轮询 storage，实时更新选择器输入框
 *   不需要关闭 popup，不需要浮层面板
 */
(function () {
  'use strict';
  if (window.__uffContentLoaded) return;
  window.__uffContentLoaded = true;

  // Shared auto-fill state
  window.__uffAutoFillState = {
    hasFilled: false,
    timers: [],
    markDone() {
      this.hasFilled = true;
      this.timers.forEach(clearTimeout);
      this.timers = [];
      try {
        var k = '__uff_auto_fill_' + encodeURIComponent(location.href);
        localStorage.setItem(k, JSON.stringify({ timestamp: Date.now() }));
        setTimeout(function() { localStorage.removeItem(k); }, 5000);
      } catch (_) {}
    },
    shouldFill() {
      if (this.hasFilled) return false;
      try {
        var k = '__uff_auto_fill_' + encodeURIComponent(location.href);
        var s = localStorage.getItem(k);
        if (s) { var ts = JSON.parse(s).timestamp; if (Date.now() - ts < 5000) return false; }
      } catch (_) {}
      return true;
    },
    reset() { this.hasFilled = false; this.timers.forEach(clearTimeout); this.timers = []; },
    addTimer(id) { this.timers.push(id); }
  };

  // ── Toast style injection (idempotent) ────────────────
  if (!document.getElementById('__uff_style__')) {
    const s = document.createElement('style');
    s.id = '__uff_style__';
    s.textContent = `
      .uff-toast{position:fixed;top:18px;right:18px;z-index:2147483647;
        padding:10px 18px;border-radius:10px;font-size:13px;font-weight:500;
        color:#fff;box-shadow:0 4px 20px rgba(0,0,0,.2);
        animation:uffIn .28s cubic-bezier(.4,0,.2,1);
        transition:opacity .3s;max-width:320px;line-height:1.5;pointer-events:auto;
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;}
      .uff-toast.success{background:linear-gradient(135deg,#10b981,#34d399);}
      .uff-toast.error  {background:linear-gradient(135deg,#ef4444,#f87171);}
      .uff-toast.info   {background:linear-gradient(135deg,#6366f1,#8b5cf6);}
      .uff-toast.warning{background:linear-gradient(135deg,#f59e0b,#fbbf24);}
      @keyframes uffIn{from{transform:translateX(110px);opacity:0}to{transform:translateX(0);opacity:1}}
      .__uff-hl{
        outline:2px solid #6366f1 !important;
        outline-offset:2px !important;
        background:rgba(99,102,241,.07) !important;
        cursor:crosshair !important;
      }
      /* Picker indicator badge */
      #__uff_pick_badge{
        position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
        z-index:2147483647;background:linear-gradient(135deg,#6366f1,#8b5cf6);
        color:#fff;padding:8px 18px;border-radius:999px;font-size:12px;font-weight:600;
        box-shadow:0 4px 16px rgba(99,102,241,.5);pointer-events:none;
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;
        animation:uffIn .25s ease;white-space:nowrap;
      }
    `;
    (document.head || document.documentElement).appendChild(s);
  }

  // ── Toast ─────────────────────────────────────────────
  function showToast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = `uff-toast ${type}`; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity='0'; setTimeout(()=>t.remove(), 320); }, 2800);
  }

  // ── Selector generator ────────────────────────────────
  function getSel(el) {
    if (el.id) {
      try { return '#' + CSS.escape(el.id); } catch (_) { return '#' + el.id; }
    }
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
    if (el.tagName === 'SELECT')   return 'select';
    if (el.tagName === 'TEXTAREA') return 'textarea';
    return 'text';
  }

  function getLabel(el) {
    if (el.id) {
      try {
        const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (l) return l.textContent.trim();
      } catch (_) {}
    }
    const wrap = el.closest('label');
    if (wrap) {
      const c = wrap.cloneNode(true);
      c.querySelectorAll('input,select,textarea').forEach(x => x.remove());
      const t = c.textContent.trim(); if (t) return t;
    }
    let sib = el.previousElementSibling;
    while (sib) {
      if (['LABEL','DT','TH'].includes(sib.tagName)) return sib.textContent.trim();
      sib = sib.previousElementSibling;
    }
    return el.getAttribute('aria-label') || el.placeholder || el.name || el.id || '';
  }

  // ── Core fill ─────────────────────────────────────────
  function doFill(config, fieldMap) {
    let success = 0, fail = 0;
    for (const [fid, def] of Object.entries(fieldMap)) {
      const val = config[fid];
      if (val === undefined || val === null || String(val).trim() === '') continue;
      const el = document.querySelector(def.selector);
      if (!el) { fail++; continue; }
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

  // ── Real-time hover picker state ──────────────────────
  let _pickerActive = false;
  let _lastHl = null;
  let _badge = null;
  let _sendThrottle = null; // throttle sendMessage calls

  function startPicker() {
    if (_pickerActive) return;
    _pickerActive = true;

    // Show badge
    _badge = document.createElement('div');
    _badge.id = '__uff_pick_badge';
    _badge.textContent = '🎯 拾取模式 · 将鼠标悬停到目标字段  |  按 ESC 退出';
    document.body.appendChild(_badge);

    document.addEventListener('mouseover', _onHover, true);
    document.addEventListener('keydown',   _onKey,   true);
  }

  function stopPicker() {
    if (!_pickerActive) return;
    _pickerActive = false;
    document.removeEventListener('mouseover', _onHover, true);
    document.removeEventListener('keydown',   _onKey,   true);
    if (_lastHl) { _lastHl.classList.remove('__uff-hl'); _lastHl = null; }
    if (_badge) { _badge.remove(); _badge = null; }
    // Notify background that picker ended
    chrome.runtime.sendMessage({ action: 'pickerEnd' }).catch(() => {});
  }

  function _onHover(e) {
    const el = e.target;
    // Highlight only form elements
    const isForm = ['INPUT','SELECT','TEXTAREA'].includes(el.tagName) &&
      !['hidden','submit','button','reset','image','checkbox','radio'].includes(el.type);

    if (_lastHl && _lastHl !== el) { _lastHl.classList.remove('__uff-hl'); _lastHl = null; }
    if (!isForm) return;

    el.classList.add('__uff-hl');
    _lastHl = el;

    // Throttle: send at most once per 80ms
    clearTimeout(_sendThrottle);
    _sendThrottle = setTimeout(() => {
      const selector = getSel(el);
      const type     = getElType(el);
      const label    = getLabel(el) || el.name || el.id || '';
      // Send to background → stored in storage → popup polls it
      chrome.runtime.sendMessage({
        action: 'pickerHover', selector, type, label
      }).catch(() => {});
    }, 80);
  }

  function _onKey(e) {
    if (e.key === 'Escape') stopPicker();
  }

  // ── Message Listener ──────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

    // Primary fill: popup sends config+fieldMap directly
    if (msg.action === 'fillDirect') {
      if (window.__uffAutoFillState) window.__uffAutoFillState.markDone();
      const result = doFill(msg.config || {}, msg.fieldMap || {});
      if (result.success > 0)
        showToast(`填充完成！${result.success} 个字段${result.fail ? ' / 失败 '+result.fail : ''}`, 'success');
      else
        showToast('未匹配到任何字段，请检查选择器', 'error');
      sendResponse({ result });
      return true;
    }

    // Storage-lookup fill (hotkey / context menu path)
    if (msg.action === 'fillFields') {
      if (window.__uffAutoFillState) window.__uffAutoFillState.markDone();
      chrome.storage.local.get('profiles', ({ profiles }) => {
        const profile = msg.profileId
          ? (profiles||[]).find(p=>p.id===msg.profileId)
          : (profiles||[]).find(p=>p.isActive)||profiles?.[0];
        if (!profile) { showToast('无激活 Profile','error'); sendResponse({error:'no profile'}); return; }
        const preset = msg.presetId
          ? profile.presets.find(p=>p.id===msg.presetId)
          : profile.presets.find(p=>p.isDefault)||profile.presets[0];
        if (!preset) { showToast('无预设，请先配置','error'); sendResponse({error:'no preset'}); return; }
        const fieldMap={};
        (profile.fields||[]).forEach(f=>{fieldMap[f.id]={selector:f.selector,type:f.type};});
        const result = doFill(preset.data, fieldMap);
        if (result.success>0) showToast(`快捷填充 ${result.success} 个字段`,'success');
        else showToast('未填充任何字段','error');
        sendResponse({ result });
      });
      return true;
    }

    // Start picker mode
    if (msg.action === 'startPicker') {
      startPicker();
      sendResponse({ ok: true });
      return true;
    }

    // Stop picker mode
    if (msg.action === 'stopPicker') {
      stopPicker();
      sendResponse({ ok: true });
      return true;
    }
  });

})();



// ════════════════════════════════════════════
//  AUTO-FILL ON PAGE LOAD v3
//  支持 overwrite 开关：关闭时只填充空白字段
//  不依赖全局开关，只要 preset.autoFill.enabled=true 有规则即生效
//  ⚠️ 自动填充策略：每次页面加载（包括刷新）都执行，手动填充后同一页面内不再重复触发
// ════════════════════════════════════════════

(function initAutoFill() {
  if (window.__uffAutoFillInitDone) return;
  window.__uffAutoFillInitDone = true;

  var st = window.__uffAutoFillState;

  function shouldAutoFill() { return st && st.shouldFill(); }
  function markAutoFillDone() { if (st) st.markDone(); }

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

  function autoFill(config, fieldMap, overwrite) {
    var s = 0, f = 0;
    for (var fid in fieldMap) {
      if (!fieldMap.hasOwnProperty(fid)) continue;
      var def = fieldMap[fid];
      var val = config[fid];
      if (!val || !String(val).trim()) continue;
      var el = document.querySelector(def.selector);
      if (!el) { f++; continue; }
      if (!overwrite) {
        var cur = el.value;
        if (cur && cur.trim()) continue;
      }
      try {
        if (def.type === 'select') {
          var v = String(val).trim().toLowerCase(); var ok = false;
          for (var i = 0; i < el.options.length && !ok; i++)
            if (el.options[i].value.trim().toLowerCase() === v ||
                el.options[i].textContent.trim().toLowerCase() === v)
              { el.value = el.options[i].value; ok = true; }
          for (var i = 0; i < el.options.length && !ok; i++)
            if (el.options[i].value.toLowerCase().includes(v) ||
                el.options[i].textContent.toLowerCase().includes(v))
              { el.value = el.options[i].value; ok = true; }
          if (ok) { el.dispatchEvent(new Event('change', { bubbles: true })); s++; } else f++;
        } else {
          var proto  = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          var setter = Object.getOwnPropertyDescriptor(proto, 'value');
          if (setter && setter.set) setter.set.call(el, String(val)); else el.value = String(val);
          el.dispatchEvent(new Event('input',  { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          s++;
        }
      } catch (_) { f++; }
    }
    return { s: s, f: f };
  }

  function showAutoToast(msg, type) {
    if (!document.getElementById('__uff_style__')) return;
    var t = document.createElement('div');
    t.className = 'uff-toast ' + type; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function() {
      t.style.transition = 'opacity .3s';
      t.style.opacity = '0';
      setTimeout(function() { t.remove(); }, 320);
    }, 4000);
  }

  // Retry with MutationObserver (Bug B fix)
  function fillGroupWithRetry(group, names, delayMs) {
    var maxRetries = 10;
    var retryDelay = 1200;
    var retryCount = 0;
    var observer = null;

    function doAttempt() {
      if (!shouldAutoFill()) { cleanup(); return; }

      var totalS = 0, totalF = 0;
      var seen = new Set();
      group.forEach(function(item) {
        if (seen.has(item.preset.id)) return;
        seen.add(item.preset.id);
        var fieldMap = {};
        (item.profile.fields || []).forEach(function(f) {
          fieldMap[f.id] = { selector: f.selector, type: f.type };
        });
        var res = autoFill(item.preset.data || {}, fieldMap, item.overwrite);
        totalS += res.s; totalF += res.f;
      });

      if (totalS > 0) {
        markAutoFillDone();
        showAutoToast('[AutoFill] ' + names.join(', ') + ' - ' + totalS + ' fields filled', 'success');
        cleanup();
        return;
      }

      if (totalF > 0 && retryCount < maxRetries) {
        retryCount++;
        if (!observer) {
          observer = new MutationObserver(function() {
            observer.disconnect();
            observer = null;
            setTimeout(doAttempt, 300);
          });
          observer.observe(document.body, { childList: true, subtree: true });
        }
        setTimeout(function() { if (observer) { observer.disconnect(); observer = null; } }, retryDelay);
      } else if (totalF > 0) {
        markAutoFillDone();
        showAutoToast('[AutoFill] URL matched but selectors not found - check config', 'warning');
        cleanup();
      }

      function cleanup() {
        if (observer) { observer.disconnect(); observer = null; }
      }
    }

    setTimeout(doAttempt, delayMs);
  }

  async function run(fromSPA) {
    try {
      if (!shouldAutoFill()) {
        console.debug('[UFF] auto-fill skipped: already done');
        return;
      }

      var data = await new Promise(function(r) { chrome.storage.local.get('profiles', r); });
      var profiles = data.profiles;
      if (!profiles || !profiles.length) return;
      var pageUrl = location.href;

      var byDelay = {};
      profiles.forEach(function(profile) {
        (profile.presets || []).forEach(function(preset) {
          var af = preset.autoFill;
          if (!af || !af.enabled) return;
          var globalDelay  = af.delay != null ? af.delay : 800;
          var overwrite    = af.overwrite !== false;
          var activeRules  = (af.rules || []).filter(function(r) { return r.active !== false && r.url; });

          activeRules.forEach(function(rule) {
            if (!urlMatches(rule.mode, rule.url, pageUrl)) return;
            var delay = (rule.delay != null && !isNaN(rule.delay)) ? rule.delay : globalDelay;
            if (!byDelay[delay]) byDelay[delay] = [];
            byDelay[delay].push({ profile: profile, preset: preset, overwrite: overwrite });
          });
        });
      });

      var delayKeys = Object.keys(byDelay);
      delayKeys.forEach(function(delayStr) {
        var group = byDelay[delayStr];
        var names = [];
        var seen = new Set();
        group.forEach(function(item) {
          if (!seen.has(item.preset.id)) {
            seen.add(item.preset.id);
            names.push(item.preset.name);
          }
        });
        fillGroupWithRetry(group, names, parseInt(delayStr, 10));
      });
    } catch (e) {
      console.debug('[UFF] auto-fill v4:', e.message);
    }
  }

  // === SPA Navigation Detection (Bug A fix) ===
  (function setupSPADetection() {
    var lastUrl = location.href;
    var navTimer = null;

    function onUrlChange() {
      clearTimeout(navTimer);
      navTimer = setTimeout(function() {
        if (location.href !== lastUrl) {
          console.debug('[UFF] SPA nav: ' + lastUrl + ' -> ' + location.href);
          lastUrl = location.href;
          if (st) st.reset();
          run(true);
        }
      }, 600);
    }

    var _pushState = history.pushState;
    history.pushState = function() {
      _pushState.apply(history, arguments);
      onUrlChange();
    };

    var _replaceState = history.replaceState;
    history.replaceState = function() {
      _replaceState.apply(history, arguments);
      onUrlChange();
    };

    window.addEventListener('popstate', onUrlChange);
    window.addEventListener('hashchange', onUrlChange);
  })();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { run(false); });
  } else {
    run(false);
  }
})();
