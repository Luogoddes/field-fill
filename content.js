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

  // ── Toast style injection (idempotent) ────────────────
  if (!document.getElementById('__uff_style__')) {
    const s = document.createElement('style');
    s.id = '__uff_style__';
    s.textContent = `
      .uff-toast{position:fixed;top:18px;right:18px;z-index:2147483646;
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
