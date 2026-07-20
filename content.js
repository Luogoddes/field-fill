/**
 * content.js — 字段填充 · Universal Field Filler v1.4.7
 * 洛 - 愿执一生笔，画汝眉上柳...
 *
 * ★ v1.4.7 拾取器方案：
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
        if (s) {
          var parsed = JSON.parse(s);
          var ts = parsed && parsed.timestamp;
          if (ts && Date.now() - ts < 5000) return false;
          // ★ 修复：过期条目主动清理，避免 localStorage 残留累积
          localStorage.removeItem(k);
        }
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
      /* Page picker overlays */
      .__uff-page-pick-overlay{
        position:fixed;z-index:2147483646;box-sizing:border-box;
        border:2px dashed #4ADE80;border-radius:6px;
        background:rgba(74,222,128,.08);pointer-events:none;
        transition:opacity .2s;
      }
      .__uff-page-pick-overlay.added{opacity:.35;border-style:solid;}
      .__uff-page-pick-add{
        position:absolute;top:-11px;right:-11px;width:22px;height:22px;
        border-radius:50%;background:#4ADE80;color:#fff;border:none;
        font-size:15px;line-height:22px;text-align:center;cursor:pointer;
        pointer-events:auto;box-shadow:0 2px 8px rgba(0,0,0,.2);
        display:flex;align-items:center;justify-content:center;
        transition:transform .15s, background .15s;
      }
      .__uff-page-pick-add:hover{transform:scale(1.1);background:#22c55e;}
      .__uff-page-pick-label{
        position:absolute;left:0;bottom:100%;margin-bottom:4px;
        background:rgba(0,0,0,.75);color:#fff;font-size:11px;
        padding:2px 6px;border-radius:4px;white-space:nowrap;pointer-events:none;
      }
      #__uff_page_pick_badge{
        position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
        z-index:2147483647;background:linear-gradient(135deg,#10b981,#34d399);
        color:#fff;padding:8px 18px;border-radius:999px;font-size:12px;font-weight:600;
        box-shadow:0 4px 16px rgba(16,185,129,.4);pointer-events:none;
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;
        animation:uffIn .25s ease;white-space:nowrap;
      }
    `;
    (document.head || document.documentElement).appendChild(s);
  }

  // ── Toast (stacked with auto-reposition) ──────────────
  let _toastStack = [];
  function repositionToasts() {
    _toastStack.forEach((el, i) => { el.style.top = (18 + i * 56) + 'px'; });
  }
  function showToast(msg, type = 'info', ms = 2800) {
    // 最多保留 5 个，防止无限下推
    if (_toastStack.length >= 5) {
      const oldest = _toastStack.shift();
      if (oldest && oldest.parentNode) oldest.remove();
      repositionToasts();
    }
    const t = document.createElement('div');
    t.className = `uff-toast ${type}`;
    t.textContent = msg;
    t.style.top = (18 + _toastStack.length * 56) + 'px';
    document.body.appendChild(t);
    _toastStack.push(t);
    const remove = () => {
      const idx = _toastStack.indexOf(t);
      if (idx > -1) _toastStack.splice(idx, 1);
      t.style.opacity = '0';
      setTimeout(() => { t.remove(); repositionToasts(); }, 320);
    };
    setTimeout(remove, ms);
  }

  // ── Selector generator ────────────────────────────────
  function getSel(el) {
    if (el.id) {
      try { return '#' + CSS.escape(el.id); } catch (_) { return '#' + el.id; }
    }
    if (el.name) {
      try { return `[name="${CSS.escape(el.name)}"]`; } catch (_) { return `[name="${el.name}"]`; }
    }
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
    if (el.tagName === 'INPUT' && (el.type === 'time' || el.type === 'date')) return el.type;
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

  // 解析动态变量：{{date[+N]}}、{{time}}、{{datetime}}、{{timestamp}}
  function resolveTemplateValue(val) {
    if (typeof val !== 'string') return val;
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const fmtTime = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const fmtDateTime = d => `${fmtDate(d)} ${fmtTime(d)}`;
    return val
      .replace(/\{\{date(?:([+-]\d+))?\}\}/g, (_, off) => {
        const d = new Date(now);
        if (off) d.setDate(d.getDate() + parseInt(off, 10));
        return fmtDate(d);
      })
      .replace(/\{\{time\}\}/g, fmtTime(now))
      .replace(/\{\{datetime\}\}/g, fmtDateTime(now))
      .replace(/\{\{timestamp\}\}/g, String(now.getTime()));
  }

  // 解析共享字段引用：{{shared:field-id}}
  // sharedValues 为新格式对象 { fieldId: value }；同时兼容旧格式 sharedFields 数组
  function resolveSharedValue(val, sharedValues) {
    if (typeof val !== 'string' || !val.includes('{{shared:')) return val;
    return val.replace(/\{\{shared:([^}]+)\}\}/g, (_, sid) => {
      if (!sharedValues) return '';
      if (Array.isArray(sharedValues)) {
        const sf = sharedValues.find(s => s.id === sid);
        return sf ? sf.value : '';
      }
      return sharedValues[sid] !== undefined ? sharedValues[sid] : '';
    });
  }
  function resolveSharedValues(config, sharedValues) {
    if (!config || typeof config !== 'object') return config;
    const resolved = {};
    for (const [fid, val] of Object.entries(config)) resolved[fid] = resolveSharedValue(val, sharedValues);
    return resolved;
  }

  // 统一设置 <select> 值：按 value 精确 → text 精确 → 包含匹配
  function setSelectValue(el, val) {
    const v = String(val).trim().toLowerCase();
    if (!v) return false;
    const opts = Array.from(el.options).map(o => ({
      value: String(o.value || '').trim().toLowerCase(),
      text:  String(o.textContent || '').trim().toLowerCase(),
      option: o
    }));
    let hit = opts.find(o => o.value === v);
    if (!hit) hit = opts.find(o => o.text === v);
    if (!hit) hit = opts.find(o => o.value.includes(v) || o.text.includes(v));
    if (!hit) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    if (setter) setter.call(el, hit.option.value); else el.value = hit.option.value;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // 填充 Ant Design / 自定义下拉组件：展开 → 输入 → 点击匹配选项
  function setAntSelectValue(container, val) {
    const raw = String(val).trim();
    if (!raw) return false;

    // 先点击容器展开下拉菜单
    container.focus();
    container.click();

    // 如果是可搜索的 select，先在输入框里输入值触发筛选
    const input = container.querySelector('.ant-select-selection-search-input');
    if (input && !input.readOnly && input.style.opacity !== '0') {
      input.focus();
      input.value = raw;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // 等待下拉菜单渲染后点击匹配项
    setTimeout(function() {
      const selectors = '.ant-select-item-option-content, .ant-select-dropdown-menu-item-content, .ant-cascader-menu-item-content';
      const options = document.querySelectorAll(selectors);
      const target = Array.from(options).find(function(o) {
        const text = o.textContent.trim();
        return text === raw || text.toLowerCase() === raw.toLowerCase() || text.includes(raw);
      });
      if (target) {
        const item = target.closest('.ant-select-item-option, .ant-select-dropdown-menu-item, .ant-cascader-menu-item');
        if (item) {
          item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          item.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true }));
          item.click();
        }
      }
    }, 120);

    return true;
  }

  // ── Core fill ─────────────────────────────────────────
  function doFill(config, fieldMap) {
    let success = 0, fail = 0;
    const failedFields = []; // ★ 记录失败字段详情，便于排查
    for (const [fid, def] of Object.entries(fieldMap)) {
      let val = config[fid];
      if (val === undefined || val === null) continue;
      val = resolveTemplateValue(val);
      if (String(val).trim() === '') continue;
      const el = document.querySelector(def.selector);
      if (!el) { fail++; failedFields.push({ fid, selector: def.selector, reason: '元素未找到' }); continue; }
      try {
        if (def.type === 'text' || def.type === 'textarea') {
          const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          setter ? setter.call(el, String(val)) : (el.value = String(val));
          el.dispatchEvent(new Event('input',  { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          success++;
        } else if (def.type === 'select') {
          // 原生 <select>
          if (el.tagName === 'SELECT') {
            if (setSelectValue(el, val)) success++;
            else { fail++; failedFields.push({ fid, selector: def.selector, reason: '选项不匹配' }); }
          }
          // Ant Design / 自定义下拉
          else if ((el.classList && el.classList.contains('ant-select')) || (el.closest && el.closest('.ant-select'))) {
            const container = (el.classList && el.classList.contains('ant-select')) ? el : el.closest('.ant-select');
            if (setAntSelectValue(container, val)) success++;
            else { fail++; failedFields.push({ fid, selector: def.selector, reason: '自定义下拉展开失败' }); }
          }
          else { fail++; failedFields.push({ fid, selector: def.selector, reason: '非可填充下拉元素' }); }
        } else if (def.type === 'time' || def.type === 'date') {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          setter ? setter.call(el, String(val)) : (el.value = String(val));
          el.dispatchEvent(new Event('input',  { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          success++;
        }
      } catch (e) { fail++; failedFields.push({ fid, selector: def.selector, reason: e.message }); console.debug('[UFF]', fid, e.message); }
    }
    const firstSel = Object.values(fieldMap)[0]?.selector;
    if (firstSel) document.querySelector(firstSel)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return { success, fail, failedFields };
  }

  // ── Real-time hover picker state ──────────────────────
  let _pickerActive = false;
  let _lastHl = null;
  let _badge = null;
  let _sendThrottle = null; // throttle sendMessage calls
  let _confirming = false;  // 防止确认过程中重复触发

  // 复制文本到剪贴板（兼容旧浏览器）
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function() { fallbackCopy(text); });
    } else {
      fallbackCopy(text);
    }
    function fallbackCopy(str) {
      var ta = document.createElement('textarea');
      ta.value = str;
      ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      try { document.execCommand('copy'); } catch (_) {}
      document.body.removeChild(ta);
    }
  }

  // 当用户 hover/click 到 SVG、图标、span 等内层元素时，向上查找到真正可点击的父元素
  function findClickableTarget(el) {
    if (!el) return null;
    const clickableTags = ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY'];
    const clickableRoles = ['button', 'link', 'tab', 'menuitem', 'switch', 'checkbox', 'radio'];
    let cur = el;
    while (cur && cur !== document.body) {
      const tag = cur.tagName;
      if (clickableTags.includes(tag)) return cur;
      const role = cur.getAttribute('role');
      if (clickableRoles.includes(role)) return cur;
      if (cur.hasAttribute('onclick')) return cur;
      cur = cur.parentElement;
    }
    return el;
  }

  function isInteractive(el) {
    if (!el) return false;
    const tag = el.tagName;
    if (['INPUT','SELECT','TEXTAREA','BUTTON','A','SUMMARY'].includes(tag)) {
      return !(tag === 'INPUT' && el.type === 'hidden');
    }
    const role = el.getAttribute('role');
    if (['button','link','tab','menuitem','switch','checkbox','radio'].includes(role)) return true;
    if (el.hasAttribute('onclick')) return true;
    return false;
  }

  function startPicker() {
    if (_pickerActive) return;
    _pickerActive = true;
    _confirming = false;

    // 启动前清理可能残留的高亮，防止旧状态干扰
    document.querySelectorAll('.__uff-hl').forEach(el => el.classList.remove('__uff-hl'));

    // Show badge
    _badge = document.createElement('div');
    _badge.id = '__uff_pick_badge';
    _badge.textContent = '🎯 拾取模式 · 悬停高亮后按空格确认  |  按 ESC 退出';
    document.body.appendChild(_badge);

    document.addEventListener('mouseover', _onHover, true);
    document.addEventListener('click',     _onClick, true);
    document.addEventListener('keydown',   _onKey,   true);
  }

  function stopPicker(delay = 0) {
    if (!_pickerActive && !_confirming) return;
    _pickerActive = false;
    _confirming = false;
    document.removeEventListener('mouseover', _onHover, true);
    document.removeEventListener('click',     _onClick, true);
    document.removeEventListener('keydown',   _onKey,   true);
    if (_lastHl) { _lastHl.classList.remove('__uff-hl'); _lastHl = null; }
    if (_badge) { _badge.remove(); _badge = null; }
    // Notify background that picker ended（点击/空格确认时延迟，确保 popup 先收到 clicked）
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: 'pickerEnd' }).catch(() => {});
    }, delay);
  }

  // ── Page picker: batch highlight all fillable fields on the page ──
  let _pagePickerActive = false;
  let _pageOverlays = [];
  let _pagePickBadge = null;
  let _pagePickInterval = null;

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    return true;
  }

  function startPagePicker() {
    if (_pagePickerActive) return;
    _pagePickerActive = true;
    stopPicker();
    scanPageFields();

    _pagePickBadge = document.createElement('div');
    _pagePickBadge.id = '__uff_page_pick_badge';
    _pagePickBadge.textContent = '📋 页面拾取模式 · 点击 + 加入预选  |  按 ESC 退出';
    document.body.appendChild(_pagePickBadge);

    document.addEventListener('keydown', _onPageKey, true);
    window.addEventListener('scroll', _onPageScroll, true);
    window.addEventListener('scroll', _onPageScrollEnd, true);
    window.addEventListener('resize', _onPageScroll, true);
    window.addEventListener('resize', _onPageScrollEnd, true);

    // 每 500ms 刷新一次，兼容 div 内部滚动等 window scroll 监听不到的场景
    _pagePickInterval = setInterval(function() {
      if (!_pagePickerActive) return;
      refreshPageOverlays();
      scanPageFields();
    }, 500);
  }

  function stopPagePicker() {
    if (!_pagePickerActive) return;
    _pagePickerActive = false;
    _pageOverlays.forEach(o => o.remove());
    _pageOverlays = [];
    if (_pagePickBadge) { _pagePickBadge.remove(); _pagePickBadge = null; }
    document.removeEventListener('keydown', _onPageKey, true);
    window.removeEventListener('scroll', _onPageScroll, true);
    window.removeEventListener('scroll', _onPageScrollEnd, true);
    window.removeEventListener('resize', _onPageScroll, true);
    window.removeEventListener('resize', _onPageScrollEnd, true);
    if (_pageScrollRAF) { cancelAnimationFrame(_pageScrollRAF); _pageScrollRAF = null; }
    clearTimeout(_pageScanDebounce);
    if (_pagePickInterval) { clearInterval(_pagePickInterval); _pagePickInterval = null; }
  }

  function scanPageFields() {
    const selectors = [
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]):not([type="file"])',
      'textarea',
      'select',
      '.ant-select:not(.ant-select-disabled)',
      '.el-input__inner',
      '.el-textarea__inner'
    ];
    const elements = document.querySelectorAll(selectors.join(', '));
    elements.forEach(function(el, idx) {
      if (!isVisible(el)) return;
      // 对于自定义组件，以容器为边界
      const target = el.classList.contains('ant-select') ? el : el;
      // 已存在该元素的 overlay 则跳过
      if (_pageOverlays.some(o => o.__targetEl === target)) return;
      createPageOverlay(target, idx);
    });
    updatePagePickBadge();
  }

  function createPageOverlay(el, idx) {
    const rect = el.getBoundingClientRect();
    const overlay = document.createElement('div');
    overlay.className = '__uff-page-pick-overlay';
    overlay.__targetEl = el;
    overlay.dataset.index = idx;
    // overlay 是 position:fixed，坐标直接取相对于视口的 getBoundingClientRect
    overlay.style.left   = rect.left + 'px';
    overlay.style.top    = rect.top + 'px';
    overlay.style.width  = rect.width + 'px';
    overlay.style.height = rect.height + 'px';

    const label = document.createElement('div');
    label.className = '__uff-page-pick-label';
    label.textContent = (getLabel(el) || el.name || el.id || el.placeholder || '字段') + ' · ' + getElType(el);
    overlay.appendChild(label);

    const btn = document.createElement('button');
    btn.className = '__uff-page-pick-add';
    btn.innerHTML = '＋';
    btn.title = '添加到字段列表';
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      addPagePickedField(el, overlay);
    });
    overlay.appendChild(btn);

    document.body.appendChild(overlay);
    _pageOverlays.push(overlay);
  }

  function addPagePickedField(el, overlay) {
    const selector = getSel(el);
    const type     = getElType(el);
    const label    = getLabel(el) || el.name || el.id || el.placeholder || '';
    const candidateId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const field    = { candidateId, selector, type, label, ts: Date.now() };

    chrome.storage.local.get('__pagePickedCandidates', function(data) {
      const arr = data.__pagePickedCandidates || [];
      // 简单去重：相同 selector 不再添加
      if (arr.some(f => f.selector === selector)) {
        showToast('该字段已在预选列表中', 'warning');
        return;
      }
      arr.push(field);
      chrome.storage.local.set({ __pagePickedCandidates: arr }, function() {
        overlay.classList.add('added');
        updatePagePickBadge();
        showToast('✅ 已加入预选：' + (label || selector), 'success', 1400);
      });
    });
  }

  function updatePagePickBadge() {
    if (!_pagePickBadge) return;
    chrome.storage.local.get('__pagePickedCandidates', function(data) {
      const count = (data.__pagePickedCandidates || []).length;
      _pagePickBadge.textContent = '📋 页面拾取模式 · 已加入预选 ' + count + ' 个字段  |  按 ESC 退出';
    });
  }

  // 滚动时动态刷新所有 overlay 位置
  let _pageScrollRAF = null;
  function _onPageScroll() {
    if (_pageScrollRAF) cancelAnimationFrame(_pageScrollRAF);
    _pageScrollRAF = requestAnimationFrame(refreshPageOverlays);
  }

  let _pageScanDebounce = null;
  function _onPageScrollEnd() {
    clearTimeout(_pageScanDebounce);
    _pageScanDebounce = setTimeout(function() {
      if (_pagePickerActive) scanPageFields();
    }, 300);
  }

  function refreshPageOverlays() {
    _pageOverlays.forEach(function(overlay) {
      const el = overlay.__targetEl;
      if (!el || !document.body.contains(el)) { overlay.remove(); return; }
      const rect = el.getBoundingClientRect();
      const visible = isVisible(el) && rect.bottom > 0 && rect.top < window.innerHeight;
      overlay.style.display = visible ? 'block' : 'none';
      if (!visible) return;
      // fixed 定位直接取视口坐标
      overlay.style.left   = rect.left + 'px';
      overlay.style.top    = rect.top + 'px';
      overlay.style.width  = rect.width + 'px';
      overlay.style.height = rect.height + 'px';
    });
  }

  function _onPageKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      stopPagePicker();
    }
  }

  function _onHover(e) {
    if (!_pickerActive || _confirming) return;
    const el = findClickableTarget(e.target);
    if (!el || !isInteractive(el)) {
      if (_lastHl) { _lastHl.classList.remove('__uff-hl'); _lastHl = null; }
      return;
    }

    if (_lastHl && _lastHl !== el) { _lastHl.classList.remove('__uff-hl'); _lastHl = null; }

    el.classList.add('__uff-hl');
    _lastHl = el;

    // Throttle: send at most once per 80ms
    clearTimeout(_sendThrottle);
    _sendThrottle = setTimeout(() => {
      if (!_pickerActive || _confirming) return;
      const selector = getSel(el);
      const type     = getElType(el);
      const label    = getLabel(el) || el.name || el.id || '';
      // Send to background → stored in storage → popup polls it
      chrome.runtime.sendMessage({
        action: 'pickerHover', selector, type, label
      }).catch(() => {});
    }, 80);
  }

  function _confirmPick(el) {
    if (!el || _confirming) return;
    el = findClickableTarget(el);
    if (!el || !isInteractive(el)) return;
    // 立即彻底清理拾取状态，防止任何后续事件继续触发
    _confirming = true;
    _pickerActive = false;
    document.removeEventListener('mouseover', _onHover, true);
    document.removeEventListener('click',     _onClick, true);
    document.removeEventListener('keydown',   _onKey,   true);
    clearTimeout(_sendThrottle); _sendThrottle = null;
    // 清理所有可能的高亮，避免 _lastHl 引用异常导致残留
    document.querySelectorAll('.__uff-hl').forEach(h => h.classList.remove('__uff-hl'));
    if (_lastHl) { _lastHl.classList.remove('__uff-hl'); _lastHl = null; }
    if (_badge)  { _badge.remove(); _badge = null; }

    const selector = getSel(el);
    const type     = getElType(el);
    const label    = getLabel(el) || el.name || el.id || '';

    // 自动复制拾取到的 selector 到剪贴板，原有回填逻辑不变
    copyText(selector);

    // 等待 background 确认收到后再结束，避免 pickerEnd 与 pickerHover 竞态导致结果丢失
    let ended = false;
    const doEnd = () => { if (!ended) { ended = true; stopPicker(180); } };
    chrome.runtime.sendMessage({
      action: 'pickerHover', selector, type, label, clicked: true
    }, doEnd);
    setTimeout(doEnd, 600); // 超时保护
  }

  function _onKey(e) {
    if (!_pickerActive || _confirming) return;
    if (e.key === 'Escape') {
      stopPicker();
      return;
    }
    // 空格键确认当前高亮元素并结束拾取（兼容多种浏览器/输入法场景）
    const isSpace = e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar' || e.keyCode === 32 || e.which === 32;
    if (isSpace && _lastHl) {
      e.preventDefault();
      e.stopPropagation();
      _confirmPick(_lastHl);
      return;
    }
  }

  function _onClick(e) {
    if (!_pickerActive || _confirming) return;
    const el = findClickableTarget(e.target);
    if (!el || !isInteractive(el)) return;

    // 点击即确认：阻止页面默认交互，并把最终选择发回 popup
    e.preventDefault();
    e.stopPropagation();

    if (_lastHl && _lastHl !== el) { _lastHl.classList.remove('__uff-hl'); }
    el.classList.add('__uff-hl');
    _lastHl = el;

    _confirmPick(el);
  }

  // ── Message Listener ──────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

    // Ping / keep-alive for popup to detect whether content script is ready
    if (msg.action === 'ping') {
      sendResponse({ ok: true });
      return false;
    }

    // Primary fill: popup sends config+fieldMap directly
    if (msg.action === 'fillDirect') {
      if (window.__uffAutoFillState) window.__uffAutoFillState.markDone();
      const result = doFill(msg.config || {}, msg.fieldMap || {});
      // ★ 增强反馈：失败时附带失败字段详情到 console
      if (result.fail > 0 && result.failedFields?.length) {
        console.warn('[UFF] 失败字段：', result.failedFields);
        const sample = result.failedFields.slice(0, 2).map(f => f.selector).join(', ');
        showToast(`填充完成 ${result.success} 字段，失败 ${result.fail} 个：${sample}${result.failedFields.length > 2 ? '...' : ''}`, 'warning');
      } else if (result.success > 0) {
        showToast(`填充完成！${result.success} 个字段`, 'success');
      } else {
        showToast('未匹配到任何字段，请检查选择器', 'error');
      }
      sendResponse({ result });
      return true;
    }

    // ★ background 触发的 Toast 显示
    if (msg.action === 'showToast') {
      showToast(msg.msg || '', msg.type || 'info');
      sendResponse({ ok: true });
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
        // ★ 修复：preset.data 可能为 undefined（畸形数据），防御性默认 {}
        // ★ 解析共享字段引用，确保热键/右键菜单使用最新统一值
        const result = doFill(resolveSharedValues(preset.data || {}, profile.sharedValues), fieldMap);
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

    // Start page picker mode (batch highlight all fillable fields)
    if (msg.action === 'startPagePicker') {
      startPagePicker();
      sendResponse({ ok: true });
      return true;
    }

    // Stop page picker mode
    if (msg.action === 'stopPagePicker') {
      stopPagePicker();
      sendResponse({ ok: true });
      return true;
    }

    // ★ 执行自动化（按顺序执行 click/fill/wait/form 步骤）
    // 立即响应 popup，异步执行流程（form 步骤需要用户交互，可能耗时很久）
    if (msg.action === 'runFlow') {
      if (window.__uffAutoFillState) window.__uffAutoFillState.markDone();
      sendResponse({ ok: true, message: '流程已触发' });
      executeFlow(msg.flow || {}).catch(err => {
        showToast('❌ 流程执行异常：' + (err.message || '未知错误'), 'error');
      });
      return false; // 已同步响应
    }

    // 测试点击元素（自动化 click 步骤）
    if (msg.action === 'testClick') {
      (async () => {
        const el = await waitForElement(msg.selector, 3000);
        if (!el) {
          showToast('❌ 未找到元素：' + msg.selector, 'error');
          sendResponse({ ok: false });
          return;
        }
        el.click();
        showToast('👆 已执行点击：' + msg.selector, 'info', 1800);
        sendResponse({ ok: true });
      })();
      return true;
    }
  });

  // ════════════════════════════════════════════
  //  ★ 自动化执行引擎
  //  支持 4 种步骤：click / fill / wait / form
  //  - form 步骤会弹出页内模态框，等用户填入字段后继续
  // ════════════════════════════════════════════
  async function executeFlow(flow) {
    const steps = flow.steps || [];
    if (!steps.length) {
      showToast('⚠️ 流程无步骤', 'warning');
      return { executed: 0, failed: 0 };
    }
    showToast(`🤖 开始执行流程「${flow.name || ''}」(${steps.length} 步)`, 'info', 2200);
    let executed = 0, failed = 0;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const prefix = `[${i + 1}/${steps.length}]`;
      try {
        if (step.type === 'click') {
          const el = await waitForElement(step.selector, 3000);
          if (!el) {
            showToast(`${prefix} ❌ 未找到元素：${step.selector}`, 'error');
            failed++; continue;
          }
          el.click();
          executed++;
          showToast(`${prefix} 👆 已点击 ${step.label || step.selector}`, 'info', 1400);
          // 点击后默认等待 300ms 让页面响应
          await sleep(300);
        }
        else if (step.type === 'fill') {
          if (!step.config || !step.fieldMap) {
            showToast(`${prefix} ⚠️ 跳过：预设数据丢失`, 'warning');
            failed++; continue;
          }
          const r = doFill(step.config, step.fieldMap);
          if (r.success > 0) {
            executed++;
            showToast(`${prefix} ✨ 填充 ${r.success} 字段${r.fail ? ' / 失败 ' + r.fail : ''}`, 'success', 1500);
          } else {
            failed++;
            showToast(`${prefix} ⚠️ 未匹配到字段`, 'warning');
          }
        }
        else if (step.type === 'wait') {
          const ms = Math.max(100, Math.min(30000, step.waitMs || 1000));
          showToast(`${prefix} ⏱ 等待 ${ms}ms`, 'info', 1000);
          await sleep(ms);
        }
        else if (step.type === 'waitFor') {
          const timeout = Math.max(500, Math.min(60000, step.timeout || 5000));
          showToast(`${prefix} 👁 等待元素出现：${step.selector}`, 'info', 1200);
          const el = await waitForElement(step.selector, timeout);
          if (el) {
            executed++;
            showToast(`${prefix} ✅ 元素已出现`, 'success', 1200);
          } else {
            failed++;
            showToast(`${prefix} ❌ 等待超时：${step.selector}`, 'error');
          }
        }
        else if (step.type === 'form') {
          const fields = step.fields || [];
          if (!fields.length) {
            showToast(`${prefix} ⚠️ 弹窗步骤无字段配置`, 'warning');
            failed++; continue;
          }
          showToast(`${prefix} 📝 请在弹窗中填写字段`, 'info', 2000);
          const userData = await showFormDialog(fields, step.label || '请填写以下字段');
          if (userData === null) {
            showToast(`${prefix} 用户取消流程`, 'warning');
            return { executed, failed, cancelled: true };
          }
          // 把用户填的数据转换为 doFill 需要的格式
          const config = {};
          const fieldMap = {};
          fields.forEach((f, idx) => {
            const fid = 'uf_' + idx;
            config[fid] = userData[fid];
            fieldMap[fid] = { selector: f.selector, type: 'text' };
          });
          const r = doFill(config, fieldMap);
          if (r.success > 0) {
            executed++;
            showToast(`${prefix} ✨ 弹窗填充 ${r.success} 字段`, 'success', 1500);
          } else {
            failed++;
            showToast(`${prefix} ⚠️ 弹窗字段未匹配`, 'warning');
          }
        }
      } catch (e) {
        failed++;
        showToast(`${prefix} ❌ 步骤异常：${e.message}`, 'error');
      }
    }

    showToast(`🎉 流程完成：${executed} 成功 / ${failed} 失败`, executed > 0 ? 'success' : 'warning', 3000);
    return { executed, failed };
  }

  // 等待元素出现（带超时）
  function waitForElement(selector, timeout = 5000) {
    return new Promise(resolve => {
      const existing = document.querySelector(selector);
      if (existing) return resolve(existing);
      const start = Date.now();
      const obs = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) { obs.disconnect(); resolve(el); }
        else if (Date.now() - start > timeout) { obs.disconnect(); resolve(null); }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      // 兜底超时
      setTimeout(() => { obs.disconnect(); resolve(document.querySelector(selector)); }, timeout);
    });
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ★ 页内弹窗 UI（用于 form 步骤）
  function showFormDialog(fields, title) {
    return new Promise(resolve => {
      // 注入弹窗样式（idempotent）
      if (!document.getElementById('__uff_flow_dialog_style__')) {
        const st = document.createElement('style');
        st.id = '__uff_flow_dialog_style__';
        st.textContent = `
          .uff-fd-overlay{position:fixed;inset:0;z-index:2147483646;background:rgba(15,23,42,.55);
            backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;
            font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
            animation:uffFade .2s ease;}
          @keyframes uffFade{from{opacity:0}to{opacity:1}}
          .uff-fd{background:#fff;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.3);
            width:420px;max-width:92vw;max-height:80vh;overflow:hidden;display:flex;flex-direction:column;
            animation:uffSlide .25s cubic-bezier(.4,0,.2,1);}
          @keyframes uffSlide{from{transform:translateY(20px) scale(.96);opacity:0}to{transform:translateY(0) scale(1);opacity:1}}
          .uff-fd-hd{padding:14px 18px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;
            display:flex;align-items:center;gap:10px;font-size:14px;font-weight:600;}
          .uff-fd-hd-ico{width:30px;height:30px;background:rgba(255,255,255,.2);border-radius:8px;
            display:flex;align-items:center;justify-content:center;font-size:16px;}
          .uff-fd-bd{padding:16px 18px;overflow-y:auto;flex:1;}
          .uff-fd-row{margin-bottom:12px;}
          .uff-fd-row:last-child{margin-bottom:0;}
          .uff-fd-label{display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:5px;}
          .uff-fd-label small{color:#94a3b8;font-weight:400;margin-left:5px;font-family:monospace;}
          .uff-fd-inp{width:100%;padding:8px 11px;border:1px solid #e2e8f0;border-radius:7px;
            font-size:13px;font-family:inherit;background:#fff;color:#1e293b;transition:border-color .15s;}
          .uff-fd-inp:focus{outline:none;border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.12);}
          textarea.uff-fd-inp{min-height:60px;resize:vertical;font-family:inherit;}
          .uff-fd-ft{padding:12px 18px;background:#f8fafc;border-top:1px solid #e2e8f0;
            display:flex;gap:8px;justify-content:flex-end;}
          .uff-fd-btn{padding:8px 18px;border:none;border-radius:7px;font-size:12px;font-weight:600;
            cursor:pointer;transition:all .15s;font-family:inherit;}
          .uff-fd-btn-cancel{background:#fff;color:#64748b;border:1px solid #e2e8f0;}
          .uff-fd-btn-cancel:hover{background:#f1f5f9;}
          .uff-fd-btn-ok{background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;}
          .uff-fd-btn-ok:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(99,102,241,.4);}
        `;
        (document.head || document.documentElement).appendChild(st);
      }

      const overlay = document.createElement('div');
      overlay.className = 'uff-fd-overlay';

      const fieldsHTML = fields.map((f, idx) => {
        const fid = 'uf_' + idx;
        const isArea = (f.name && f.name.length > 30) || /content|body|desc/i.test(f.name);
        return `<div class="uff-fd-row">
          <label class="uff-fd-label">${escapeHtml(f.name || f.selector)}<small>${escapeHtml(f.selector)}</small></label>
          ${isArea
            ? `<textarea class="uff-fd-inp" data-fid="${fid}" rows="3"></textarea>`
            : `<input class="uff-fd-inp" data-fid="${fid}" type="text">`}
        </div>`;
      }).join('');

      overlay.innerHTML = `
        <div class="uff-fd" role="dialog" aria-modal="true">
          <div class="uff-fd-hd">
            <div class="uff-fd-hd-ico">📝</div>
            <div>${escapeHtml(title)}</div>
          </div>
          <div class="uff-fd-bd">${fieldsHTML}</div>
          <div class="uff-fd-ft">
            <button class="uff-fd-btn uff-fd-btn-cancel" data-act="cancel">取消</button>
            <button class="uff-fd-btn uff-fd-btn-ok" data-act="ok">继续执行 ▶</button>
          </div>
        </div>`;

      document.body.appendChild(overlay);

      function close(val) {
        overlay.remove();
        document.removeEventListener('keydown', onKey);
        resolve(val);
      }
      function onKey(e) {
        if (e.key === 'Escape') close(null);
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          collectAndOk();
        }
      }
      function collectAndOk() {
        const data = {};
        overlay.querySelectorAll('[data-fid]').forEach(inp => {
          data[inp.dataset.fid] = inp.value;
        });
        close(data);
      }

      overlay.querySelector('[data-act="cancel"]').addEventListener('click', () => close(null));
      overlay.querySelector('[data-act="ok"]').addEventListener('click', collectAndOk);
      overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
      document.addEventListener('keydown', onKey);

      // 自动聚焦第一个输入框
      setTimeout(() => {
        const first = overlay.querySelector('[data-fid]');
        if (first) first.focus();
      }, 100);
    });
  }

  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[c]);
  }

  // ★ 暴露核心函数供第二个 IIFE（initAutoFill）使用
  window.__uff = { doFill: doFill, showToast: showToast, executeFlow: executeFlow, setSelectValue: setSelectValue, resolveTemplateValue: resolveTemplateValue, resolveSharedValue: resolveSharedValue };

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
      if (window.__uff && window.__uff.resolveTemplateValue) {
        val = window.__uff.resolveTemplateValue(val);
        if (!String(val).trim()) continue;
      }
      var el = document.querySelector(def.selector);
      if (!el) { f++; continue; }
      if (!overwrite) {
        var cur = el.value;
        if (cur && cur.trim()) continue;
      }
      try {
        if (def.type === 'select') {
          if (window.__uff && window.__uff.setSelectValue) {
            if (window.__uff.setSelectValue(el, val)) s++; else f++;
          } else {
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
          }
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
    // 优先复用主 Toast，确保堆叠/重排一致
    if (window.__uff && window.__uff.showToast) {
      window.__uff.showToast(msg, type, 4000);
      return;
    }
    // fallback（主模块尚未就绪时）
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
  // ★ 优化：MutationObserver 加 debounce，避免 SPA 页面频繁触发重试
  function fillGroupWithRetry(group, names, delayMs) {
    var maxRetries = 10;
    var retryDelay = 1200;
    var retryCount = 0;
    var observer = null;
    var debounceTimer = null;

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
        // 解析共享字段引用，自动填充使用最新统一值
        var resolvedConfig = {};
        var rawData = item.preset.data || {};
        var sharedValues = item.profile.sharedValues;
        for (var fid in rawData) {
          if (rawData.hasOwnProperty(fid)) {
            resolvedConfig[fid] = window.__uff && window.__uff.resolveSharedValue
              ? window.__uff.resolveSharedValue(rawData[fid], sharedValues)
              : rawData[fid];
          }
        }
        var res = autoFill(resolvedConfig, fieldMap, item.overwrite);
        totalS += res.s; totalF += res.f;
      });

      if (totalS > 0) {
        markAutoFillDone();
        showAutoToast('🤖 自动填充：' + names.join('、') + ' — 成功 ' + totalS + ' 个字段', 'success');
        cleanup();
        return;
      }

      if (totalF > 0 && retryCount < maxRetries) {
        retryCount++;
        if (!observer) {
          observer = new MutationObserver(function() {
            // ★ debounce：500ms 内的连续变动只触发一次重试
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(function() {
              if (observer) { observer.disconnect(); observer = null; }
              doAttempt();
            }, 500);
          });
          observer.observe(document.body, { childList: true, subtree: true });
        }
        setTimeout(function() { if (observer) { observer.disconnect(); observer = null; } }, retryDelay);
      } else if (totalF > 0) {
        markAutoFillDone();
        showAutoToast('🤖 自动填充：URL 匹配成功，但字段选择器未找到，请检查配置', 'warning');
        cleanup();
      } else {
        // ★ 修复：totalS=0 && totalF=0 时（如 overwrite=false 且字段已有值），静默退出导致 markDone 不调用
        // 后续 SPA 跳转会反复重试。这里主动 markDone 并清理
        markAutoFillDone();
        cleanup();
      }

      function cleanup() {
        if (observer) { observer.disconnect(); observer = null; }
        if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
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

  // ★ 修复 jumpFill 竞态：启动时先检查是否有 jumpFill 待处理数据
  // 若有，立即填充并抑制自动填充，避免自动填充先触发填错数据
  function checkPendingJumpFill() {
    try {
      chrome.runtime.sendMessage({ action: 'checkJumpFill' }).then(function(resp) {
        if (resp && resp.config && resp.fieldMap) {
          // 抑制自动填充
          if (window.__uffAutoFillState) window.__uffAutoFillState.markDone();
          // 等待 DOM 就绪后填充
          var doJumpFill = function() {
            var uff = window.__uff;
            if (!uff || !uff.doFill) { return; }
            var result = uff.doFill(resp.config || {}, resp.fieldMap || {});
            if (result.success > 0) {
              uff.showToast('🔗 跳转填充完成！' + result.success + ' 个字段', 'success');
            } else {
              uff.showToast('⚠️ 跳转填充未匹配到字段，请检查选择器', 'warning');
            }
          };
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', doJumpFill);
          } else {
            // 给页面框架一点时间渲染
            setTimeout(doJumpFill, 300);
          }
        }
      }).catch(function() {});
    } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { checkPendingJumpFill(); run(false); });
  } else {
    checkPendingJumpFill();
    run(false);
  }
})();


// ════════════════════════════════════════════
//  ★ 右侧悬浮 Dock（Read Frog 风格 · 一主二副）
//  - 默认只显示中间主按钮，hover 展开上下两键
//  - 上键：默认预设填充 / 主键：执行首个自动化 / 下键：设置
//  - 位置缓存到 localStorage
// ════════════════════════════════════════════
(function initFloatingDock() {
  if (window.__uffFloatDockInit) return;
  window.__uffFloatDockInit = true;

  // 支持 http / https / file（本地静态 HTML）协议
  if (location.protocol !== 'http:' && location.protocol !== 'https:' && location.protocol !== 'file:') return;
  if (window !== window.top) return;

  var profiles = [];
  var flows = [];
  var isEnabled = true;
  var dock = null;
  var styleEl = null;
  var isDragging = false;
  var dragStartY = 0;
  var dockStartTop = 50;
  var currentTop = 50;

  function iconFrog() {
    return '<svg viewBox="0 0 24 24" style="width:22px;height:22px;display:block;"><circle cx="12" cy="12" r="10" fill="#FFFFFF"/><circle cx="9" cy="10" r="1.8" fill="#111111"/><circle cx="15" cy="10" r="1.8" fill="#111111"/><path d="M8 14c0 2.2 1.8 4 4 4s4-1.8 4-4" fill="none" stroke="#111111" stroke-width="1.6" stroke-linecap="round"/></svg>';
  }

  function iconBolt() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;display:block;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
  }

  function iconGear() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;display:block;"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
  }

  function injectStyle() {
    if (document.getElementById('__uff_float_dock_style__')) return;
    var s = document.createElement('style');
    s.id = '__uff_float_dock_style__';
    s.textContent = '#uff-float-dock{position:fixed;right:0;top:50%;z-index:2147483645;width:60px;height:164px;transform:translateY(-50%) translateX(calc(100% - 44px));transition:transform 400ms cubic-bezier(.4,0,.2,1),top 200ms ease;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;user-select:none;-webkit-user-select:none;pointer-events:auto;} #uff-float-dock.uff-dock-expanded{transform:translateY(-50%) translateX(0);} .uff-dock-btn{position:absolute;right:0;width:40px;height:40px;border-radius:50%;border:1px solid rgba(0,0,0,0.06);background:#FFFFFF;color:#111111;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 200ms cubic-bezier(.4,0,.2,1);box-sizing:border-box;padding:0;box-shadow:0 4px 16px rgba(0,0,0,.08);} .uff-dock-btn:hover{background:#F3F3F3;transform:scale(1.05);} .uff-dock-btn:active{transform:scale(0.95);} .uff-dock-btn svg{display:block;margin:auto;} .uff-dock-btn-main{width:44px;height:44px;top:50%;margin-top:-22px;background:#4ADE80;color:#FFFFFF;border:none;box-shadow:0 4px 16px rgba(74,222,128,.35);z-index:2;} .uff-dock-btn-main:hover{background:#22c55e;transform:scale(1.05);} .uff-dock-btn-sub{top:50%;margin-top:-20px;z-index:1;opacity:0;pointer-events:none;transform:translateY(-52px) scale(0.8);} .uff-dock-btn-sub.bottom{transform:translateY(52px) scale(0.8);} #uff-float-dock.uff-dock-expanded .uff-dock-btn-sub{opacity:1;pointer-events:auto;} #uff-float-dock.uff-dock-expanded .uff-dock-btn-sub.top{transform:translateY(-52px) scale(1);} #uff-float-dock.uff-dock-expanded .uff-dock-btn-sub.bottom{transform:translateY(52px) scale(1);} .uff-dock-tip{position:absolute;right:48px;top:50%;transform:translateY(-50%) translateX(4px);background:rgba(17,17,17,.9);color:#fff;padding:5px 10px;border-radius:7px;font-size:12px;white-space:nowrap;opacity:0;pointer-events:none;transition:all 200ms ease;z-index:10;} .uff-dock-btn:hover .uff-dock-tip{opacity:1;transform:translateY(-50%) translateX(0);}';
    (document.head || document.documentElement).appendChild(s);
    styleEl = s;
  }

  function loadState(cb) {
    chrome.storage.local.get(['profiles', 'flows', 'launcherEnabled'], function(data) {
      profiles = Array.isArray(data.profiles) ? data.profiles : [];
      flows = Array.isArray(data.flows) ? data.flows : [];
      isEnabled = data.launcherEnabled !== false;
      if (cb) cb();
    });
  }

  function loadPosition() {
    try {
      var raw = localStorage.getItem('__uffFloatDockPos');
      if (raw) {
        var pos = JSON.parse(raw);
        if (pos && typeof pos.top === 'number') currentTop = Math.max(5, Math.min(95, pos.top));
      }
    } catch (_) {}
  }

  function savePosition() {
    try { localStorage.setItem('__uffFloatDockPos', JSON.stringify({ top: currentTop })); } catch (_) {}
  }

  function setDockTop(percent) {
    percent = Math.max(5, Math.min(95, percent));
    currentTop = percent;
    if (dock) dock.style.top = percent + '%';
  }

  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, function(c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }

  function getGlobalDefault() {
    for (var i = 0; i < profiles.length; i++) {
      var presets = profiles[i].presets || [];
      for (var j = 0; j < presets.length; j++) {
        if (presets[j].isDefault) return { preset: presets[j], profile: profiles[i] };
      }
    }
    return null;
  }

  function doFillPreset(presetId, profileId) {
    var profile = null;
    for (var i = 0; i < profiles.length; i++) {
      if (profiles[i].id === profileId) { profile = profiles[i]; break; }
    }
    if (!profile) return;
    var preset = null;
    var presets = profile.presets || [];
    for (var i = 0; i < presets.length; i++) {
      if (presets[i].id === presetId) { preset = presets[i]; break; }
    }
    if (!preset) return;

    var fieldMap = {};
    var fields = profile.fields || [];
    for (var i = 0; i < fields.length; i++) {
      fieldMap[fields[i].id] = { selector: fields[i].selector, type: fields[i].type };
    }

    var uff = window.__uff;
    if (!uff || !uff.doFill) {
      if (uff && uff.showToast) uff.showToast('填充模块未就绪', 'error');
      return;
    }

    var data = preset.data || {};
    var hasValue = false;
    for (var k in data) {
      if (data[k] && String(data[k]).trim()) { hasValue = true; break; }
    }
    if (!hasValue) {
      uff.showToast('预设「' + preset.name + '」数据为空', 'warning');
      return;
    }

    if (window.__uffAutoFillState) window.__uffAutoFillState.markDone();
    // 解析共享字段引用，Dock 填充使用最新统一值
    var resolvedData = {};
    var sharedValues = profile.sharedValues;
    for (var k in data) {
      if (data.hasOwnProperty(k)) {
        resolvedData[k] = uff.resolveSharedValue ? uff.resolveSharedValue(data[k], sharedValues) : data[k];
      }
    }
    var r = uff.doFill(resolvedData, fieldMap);
    if (r.success > 0) {
      uff.showToast('已填充「' + preset.name + '」(' + r.success + ' 字段' + (r.fail ? ' / 失败 ' + r.fail : '') + ')', 'success');
    } else {
      uff.showToast('未匹配到字段，请检查选择器', 'warning');
    }
  }

  function doDefaultFill() {
    var def = getGlobalDefault();
    if (def) {
      doFillPreset(def.preset.id, def.profile.id);
    } else {
      var uff = window.__uff;
      if (uff && uff.showToast) uff.showToast('无全局默认预设，请先在扩展中配置', 'warning');
    }
  }

  function doRunFlow() {
    if (!flows.length) {
      var uff = window.__uff;
      if (uff && uff.showToast) uff.showToast('无自动化，请先在设置中创建', 'warning');
      return;
    }
    var uff = window.__uff;
    if (!uff || !uff.executeFlow) {
      if (uff && uff.showToast) uff.showToast('流程模块未就绪', 'error');
      return;
    }

    // 优先执行标记为默认的流程；若无默认则取第一个
    var flow = flows.find(function(f) { return f.isDefault; }) || flows[0];
    var enrichedSteps = [];
    var steps = flow.steps || [];
    for (var i = 0; i < steps.length; i++) {
      var step = steps[i];
      if (step.type === 'fill' && step.presetId) {
        var preset = null;
        var profile = null;
        for (var j = 0; j < profiles.length; j++) {
          var prs = profiles[j].presets || [];
          for (var k = 0; k < prs.length; k++) {
            if (prs[k].id === step.presetId) { preset = prs[k]; profile = profiles[j]; break; }
          }
          if (preset) break;
        }
        if (preset && profile) {
          var fieldMap = {};
          var pfields = profile.fields || [];
          for (var m = 0; m < pfields.length; m++) {
            fieldMap[pfields[m].id] = { selector: pfields[m].selector, type: pfields[m].type };
          }
          var copy = {};
          for (var key in step) {
            if (step.hasOwnProperty(key)) copy[key] = step[key];
          }
          // 解析共享字段引用，流程填充使用最新统一值
          var resolvedConfig = {};
          var rawData = preset.data || {};
          var sharedValues = profile.sharedValues;
          for (var k in rawData) {
            if (rawData.hasOwnProperty(k)) {
              resolvedConfig[k] = uff.resolveSharedValue ? uff.resolveSharedValue(rawData[k], sharedValues) : rawData[k];
            }
          }
          copy.config = resolvedConfig;
          copy.fieldMap = fieldMap;
          enrichedSteps.push(copy);
        } else {
          enrichedSteps.push(step);
        }
      } else {
        enrichedSteps.push(step);
      }
    }

    if (window.__uffAutoFillState) window.__uffAutoFillState.markDone();
    uff.showToast('开始执行流程「' + flow.name + '」', 'info', 2000);
    uff.executeFlow({ id: flow.id, name: flow.name, steps: enrichedSteps }).catch(function(err) {
      uff.showToast('流程执行异常：' + (err.message || '未知错误'), 'error');
    });
  }

  function openPopup() {
    // 通过 background 创建 popup 窗口，避免内容脚本直接 window.open 被 Edge 拦截
    chrome.runtime.sendMessage({ action: 'openPopupWindow' }).catch(function(e) {
      var uff = window.__uff;
      if (uff && uff.showToast) uff.showToast('打开弹窗失败：' + e.message, 'error');
    });
  }

  var dragStartX = 0;
  var dragHasMoved = false;
  var dragButton = null;
  var dragThreshold = 4;
  var dragRAF = null;

  function isInsideDock(x, y) {
    if (!dock) return false;
    var rect = dock.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function expandDock() {
    if (dock) dock.classList.add('uff-dock-expanded');
  }

  function collapseDock() {
    if (dock) dock.classList.remove('uff-dock-expanded');
  }

  function attachDragListeners() {
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('touchmove', handleDragMove, { passive: false });
    document.addEventListener('mouseup', handleDragEnd);
    document.addEventListener('touchend', handleDragEnd);
  }

  function detachDragListeners() {
    document.removeEventListener('mousemove', handleDragMove);
    document.removeEventListener('touchmove', handleDragMove, { passive: false });
    document.removeEventListener('mouseup', handleDragEnd);
    document.removeEventListener('touchend', handleDragEnd);
  }

  function handleDragStart(e) {
    var touch = e.touches && e.touches[0];
    var clientX = e.clientX || (touch ? touch.clientX : 0);
    var clientY = e.clientY || (touch ? touch.clientY : 0);
    if (!isInsideDock(clientX, clientY)) return;

    dragStartY = clientY;
    dragStartX = clientX;
    dockStartTop = currentTop;
    dragHasMoved = false;
    dragButton = e.target && e.target.closest ? e.target.closest('.uff-dock-btn') : null;
    document.body.style.cursor = 'grabbing';
    attachDragListeners();
    e.preventDefault();
  }

  function handleDragMove(e) {
    var touch = e.touches && e.touches[0];
    var clientY = e.clientY || (touch ? touch.clientY : 0);
    var clientX = e.clientX || (touch ? touch.clientX : 0);

    var dy = clientY - dragStartY;
    var dx = clientX - dragStartX;
    if (!dragHasMoved && Math.sqrt(dx * dx + dy * dy) > dragThreshold) {
      dragHasMoved = true;
      isDragging = true;
      // 拖拽开始时禁用过渡动画，避免 top 200ms ease 造成“粘滞”感
      if (dock) dock.style.transition = 'none';
    }
    if (isDragging) {
      if (dragRAF) cancelAnimationFrame(dragRAF);
      dragRAF = requestAnimationFrame(function() {
        var deltaPercent = (dy / window.innerHeight) * 100;
        setDockTop(dockStartTop + deltaPercent);
        dragRAF = null;
      });
    }
    e.preventDefault();
  }

  function handleDragEnd(e) {
    detachDragListeners();
    document.body.style.cursor = '';
    if (dragRAF) { cancelAnimationFrame(dragRAF); dragRAF = null; }
    // 恢复过渡动画
    if (dock) dock.style.transition = '';
    if (isDragging) {
      isDragging = false;
      savePosition();
    } else if (dragButton) {
      var act = dragButton.getAttribute('data-act');
      if (act === 'default') doDefaultFill();
      else if (act === 'flow') doRunFlow();
      else if (act === 'settings') {
        var uff = window.__uff;
        if (uff && uff.showToast) uff.showToast('功能待开发', 'info', 1800);
      }
    }
    dragButton = null;
    dragHasMoved = false;
  }

  function buildUI() {
    if (dock) return;
    injectStyle();

    dock = document.createElement('div');
    dock.id = 'uff-float-dock';
    dock.title = '字段填充（按住拖动调整位置）';
    dock.innerHTML = '' +
      '<button class="uff-dock-btn uff-dock-btn-sub top" data-act="default" aria-label="默认填充">' + iconBolt() + '<span class="uff-dock-tip">默认填充</span></button>' +
      '<button class="uff-dock-btn uff-dock-btn-main" data-act="flow" aria-label="自动化">' + iconFrog() + '<span class="uff-dock-tip">自动化</span></button>' +
      '<button class="uff-dock-btn uff-dock-btn-sub bottom" data-act="settings" aria-label="设置">' + iconGear() + '<span class="uff-dock-tip">设置</span></button>';

    var btnMain = dock.querySelector('[data-act="flow"]');
    btnMain.addEventListener('mouseenter', expandDock);
    dock.addEventListener('mouseleave', collapseDock);

    dock.addEventListener('mousedown', handleDragStart);
    dock.addEventListener('touchstart', handleDragStart, { passive: false });

    setDockTop(currentTop);
    document.body.appendChild(dock);
  }

  function destroyUI() {
    if (dock) { dock.remove(); dock = null; }
    if (styleEl) { styleEl.remove(); styleEl = null; }
  }

  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(function(changes, area) {
      if (area !== 'local') return;
      if (changes.profiles) profiles = Array.isArray(changes.profiles.newValue) ? changes.profiles.newValue : [];
      if (changes.flows) flows = Array.isArray(changes.flows.newValue) ? changes.flows.newValue : [];
      if (changes.launcherEnabled) {
        var newVal = changes.launcherEnabled.newValue !== false;
        if (newVal && !dock) buildUI();
        else if (!newVal && dock) destroyUI();
      }
    });
  }

  // popup 通过消息即时显示/隐藏悬浮球（兼容未启用 storage 监听的环境）
  chrome.runtime.onMessage.addListener(function(msg, _sender, sendResponse) {
    if (msg.action === 'launcherShow') { if (!dock) buildUI(); sendResponse({ ok: true }); }
    else if (msg.action === 'launcherHide') { if (dock) destroyUI(); sendResponse({ ok: true }); }
  });

  function init() {
    loadPosition();
    loadState(function() {
      if (!isEnabled) return;
      if (document.body) buildUI();
      else document.addEventListener('DOMContentLoaded', buildUI);
    });
  }

  init();
})();
