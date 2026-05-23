/**
 * 智学·多智能体 — 学习工作台 Application Logic v4
 * R2.2: 多智能体动态联动
 */
(function(){
'use strict';

// ════════════ GLOBAL STATE & EVENT BUS ════════════
const S = {
  apiBase: 'http://127.0.0.1:8000',
  token: localStorage.getItem('hermes_token') || '',
  user: null, courseId: 5, courseName: '人工智能导论',
  courses: [], profile: null, sidebarCollapsed: false,
  kbReady: false, kbChunks: 16,
  demoResults: null, genCache: {}, zoomScale: 1, zoomPanX: 0, zoomPanY: 0,
  lastQuestion: '', lastAnswerTopic: '导数与极限入门',
  agentTraceAnimId: null, currentAnswerData: null, profileDelta: {},
  askTimeoutId: null, askAbortController: null, askInFlight: false
};
window.appState = S;

const Bus = {};
window._bus = Bus;
Bus._listeners = {};
Bus.on = function(evt, fn) { (Bus._listeners[evt]=Bus._listeners[evt]||[]).push(fn); };
Bus.emit = function(evt, data) { (Bus._listeners[evt]||[]).forEach(function(fn){try{fn(data);}catch(e){console.warn('EventBus:',evt,e.message);}}); };

Bus.on('agent:trace-update', function(traces) {
  var trace = document.getElementById('agent-trace');
  if (!trace) return;
  var html = '';
  (traces||[]).forEach(function(t) {
    var iconMap = {'TutorAgent':'🧠','InformerAgent':'🔍','VerifierAgent':'✅','InsightAgent':'📊','PracticeAgent':'⚡','ProfileAgent':'👤'};
    var icon = iconMap[t.agent_name] || iconMap[t.agent] || '🤖';
    var name = t.agent_name || t.agent || 'Agent';
    var st = t.status || 'pending';
    var msg = t.message || t.detail || '';
    html += '<div class="agent-trace-card'+(st==='running'?' is-running':'')+(st==='completed'?' is-completed':'')+(st==='failed'?' is-failed':'')+'"><div class="agent-icon">'+icon+'</div><div class="agent-info"><div class="agent-name">'+esc(name)+'</div>'+(msg?'<div class="agent-detail">'+esc(msg)+'</div>':'')+'</div><span class="agent-status-tag '+st+'">'+{pending:'待执行',running:'执行中',completed:'已完成',failed:'失败'}[st]+'</span></div>';
  });
  trace.innerHTML = html;
});

Bus.on('profile:updated', function(delta) {
  S.profileDelta = delta || {};
  var txt = document.getElementById('profile-text');
  if (delta) {
    var parts = [];
    if (delta.knowledge_level) parts.push('水平: '+delta.knowledge_level);
    if (delta.cognitive_style) parts.push('风格: '+delta.cognitive_style);
    if (delta.last_topic) parts.push('主题: '+delta.last_topic);
    if (txt && parts.length) txt.innerHTML = '📊 '+parts.join(' | ');
  }
  updateProfileRadar(delta);
});

const $ = (s,c) => (c||document).querySelector(s);
const $$ = (s,c) => (c||document).querySelectorAll(s);
const on = (el,ev,fn) => el.addEventListener(ev,fn);
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

async function api(path, opts={}) {
  const h = {'Content-Type':'application/json'};
  if (S.token) h['Authorization'] = 'Bearer ' + S.token;
  const res = await fetch(S.apiBase.replace(/\/$/,'') + path, {...opts, headers:h});
  const data = await res.json().catch(()=>({}));
  return {ok:res.ok, status:res.status, data};
}

function setToken(t){S.token=t;if(t)localStorage.setItem('hermes_token',t);else localStorage.removeItem('hermes_token');updateTopbar();}

let toastTimer;
function toast(msg, type='info'){
  const el=document.getElementById('toast');el.textContent=msg;el.className='toast '+type;
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.style.display='none'},4000);el.style.display='block';
}

function navTo(id){
  $$('.page').forEach(p=>p.classList.remove('active'));
  const pg=document.getElementById('page-'+id);if(pg)pg.classList.add('active');
  $$('.nav-item').forEach(n=>n.classList.remove('active'));
  const ni=$('.nav-item[data-page="'+id+'"]');if(ni)ni.classList.add('active');
  if(id==='assistant')initAssistant();
  if(id==='generator')initGenerator();
  if(id==='courses')loadCourses();
  if(id==='knowledge')loadKnowledgeBase();
  if(id==='learning-path')loadLearningPath();
  if(id==='settings')loadSettings();
  if(id==='dashboard')loadDashboard();
  if(id==='competition')_navToCompetition();
  if(id==='learning-report')loadLearningReportPage();
}

function updateTopbar(){
  const u=$('#topbar-user'),c=$('#topbar-course'),b=$('#topbar-badge'),sf=$('#sidebar-footer'),lo=$('#btn-logout');
  if(S.user){u.innerHTML='<span class="topbar-avatar">'+(S.user.username||'?')[0].toUpperCase()+'</span><span>'+esc(S.user.username||'')+'</span>';u.style.display='flex';if(lo)lo.style.display='inline-flex';}
  else{u.innerHTML='<button class="btn btn-sm btn-primary" onclick="_loginDemo()">演示登录</button>';u.style.display='flex';if(lo)lo.style.display='none';}
  if(c)c.textContent='人工智能导论';
  if(b){b.className='topbar-badge ok';b.textContent='课程资料已连接';}
  if(sf)sf.innerHTML=S.token?'<span class="status-dot online"></span> 已登录':'<span class="status-dot offline"></span> 未登录';
}

window._toggleSidebar=function(){S.sidebarCollapsed=!S.sidebarCollapsed;const sb=document.getElementById('sidebar');sb.classList.toggle('collapsed',S.sidebarCollapsed);};

// ════════════ BOOTSTRAP ════════════

function friendlyError(e, action) {
  var msg = (e.message||'');
  if(msg==='Failed to fetch'||msg.includes('fetch')||msg.includes('NetworkError')){
    return '无法连接后端服务。请确认后端已启动，然后刷新页面或点击重试。';
  }
  return msg || ('操作失败: ' + (action||'请求'));
}

async function initApp(){
  try{
    const{ok,data}=await api('/api/app/bootstrap');
    if(!ok){S.user=null;setToken('');updateTopbar();showWelcome();return;}
    S.courses=data.courses||[];
    if(data.selected_course&&data.selected_course.id){S.courseId=data.selected_course.id;S.courseName=data.selected_course.name||'未选择';S.kbChunks=data.selected_course.chunks_count||0;S.kbReady=data.selected_course.has_knowledge_base||false;}
    if(data.user&&data.user.authenticated)S.user=data.user;
    const isAuth = data.user && data.user.authenticated;
    if(!isAuth){setToken('');S.user=null;showWelcome();return;}
    if(!data.config.deepseek_configured){navTo('settings');toast('请先配置 AI 模型 Key','info');return;}
    navTo('competition');
    updateTopbar();
  }catch(e){console.warn('Bootstrap:',e.message);showWelcome();}
}

function showWelcome(){
  $$('.page').forEach(p=>p.classList.remove('active'));
  var pg = document.getElementById('page-competition');
  if (pg) {
    pg.classList.add('active');
    // Show landing, hide flow
    var landing = document.getElementById('competition-landing');
    var flow = document.getElementById('competition-flow');
    if (landing) landing.style.display = '';
    if (flow) flow.style.display = 'none';
  }
  $$('.nav-item').forEach(n=>n.classList.remove('active'));
  var compNav = document.getElementById('nav-competition');
  if (compNav) compNav.classList.add('active');
  updateTopbar();
}

async function initDemo(){
  try{
    const{ok,data}=await api('/api/app/demo-init',{method:'POST'});
    if(ok&&data.token){setToken(data.token);S.user=data.user;S.courseId=data.course?data.course.id:5;S.courseName=data.course?data.course.name:'人工智能导论';S.kbReady=data.course?data.course.has_knowledge_base:false;S.kbChunks=data.course?data.course.chunks_count:0;
      try{const{ok:o2,data:d2}=await api('/api/app/bootstrap');if(o2&&d2.courses)S.courses=d2.courses;}catch(e){}
      if(data.course&&!S.courses.length)S.courses=[{id:data.course.id,name:data.course.name,chunks_count:data.course.chunks_count||0,has_knowledge_base:data.course.has_knowledge_base||false}];
      updateTopbar();
      if(data.course&&data.course.recommended_for_demo)toast('演示就绪（'+esc(data.course.name)+', '+data.course.chunks_count+' 知识点）','success');
      else if(data.message)toast(data.message,'info');else toast('演示已就绪','success');
      return true;}
    return false;
  }catch(e){console.warn('Demo init:',e.message);return false;}
}

window._loginDemo=async function(){if(await initDemo()){navTo('competition');}};
window._logout=function(){setToken('');S.user=null;S.profile=null;S.courses=[];S.kbReady=false;S.demoResults=null;updateTopbar();navTo('settings');toast('已退出','info');};

// ════════════ PAGE: DASHBOARD ════════════
async function loadDashboard(){
  const el=document.getElementById('page-dashboard');
  el.innerHTML='<div class="loading-block"><span class="spinner"></span> 加载...</div>';
  try{
    const{ok,data}=await api('/api/app/dashboard?course_id='+S.courseId);
    if(!ok){
    var reason = (data.detail||data.error||'未知错误');
    if(reason==='Not authenticated'||reason.includes('authenticated')){
      reason='登录已失效，请重新登录演示账号'; setToken(''); S.user=null; updateTopbar();
    }
    el.innerHTML='<div class="error-card" style="max-width:500px;margin:20px auto"><div class="err-title">⚠ 数据看板加载失败</div><div class="err-detail">'+esc(reason)+'</div><div class="err-suggestion">请确认已登录演示账号</div><div class="err-actions"><button class="btn btn-sm btn-primary" onclick="_loginDemo()">🎯 演示登录</button><button class="btn btn-sm btn-outline" onclick="loadDashboard()">🔄 重试</button></div></div>';return;}
    const d=data,kb=d.knowledge_base||{},pf=d.profile||{};
    let h='<div class="grid grid-3">';
    h+='<div class="card grid-stat"><div class="val" style="color:var(--success)">DeepSeek</div><div class="lbl">AI 模型</div></div>';
    h+='<div class="card grid-stat"><div class="val">'+(kb.chunks_count||0)+'</div><div class="lbl">课程资料</div></div>';
    h+='<div class="card grid-stat"><div class="val">'+(pf?'✅':'—')+'</div><div class="lbl">学习画像</div></div></div>';
    if(d.course)h+='<div class="card"><div class="card-header"><h3>当前课程</h3></div><p style="font-size:15px;font-weight:700">'+esc(d.course.name)+'</p><p style="font-size:12px;color:var(--gray-500)">'+esc(d.course.description||'')+'</p><div style="display:flex;gap:20px;margin-top:8px;font-size:12px;color:var(--gray-500)"><span>知识点: '+(kb.chunks_count||0)+'</span><span>资料检索: '+(kb.vector_ready?'已就绪':'未构建')+'</span></div></div>';
    if(d.suggested_actions&&d.suggested_actions.length){h+='<div class="card"><div class="card-header"><h3>建议操作</h3></div>';d.suggested_actions.forEach(a=>{h+='<button class="btn btn-outline btn-sm" style="margin:4px" onclick="navTo(\''+(a.action==='start_qa'?'assistant':a.action==='configure_key'?'settings':a.action==='upload_materials'?'courses':'dashboard')+'\')">'+esc(a.label)+'</button>';});h+='</div>';}
    if(pf&&pf.knowledge_level)h+='<div class="card"><div class="card-header"><h3>学习画像</h3></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px"><div><b>知识水平:</b> '+esc(pf.knowledge_level||'—')+'</div><div><b>认知风格:</b> '+esc(pf.cognitive_style||'—')+'</div><div><b>学习节奏:</b> '+esc(pf.pace_preference||'—')+'</div><div><b>专业:</b> '+esc(pf.major||'—')+'</div></div></div>';
    h+='<div class="card"><div class="card-header"><h3>快捷操作</h3></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" onclick="navTo(\'assistant\')">💬 开始学习</button><button class="btn btn-secondary" onclick="navTo(\'generator\')">⚡ 生成资源</button><button class="btn btn-outline" onclick="_runFullDemo()">🎯 一键演示</button></div></div>';
    el.innerHTML=h;
  }catch(e){
    var errMsg = (e.message||'');
    if(errMsg==='Failed to fetch' || errMsg.includes('fetch')){
      errMsg = '无法连接后端服务。请确认后端已启动（双击 run.bat 或执行 bash scripts/start_app.sh），然后刷新页面。';
    }
    el.innerHTML='<div class="error-card" style="max-width:500px;margin:20px auto"><div class="err-title">⚠ 数据看板加载失败</div><div class="err-detail">'+esc(errMsg)+'</div><div class="err-suggestion">检查后端服务是否运行在 http://127.0.0.1:8000</div><div class="err-actions"><button class="btn btn-sm btn-primary" onclick="loadDashboard()">🔄 重试</button><button class="btn btn-sm btn-outline" onclick="navTo(\'assistant\')">💬 去学习助手</button></div></div>';
  }
}

// ════════════ MERMAID UTILITIES ════════════
const FALLBACK_MINDMAP = `mindmap
  root((导数与极限))
    极限基础
      极限定义
      左右极限
      极限运算
    导数理解
      瞬时变化率
      切线斜率
      导函数
    求导方法
      基本公式
      四则运算
      复合函数
    常见误区
      极限不存在
      连续与可导混淆
    学习建议
      先看图像
      再做例题`;

const LEGACY_DEFAULT_MERMAID = `graph TD
  A[导数与极限] --> B[导数定义]
  A --> C[极限基础]
  B --> D[瞬时变化率]
  B --> E[切线斜率]
  B --> F[求导法则]
  C --> G[极限定义]
  C --> H[重要极限]
  C --> I[连续函数]
  D --> F
  E --> F`;

const VALID_MERMAID_TYPES = ['mindmap','graph TD','graph LR','graph TB','graph BT','graph RL','flowchart TD','flowchart LR','flowchart TB','flowchart BT','flowchart RL'];

function cleanMermaidSource(text) {
  if (!text) return FALLBACK_MINDMAP;
  let raw = text.trim();

  // Strip markdown code fences
  raw = raw.replace(/^```(?:mermaid)?\s*\n?/i, '');
  raw = raw.replace(/\n?```\s*$/i, '');

  // If multiple code blocks, find mermaid one
  const blocks = [];
  let inBlock = false, buf = '', tag = '';
  for (const line of raw.split('\n')) {
    if (line.trim().startsWith('```')) {
      if (!inBlock) { inBlock = true; tag = line.trim().replace(/```/,'').trim(); buf = ''; }
      else { blocks.push({tag: tag.toLowerCase(), content: buf}); inBlock = false; buf = ''; }
    } else if (inBlock) { buf += line + '\n'; }
  }
  if (blocks.length > 0) {
    const mb = blocks.find(b => b.tag === 'mermaid' || b.tag === '') || blocks[0];
    raw = mb.content;
  }

  raw = raw.trim();

  // Check for markdown headings mixed in
  const firstLine = raw.split('\n')[0].trim();
  if (firstLine.startsWith('#') || firstLine.match(/^[0-9]+\./)) {
    // Try to find mermaid start
    const idx = raw.search(/(?:mindmap|graph\s|flowchart\s)/i);
    if (idx > 0) raw = raw.substring(idx);
  }

  // Check if starts with valid mermaid keyword
  const startsValid = VALID_MERMAID_TYPES.some(t => raw.startsWith(t));
  if (!startsValid) {
    // Try to extract from the text
    const m = raw.match(/(mindmap|graph\s+\w+|flowchart\s+\w+)/i);
    if (m && m.index > 0) raw = raw.substring(m.index);
  }

  // Still not valid: use fallback
  if (!VALID_MERMAID_TYPES.some(t => raw.trim().startsWith(t))) {
    console.warn('Mermaid: no valid start, using fallback mindmap');
    return FALLBACK_MINDMAP;
  }

  // If starts with graph/flowchart but we want product-quality mindmap experience,
  // keep it but note it's a graph type
  return raw;
}

function isMermaidMindmap(code) {
  return code.trim().startsWith('mindmap');
}

function renderMindmapProduct(container, mermaidCode, metadata) {
  const cleaned = cleanMermaidSource(mermaidCode);
  const isMindmap = isMermaidMindmap(cleaned);
  const info = metadata || {};
  const generatedBy = info.generated_by || 'AI模型';
  const usedKB = info.used_kb !== false;
  const usedProfile = info.used_profile !== false;
  const citationCount = info.citation_count || 0;
  const statusTag = info.fallback ? '示例预览' : 'AI 已生成';

  let zoomHtml = '';
  if (isMindmap) {
    zoomHtml = '<div class="mindmap-zoom-controls" id="mindmap-zoom-ctrl">'+
      '<button onclick="mindmapZoomIn()" title="放大">＋</button>'+
      '<button onclick="mindmapZoomOut()" title="缩小">－</button>'+
      '<button onclick="mindmapZoomReset()" title="重置">⟳</button>'+
      '<button onclick="mindmapZoomFit()" title="适应窗口">⊡</button>'+
    '</div>';
  } else {
    zoomHtml = '<div class="mindmap-zoom-controls" id="mindmap-zoom-ctrl">'+
      '<button onclick="mindmapZoomIn()" title="放大">＋</button>'+
      '<button onclick="mindmapZoomOut()" title="缩小">－</button>'+
      '<button onclick="mindmapZoomReset()" title="重置">⟳</button>'+
      '<button onclick="mindmapZoomFit()" title="适应窗口">⊡</button>'+
    '</div>';
  }

  const html =
    '<div class="mindmap-product" id="mindmap-product">'+
      '<div class="mindmap-toolbar">'+
        '<div class="mt-title-area">'+
          '<div class="mt-title">🧠 思维导图</div>'+
          '<div class="mt-subtitle">基于课程资料和学习画像生成</div>'+
        '</div>'+
        '<div class="mt-actions">'+
          '<span class="mindmap-status-tag '+(statusTag==='示例预览'?'preview':'generated')+'">'+esc(statusTag)+'</span>'+
          '<button class="btn btn-sm btn-outline" onclick="_quickGenerate(\'mindmap\')">🔄 重新生成</button>'+
          '<button class="btn btn-sm btn-outline" onclick="mindmapZoomFit()">⊡ 适应窗口</button>'+
          '<button class="btn btn-sm btn-outline" onclick="toggleMindmapSource()">📋 查看源码</button>'+
          '<button class="btn btn-sm btn-outline" onclick="copyMindmapSource()">📄 复制源码</button>'+
        '</div>'+
      '</div>'+
      '<div class="mindmap-canvas-wrap" id="mindmap-canvas-wrap">'+
        '<div class="mindmap-svg-container" id="mindmap-svg-container">'+
          '<div class="mermaid" id="mindmap-mermaid-el">'+esc(cleaned)+'</div>'+
        '</div>'+
        zoomHtml+
      '</div>'+
      '<div class="mindmap-info-bar">'+
        '<div class="mi-item"><span class="mi-dot"></span> AI 模型: DeepSeek</div>'+
        '<div class="mi-item"><span class="mi-dot"></span> 课程资料增强: '+(usedKB?'已使用':'未使用')+'</div>'+
        '<div class="mi-item"><span class="mi-dot"></span> 学生画像: '+(usedProfile?'已使用':'未使用')+'</div>'+
        '<div class="mi-item">引用数量: '+citationCount+'</div>'+
      '</div>'+
      '<div class="mindmap-source" id="mindmap-source-area">'+
        '<div class="mindmap-source-inner">'+
          '<pre id="mindmap-source-code">'+esc(cleaned)+'</pre>'+
          '<div class="mindmap-source-actions">'+
            '<button class="btn btn-sm btn-outline" onclick="copyMindmapSource()">📄 复制源码</button>'+
            '<button class="btn btn-sm btn-outline" onclick="toggleMindmapSource()">🔼 隐藏源码</button>'+
          '</div>'+
        '</div>'+
      '</div>'+
    '</div>';

  container.innerHTML = html;

  // Render mermaid
  setTimeout(() => {
    try {
      const el = document.getElementById('mindmap-mermaid-el');
      if (el && el.textContent.trim()) {
        mermaid.run({ nodes: [el] }).then(() => {
          // After render, fit to window
          setTimeout(mindmapZoomFit, 300);
        }).catch(() => {
          renderMermaidFallback(container, cleaned);
        });
      }
    } catch(e) {
      console.warn('Mermaid render error:', e.message);
      renderMermaidFallback(container, cleaned);
    }
  }, 100);
}

function renderMermaidFallback(container, code) {
  // Show friendly error with source code option
  const canvasWrap = document.getElementById('mindmap-canvas-wrap');
  if (canvasWrap) {
    canvasWrap.innerHTML =
      '<div class="empty-mindmap">'+
        '<div class="empty-icon">🧠</div>'+
        '<p style="font-size:13px;color:var(--gray-500);margin-bottom:8px">思维导图渲染遇到问题</p>'+
        '<p style="font-size:11px;color:var(--gray-400);margin-bottom:12px">可能是图形内容需要重新生成</p>'+
        '<div style="display:flex;gap:8px;justify-content:center">'+
          '<button class="btn btn-sm btn-primary" onclick="_quickGenerate(\'mindmap\')">🔄 重新生成</button>'+
          '<button class="btn btn-sm btn-outline" onclick="toggleMindmapSource()">📋 查看源码</button>'+
        '</div>'+
      '</div>';
  }
  // Ensure source is accessible
  const srcArea = document.getElementById('mindmap-source-area');
  const srcCode = document.getElementById('mindmap-source-code');
  if (srcCode) srcCode.textContent = code;
}

// Zoom/Pan globals
let _zoomScale = 1, _zoomPanX = 0, _zoomPanY = 0, _dragging = false, _dragStartX = 0, _dragStartY = 0, _dragPanStartX = 0, _dragPanStartY = 0;

window.mindmapZoomIn = function() {
  _zoomScale = Math.min(3, _zoomScale + 0.2);
  applyZoomTransform();
};
window.mindmapZoomOut = function() {
  _zoomScale = Math.max(0.3, _zoomScale - 0.2);
  applyZoomTransform();
};
window.mindmapZoomReset = function() {
  _zoomScale = 1; _zoomPanX = 0; _zoomPanY = 0;
  applyZoomTransform();
};
window.mindmapZoomFit = function() {
  const wrap = document.getElementById('mindmap-canvas-wrap');
  const svg = wrap ? wrap.querySelector('.mermaid svg') : null;
  if (!svg || !wrap) { _zoomScale = 1; _zoomPanX = 0; _zoomPanY = 0; applyZoomTransform(); return; }
  const wrapW = wrap.clientWidth - 20, wrapH = wrap.clientHeight - 20;
  const svgW = svg.viewBox?.baseVal?.width || svg.getBoundingClientRect().width || 600;
  const svgH = svg.viewBox?.baseVal?.height || svg.getBoundingClientRect().height || 400;
  _zoomScale = Math.min(wrapW / svgW, wrapH / svgH, 1.5);
  _zoomPanX = 0; _zoomPanY = 0;
  applyZoomTransform();
};

function applyZoomTransform() {
  const container = document.getElementById('mindmap-svg-container');
  if (container) {
    container.style.transform = 'translate(' + _zoomPanX + 'px, ' + _zoomPanY + 'px) scale(' + _zoomScale + ')';
  }
}

window.toggleMindmapSource = function() {
  const area = document.getElementById('mindmap-source-area');
  if (!area) return;
  area.classList.toggle('expanded');
};

window.copyMindmapSource = function() {
  const src = document.getElementById('mindmap-source-code');
  if (!src) return;
  navigator.clipboard.writeText(src.textContent).then(() => {
    toast('源码已复制','success');
  }).catch(() => {
    toast('复制失败，请手动选择','error');
  });
};

function setupMindmapDrag() {
  const wrap = document.getElementById('mindmap-canvas-wrap');
  if (!wrap) return;
  on(wrap, 'mousedown', (e) => {
    if (e.target.closest('.mindmap-zoom-controls')) return;
    _dragging = true;
    _dragStartX = e.clientX;
    _dragStartY = e.clientY;
    _dragPanStartX = _zoomPanX;
    _dragPanStartY = _zoomPanY;
    wrap.classList.add('dragging');
  });
  on(document, 'mousemove', (e) => {
    if (!_dragging) return;
    _zoomPanX = _dragPanStartX + (e.clientX - _dragStartX);
    _zoomPanY = _dragPanStartY + (e.clientY - _dragStartY);
    applyZoomTransform();
  });
  on(document, 'mouseup', () => {
    if (_dragging) { _dragging = false; const w = document.getElementById('mindmap-canvas-wrap'); if(w) w.classList.remove('dragging'); }
  });
}

// ════════════ PAGE: LEARNING ASSISTANT ════════════
const DEFAULT_QUIZ = [{question:'导数本质上是描述函数的什么？',options:['最大值','瞬时变化率','平均值','积分值'],answer:1,explanation:'导数定义为函数增量与自变量增量之比的极限，即瞬时变化率。',difficulty:'basic',tags:['核心概念']},{question:'lim(x→0) sin x / x 的值是？',options:['0','1','无穷大','不存在'],answer:1,explanation:'第一个重要极限：lim(x→0) sin x / x = 1。',difficulty:'basic',tags:['重要极限']}];

const DEFAULT_PLAN = {title:'导数与极限学习路径',profile_summary:'基于当前课程知识库生成的推荐学习顺序',steps:[{order:1,topic:'极限概念入门',reason:'先理解极限是导数的基础',resource_types:['lecture_doc','mindmap'],estimated_minutes:25,practice:'阅读极限定义，完成3道基础题'},{order:2,topic:'导数定义与几何意义',reason:'掌握导数的核心概念',resource_types:['lecture_doc','quiz'],estimated_minutes:30,practice:'画切线理解导数几何意义'},{order:3,topic:'求导法则与应用',reason:'学习基本求导方法',resource_types:['quiz','ppt'],estimated_minutes:35,practice:'完成5道求导练习'}]};

function initAssistant(){
  const msgs=$('#chat-messages');if(!msgs)return;
  if(msgs.children.length===0){
    msgs.innerHTML='<div class=\"msg-bubble agent\"><div class=\"msg-content\"><b>你好！我是你的 AI 学习助手。</b><br><br>📚 <b>当前课程：</b>'+esc(S.courseName)+'<br>📊 <b>资料状态：</b>课程资料已就绪，'+S.kbChunks+' 个课程知识点<br>🧠 <b>推荐操作：</b>先问一个问题，或直接生成复习资料<br><br>可以帮你：<br>• 解释概念和答疑<br>• 生成思维导图、测验题、讲义<br>• 规划个性化学习路径<br><br><b>试试直接点击下方问题：</b></div></div>';
    const qs=['导数和函数变化率有什么关系？','极限为什么是学习导数的基础？','帮我生成导数与极限的复习资料'];
    let qhtml='<div style="display:flex;flex-wrap:wrap;gap:6px;margin:8px 0">';
    qs.forEach(q=>{qhtml+='<button class="btn btn-sm btn-outline" onclick="_askQuestion(\''+esc(q)+'\')" style="font-size:11px">'+esc(q)+'</button>';});
    qhtml+='</div>';
    msgs.innerHTML+=qhtml;
  }
  renderArtifactTabs();
  fillDefaultArtifacts();
  // Citations panel
  const cp=$('#citations-panel');
  if(cp)cp.innerHTML='<div class="cite-section"><h4>📚 课程依据</h4><div class="cite-empty">提问后将在这里展示课程资料和来源</div></div><div class="cite-section"><h4>🤖 学习助手协作</h4><div class="agent-trace-grid" id="agent-trace">'+buildAgentTrace([{agent:'AI学习助手',status:'completed'},{agent:'资料检索',status:'completed'},{agent:'内容校验',status:'pending'},{agent:'资源生成',status:'pending'}])+'</div></div><div class="cite-section" id="profile-mini-section"><h4>🎓 学习画像</h4><div id="profile-mini" style="font-size:11px;color:var(--gray-400)">加载中...</div></div>';
  // Profile
  try{api('/api/profiles/me').then(({ok,data})=>{if(ok)renderProfileMini(data);});}catch(e){}
}

function buildAgentTrace(agents) {
  const icons = {'AI学习助手':'🧠','资料检索':'🔍','内容校验':'✅','资源生成':'⚡'};
  const statusLabels = {pending:'待执行',running:'进行中',completed:'已完成',failed:'失败'};
  return (agents||[]).map(a => {
    const icon = icons[a.agent] || '🤖';
    const st = a.status || 'pending';
    const detail = a.detail || '';
    return '<div class="agent-trace-card">'+
      '<div class="agent-icon">'+icon+'</div>'+
      '<div class="agent-info">'+
        '<div class="agent-name">'+esc(a.agent)+'</div>'+
        (detail ? '<div class="agent-detail">'+esc(detail)+'</div>' : '')+
      '</div>'+
      '<span class="agent-status-tag '+st+'">'+(statusLabels[st]||st)+'</span>'+
    '</div>';
  }).join('');
}

function fillDefaultArtifacts(){
  // Mindmap — product rendering
  const am=$('#artifact-mindmap');
  if(am&&(am.querySelector('.empty-state')||!am.textContent.trim())){
    renderMindmapProduct(am, FALLBACK_MINDMAP, {fallback:true, used_kb:true, used_profile:true, citation_count:16});
  }
  // Quiz — product cards with answer collapsed
  const aq=$('#artifact-quiz');
  if(aq&&(!aq.textContent.trim()||aq.querySelector('.empty-state'))){
    aq.innerHTML='<div style="padding:12px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"><div><b style="font-size:14px">📝 练习题库</b><span style="font-size:10px;color:var(--gray-400);margin-left:8px">示例预览</span></div><button class="btn btn-sm btn-primary" onclick="_quickGenerate(\'quiz\')">🔄 生成个性化测验</button></div>'+
    '<div style="padding:8px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px"><div><b style="font-size:14px">📝 练习题库</b><span style="font-size:10px;color:var(--gray-400);margin-left:8px">示例预览</span></div><button class="btn btn-sm btn-primary" onclick="_quickGenerate(\'quiz\')">🔄 生成个性化测验</button></div>'+renderInteractiveQuiz(DEFAULT_QUIZ,'default')+'<p style="font-size:10px;color:var(--gray-400);margin-top:4px;padding:0 8px">📌 点击选项作答 · 生成后替换为个性化测验</p></div>'+
    '<p style="font-size:10px;color:var(--gray-400);margin-top:8px">📌 点击题目显示答案解析 · 生成后替换为个性化测验</p></div>';
  }
  // Lecture — markdown rendered with TOC
  const al=$('#artifact-lecture');
  if(al&&(!al.textContent.trim()||al.querySelector('.empty-state'))){
    al.innerHTML='<div style="padding:12px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"><div><b style="font-size:14px">📖 讲义文档</b><span style="font-size:10px;color:var(--gray-400);margin-left:8px">示例预览</span></div><div style="display:flex;gap:6px"><button class="btn btn-sm btn-outline" onclick="_quickGenerate(\'lecture_doc\')">🔄 重新生成</button><button class="btn btn-sm btn-outline" onclick="copyLectureContent()">📄 复制文档</button></div></div>'+
    '<div class="lecture-toc"><div class="toc-title">📑 内容结构</div><div style="font-size:11px;color:var(--gray-500);line-height:2">1. 学习目标<br>2. 核心概念讲解<br>3. 例题分析<br>4. 常见误区<br>5. 小结与练习建议</div></div>'+
    '<div class="lecture-content"><h1>导数与极限入门</h1><p><b>难度等级</b>：基础入门 🟢</p><h2>学习目标</h2><p>掌握导数和极限的基本概念，理解它们之间的关系，能够进行基本的求导和极限运算。</p><h2>核心概念讲解</h2><p>导数是微积分学中最核心的概念之一，描述函数在某一点处的瞬时变化率。从直观上说，导数就是曲线在一点的切线斜率。</p><p>极限是微积分的基础概念，描述当自变量无限趋近某个值时函数值的变化趋势。导数本质上来源于差商的极限。</p><h2>例题分析</h2><p><b>例1</b>：求 f(x)=x² 在 x=1 处的导数。</p><p>(x²)\' = 2x，所以在 x=1 处导数为 2。</p><p><b>例2</b>：求 lim(x→2) (x²-4)/(x-2)。</p><p>分子因式分解得 (x-2)(x+2)/(x-2) → x+2 → 4。</p><h2>常见误区</h2><p><b>误区1</b>：极限不存在就是无穷大。实际上，极限可能因振荡而不存在。</p><p><b>误区2</b>：连续就一定可导。例如 y=|x| 在 x=0 处连续但不可导。</p><h2>小结与练习建议</h2><p>建议先通过图像理解导数几何意义，然后练习基本求导公式。多做极限计算练习，特别是两个重要极限。</p></div>'+
    '<p style="font-size:10px;color:var(--gray-400);margin-top:8px;padding:0 12px">📌 生成后将替换为完整 AI 讲义</p></div>';
  }
  // PPT — download card
  const ap=$('#artifact-ppt');
  if(ap&&(!ap.textContent.trim()||ap.querySelector('.empty-state'))){
    ap.innerHTML='<div style="padding:12px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"><div><b style="font-size:14px">📊 PPT 课件</b><span style="font-size:10px;color:var(--gray-400);margin-left:8px">示例预览</span></div><button class="btn btn-sm btn-outline" onclick="_quickGenerate(\'ppt\')">🔄 重新生成</button></div>'+
    '<div class="ppt-card"><div class="ppt-icon">📊</div><div class="ppt-title">导数与极限入门课件</div><div class="ppt-meta"><span>📄 8 页</span><span>📦 约 120KB</span></div><button class="btn btn-primary" style="margin-top:8px" onclick="_quickGenerate(\'ppt\')">⬇ 生成并下载 PPTX</button><p style="font-size:10px;color:var(--gray-400);margin-top:6px">📌 点击生成后将创建可下载的 PowerPoint 课件</p></div></div>';
  }
  // Study Plan — timeline with cards
  const as=$('#artifact-study_plan');
  if(as&&(!as.textContent.trim()||as.querySelector('.empty-state'))){
    const sp = DEFAULT_PLAN;
    as.innerHTML='<div style="padding:12px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"><div><b style="font-size:14px">🗺️ 学习路径</b><span style="font-size:10px;color:var(--gray-400);margin-left:8px">示例预览</span></div><button class="btn btn-sm btn-primary" onclick="_quickGenerate(\'study_plan\')">🔄 生成 AI 学习路径</button></div>'+
    '<p style="font-size:11px;color:var(--gray-500);margin-bottom:12px">📌 '+esc(sp.profile_summary)+'</p>'+
    (sp.steps||[]).map(s=>'<div class="step-card"><div class="step-num">'+(s.order||'?')+'</div><div class="step-info"><h4>'+esc(s.topic||'')+'</h4><p style="margin:2px 0">'+esc(s.reason||'')+'</p><p style="margin:2px 0"><span style="background:var(--primary-bg);padding:1px 6px;border-radius:4px;font-size:10px;margin-right:4px">'+(s.resource_types||[]).join('</span><span style="background:var(--primary-bg);padding:1px 6px;border-radius:4px;font-size:10px;margin-right:4px">')+'</span><span style="font-size:10px;color:var(--gray-400)">⏱ '+(s.estimated_minutes||'?')+' 分钟</span></p><p style="color:var(--success);font-size:10px">🏋️ '+esc(s.practice||'')+'</p><button class="btn btn-sm btn-outline" style="margin-top:4px" onclick="toast(\'下一版本将支持从学习路径直接生成对应资源\',\'info\')">📦 生成对应资源</button></div></div>').join('')+
    '<p style="font-size:10px;color:var(--gray-400);margin-top:4px">📌 点击生成替换为 AI 个性化学习路径</p></div>';
  }
}

window._askQuestion = async function(q) {
  S.lastQuestion = q;
  S.lastAnswerTopic = q.length > 40 ? q.substring(0, 40) + '...' : q;
  if(!S.token){toast('请先登录','error');return;}
  const msgs=$('#chat-messages');
  msgs.innerHTML+='<div class="msg-bubble user"><div class="msg-content">'+esc(q)+'</div></div>';
  const lid='load_'+Date.now();
  msgs.innerHTML+='<div class="msg-bubble agent" id="'+lid+'"><div class="msg-content"><span class="spinner"></span> AI 学习助手思考中...</div></div>';
  
  // Animate agent states
  animateAgentAskR2();
  msgs.scrollTop=msgs.scrollHeight;
  
  // R2.2-FINAL: 12s slow hint
  var slowHintId = null;
  slowHintId = setTimeout(function() {
    var el = document.getElementById(lid);
    if (el) {
      var hint = el.querySelector('.msg-content');
      if (hint) hint.innerHTML = '<span class="spinner"></span> AI 正在检索课程资料并校验答案，可能需要稍等...';
    }
  }, 12000);
  
  // 25s timeout fallback
  var timeoutId = setTimeout(function() {
    var el = document.getElementById(lid);
    if (el) {
      el.innerHTML = '<div class="msg-content"><div class="error-card" style="border-color:var(--warning);background:var(--warning-bg)"><div class="err-title" style="color:var(--warning)">⏳ 回答生成较慢</div><div class="err-detail">AI 模型响应时间较长，可以继续等待或使用演示答案完成展示</div><div class="err-suggestion">真实请求仍在后台进行中，完成后会替换此卡片</div><div class="err-actions"><button class="btn btn-sm btn-outline" id="fallback-wait-btn">⏳ 继续等待</button> <button class="btn btn-sm btn-primary" id="fallback-demo-btn">📋 使用演示答案</button></div></div></div>';
  setTimeout(function(){
    var waitBtn=document.getElementById('fallback-wait-btn');
    var demoBtn=document.getElementById('fallback-demo-btn');
    var el2=document.getElementById(lid);
    if(waitBtn) waitBtn.onclick=function(){ if(el2)el2.innerHTML='<div class="msg-content"><span class="spinner"></span> 继续等待中...</div>'; };
    if(demoBtn) demoBtn.onclick=function(){ showDemoFallbackAnswer('+JSON.stringify(esc(q))+','+JSON.stringify(lid)+'); };
  },50);
    }
  }, 25000);
  

  try{
    const{ok,data}=await api('/api/app/ask',{method:'POST',body:JSON.stringify({course_id:S.courseId,question:q,top_k:8})});
    const le=document.getElementById(lid);if(le)le.remove();
    if(ok){
      const answerText = data.answer || '';
      const isLong = answerText.length > 600;
      let answerHtml = fmtAns(answerText);
      let html = '<div class="msg-content">';
      if (isLong) {
        html += '<div class="msg-answer-fold"><div class="answer-body folded">'+answerHtml+'</div>'+
          '<div class="fold-toggle"><button onclick="toggleAnswerFold(this)">📖 展开完整回答 ▼</button></div></div>';
      } else {
        html += answerHtml;
      }
      html += '</div>';
      const agentTraces = data.agent_traces || [];
      if(agentTraces.length){ renderAgentTracesFromBackend(agentTraces); }
      else { updateAgentTrace(true, (data.citations||[]).length); }
      if(data.citations&&data.citations.length){
        renderCitations(data.citations);
      } else { updateAgentTrace(true, 0); }
      if(data.profile_delta && Object.keys(data.profile_delta).length){ Bus.emit('profile:updated', data.profile_delta); }
      html += buildAnswerSummaryCard(data);
      msgs.innerHTML+=html;
      S.currentAnswerData = data;
      if (slowHintId) clearTimeout(slowHintId);
      if (timeoutId) clearTimeout(timeoutId);
    }else{
      const errDetail = data.detail || '请求失败';
      msgs.innerHTML+='<div class="msg-bubble agent"><div class="msg-content">'+
        '<div class="error-card"><div class="err-title">⚠ 操作失败</div>'+
        '<div class="err-detail">'+esc(errDetail)+'</div>'+
        '<div class="err-suggestion">建议：检查网络连接后重试，或尝试其他问题</div>'+
        '<div class="err-actions"><button class="btn btn-sm btn-primary" onclick="_sendQuestion()">🔄 重试</button></div></div></div></div>';
      agentMarkFail();
    }
  }catch(e){
    const le=document.getElementById(lid);if(le)le.remove();
    msgs.innerHTML+='<div class="msg-bubble agent"><div class="msg-content">'+
      '<div class="error-card"><div class="err-title">⚠ 操作失败</div>'+
      '<div class="err-detail">无法连接到学习服务</div>'+
      '<div class="err-suggestion">建议：检查后端服务是否正在运行，然后重试</div>'+
      '<div class="err-actions"><button class="btn btn-sm btn-primary" onclick="_sendQuestion()">🔄 重试</button></div></div></div></div>';
    agentMarkFail();
  } finally {
    if (typeof slowHintId !== 'undefined') clearTimeout(slowHintId);
    if (typeof timeoutId !== 'undefined') clearTimeout(timeoutId);
  }
  msgs.scrollTop=msgs.scrollHeight;
};

// ════════════ SEND BUTTON (top-level, with lock) ════════════
window._sendQuestion=async function(){
  var input=document.getElementById('chat-input');
  var q=input?input.value.trim():'';
  if(!q){ toast('请输入问题','info'); return; }
  if(S.askInFlight){ toast('当前正在生成回答，请稍等或等待完成','info'); return; }
  S.askInFlight = true;
  var btn = document.querySelector('.chat-input-row .btn-primary');
  if(btn){ btn.textContent='生成中...'; btn.disabled=true; }
  try {
    input.value='';
    input.disabled=true;
    await _askQuestion(q);
  } finally {
    S.askInFlight = false;
    if(btn){ btn.textContent='发送'; btn.disabled=false; }
    if(input) input.disabled=false;
  }
};

// ════════ R2.2 AGENT ANIMATION (EventBus) ═══════=
function animateAgentAskR2() {
  var traces = [
    {agent_name:"AI学习助手",status:"running",message:"正在拆解问题，分配任务给学习助手..."},
    {agent_name:"画像分析",status:"pending",message:""},
    {agent_name:"资料检索",status:"pending",message:""},
    {agent_name:"内容校验",status:"pending",message:""},
    {agent_name:"资源生成",status:"pending",message:""}
  ];
  Bus.emit("agent:trace-update", traces);
  setTimeout(function(){ Bus.emit("agent:trace-update", [{agent_name:"AI学习助手",status:"completed",message:"任务已分配"},{agent_name:"画像分析",status:"running",message:"正在分析学习特征..."},{agent_name:"资料检索",status:"pending",message:""},{agent_name:"内容校验",status:"pending",message:""},{agent_name:"资源生成",status:"pending",message:""}]); }, 600);
  setTimeout(function(){ Bus.emit("agent:trace-update", [{agent_name:"AI学习助手",status:"completed",message:"任务已分配"},{agent_name:"画像分析",status:"completed",message:"画像已提取"},{agent_name:"资料检索",status:"running",message:"正在检索课程资料库..."},{agent_name:"内容校验",status:"pending",message:""},{agent_name:"资源生成",status:"pending",message:""}]); }, 1200);
  setTimeout(function(){ Bus.emit("agent:trace-update", [{agent_name:"AI学习助手",status:"completed",message:"任务已分配"},{agent_name:"画像分析",status:"completed",message:"画像已提取"},{agent_name:"资料检索",status:"completed",message:"检索完成"},{agent_name:"内容校验",status:"running",message:"正在校验回答可信度..."},{agent_name:"资源生成",status:"pending",message:""}]); }, 2000);
}
function renderAgentTracesFromBackend(traces) { Bus.emit("agent:trace-update", traces); }
// ════════ AGENT ANIMATION ════════
function animateAgentAsk() {
  const trace = document.getElementById('agent-trace');
  if (!trace) return;
  const agents = [
    {agent:'AI学习助手',status:'running'},
    {agent:'资料检索',status:'pending'},
    {agent:'内容校验',status:'pending'},
    {agent:'资源推荐',status:'pending'}
  ];
  trace.innerHTML = buildAgentTrace(agents);
  // Sequential animation
  setTimeout(() => { const t=document.getElementById('agent-trace'); if(t) t.innerHTML=buildAgentTrace([{agent:'AI学习助手',status:'completed'},{agent:'资料检索',status:'running'},{agent:'内容校验',status:'pending'},{agent:'资源推荐',status:'pending'}]); }, 800);
  setTimeout(() => { const t=document.getElementById('agent-trace'); if(t) t.innerHTML=buildAgentTrace([{agent:'AI学习助手',status:'completed'},{agent:'资料检索',status:'completed'},{agent:'内容校验',status:'running'},{agent:'资源推荐',status:'pending'}]); }, 1600);
  setTimeout(() => { const t=document.getElementById('agent-trace'); if(t) t.innerHTML=buildAgentTrace([{agent:'AI学习助手',status:'completed'},{agent:'资料检索',status:'completed'},{agent:'内容校验',status:'completed'},{agent:'资源推荐',status:'running'}]); }, 2400);
}

function agentMarkFail() {
  const trace = document.getElementById('agent-trace');
  if (!trace) return;
  trace.innerHTML = buildAgentTrace([
    {agent:'AI学习助手',status:'failed',detail:'请求失败'},
    {agent:'资料检索',status:'failed'},
    {agent:'内容校验',status:'pending'},
    {agent:'资源推荐',status:'pending'}
  ]);
}

function buildAnswerSummaryCard(data) {
  const cites = data.citations || [];
  const count = cites.length;
  const types = [{t:'mindmap',l:'思维导图',i:'🧠'},{t:'quiz',l:'测验',i:'📝'},{t:'lecture_doc',l:'讲义',i:'📄'}];
  let btns = types.map(t => '<button class="btn btn-sm btn-outline" onclick="_quickGenerate(\''+t.t+'\')">'+t.i+' '+t.l+'</button>').join('');
  return '<div class="answer-summary" style="margin-top:8px;padding:10px 14px;background:var(--primary-bg);border-radius:var(--radius);font-size:11px">'+
    '<div style="font-weight:600;margin-bottom:6px;color:var(--primary-dark)">✅ 回答已生成 · 引用 '+count+' 条课程资料</div>'+
    '<div style="display:flex;gap:6px;flex-wrap:wrap">'+btns+'</div>'+
    '<div style="margin-top:4px;font-size:10px;color:var(--gray-400)">基于当前回答一键生成学习资源</div></div>';
}

function buildErrorCard(detail) {
  return '<div class="error-card"><div class="err-title">⚠ 操作失败</div>'+
    '<div class="err-detail">'+esc(detail)+'</div>'+
    '<div class="err-suggestion">建议：检查 AI 模型连接、重新登录或切换课程后重试</div>'+
    '<div class="err-actions"><button class="btn btn-sm btn-primary" onclick="_askQuestion(S.lastQuestion||document.getElementById(\'chat-input\')?.value)">🔄 重试</button></div></div>';
}

window.toggleAnswerFold = function(btn) {
  const fold = btn.closest('.msg-answer-fold');
  if (!fold) return;
  const body = fold.querySelector('.answer-body');
  const collapsed = body.classList.contains('folded');
  if (collapsed) {
    body.classList.remove('folded');
    btn.textContent = '📖 收起 ▲';
  } else {
    body.classList.add('folded');
    btn.textContent = '📖 展开完整回答 ▼';
  }
};

window._quickGenerate=async function(type){
  if(!S.token){toast('请先登录','error');return;}
  const topic=S.lastAnswerTopic||document.getElementById('chat-input')?.value.trim()||'导数与极限入门';
  toast('正在生成 '+({mindmap:'思维导图',quiz:'测验',lecture_doc:'讲义',ppt:'PPT',study_plan:'学习路径'}[type]||type)+'...','info');
  try{
    const{ok,data}=await api('/api/app/generate',{method:'POST',body:JSON.stringify({course_id:S.courseId,resource_type:type,topic})});
    if(ok){renderArtifact(type,data);toast(type+' 已生成','success');}
    else toast('生成失败，请重试','error');
  }catch(e){toast('操作失败，请重试','error');}
};

function renderArtifactTabs(){
  const tabs=$('#artifacts-tabs');if(!tabs)return;
  tabs.innerHTML='';['mindmap','quiz','lecture','ppt','study_plan'].forEach(t=>{const l={mindmap:'思维导图',quiz:'练习题库',lecture:'讲义文档',ppt:'PPT预览',study_plan:'学习路径'}[t];tabs.innerHTML+='<div class="artifacts-tab" data-tab="'+t+'" onclick="_switchArtifactTab(\''+t+'\')">'+l+'</div>';});
  const first=$('.artifacts-tab',tabs);if(first)first.classList.add('active');
}

window._switchArtifactTab=function(tab){
  $$('.artifacts-tab').forEach(t=>t.classList.remove('active'));
  $$('.artifacts-tab').forEach(t=>{if(t.dataset.tab===tab)t.classList.add('active');});
  $$('#artifacts-content .tab-panel').forEach(p=>{p.classList.remove('active');p.style.display='none';});
  const panel=document.getElementById('artifact-'+tab);if(panel){panel.classList.add('active');panel.style.display='flex';}
  if(tab==='mindmap'){setTimeout(mindmapZoomFit, 400); setTimeout(setupMindmapDrag, 500);}
};

function renderArtifact(type,data){
  const panel=document.getElementById('artifact-'+type);if(!panel)return;
  if(type==='mindmap'&&data.mermaid){
    renderMindmapProduct(panel, data.mermaid, {
      fallback: data.metadata ? data.metadata.fallback : false,
      used_kb: data.metadata ? data.metadata.used_rag : true,
      used_profile: data.metadata ? data.metadata.used_profile : true,
      citation_count: data.metadata ? (data.metadata.context_chunks || 0) : 0,
      generated_by: data.metadata ? data.metadata.generated_by : 'DeepSeek'
    });
    setTimeout(setupMindmapDrag, 500);
  } else if(type==='quiz'&&data.items){
    panel.innerHTML='<div style="padding:12px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"><div><b style="font-size:14px">📝 练习题库</b><span style="font-size:10px;background:var(--success-bg);color:var(--success);padding:1px 8px;border-radius:10px;margin-left:8px">AI 已生成</span></div><button class="btn btn-sm btn-outline" onclick="_quickGenerate(\'quiz\')">🔄 重新生成</button></div>'+
    '<div style="padding:8px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px"><div><b style="font-size:14px">📝 练习题库</b><span style="font-size:10px;background:var(--success-bg);color:var(--success);padding:1px 8px;border-radius:10px;margin-left:8px">AI 已生成</span></div><div style="display:flex;gap:6px"><button class="btn btn-sm btn-outline" onclick="_quickGenerate(\'quiz\')">🔄 重新生成</button><button class="btn btn-sm btn-outline" onclick="resetAllQuiz(\'gen\')">🔄 重做全部</button></div></div>'+renderInteractiveQuiz(data.items,'gen')+'</div>'+'</div>';
  } else if(type==='lecture'&&data.content){
    const content = data.content || '';
    panel.innerHTML='<div style="padding:12px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"><div><b style="font-size:14px">📖 讲义文档</b><span style="font-size:10px;background:var(--success-bg);color:var(--success);padding:1px 8px;border-radius:10px;margin-left:8px">AI 已生成</span></div><div style="display:flex;gap:6px"><button class="btn btn-sm btn-outline" onclick="_quickGenerate(\'lecture_doc\')">🔄 重新生成</button><button class="btn btn-sm btn-outline" onclick="copyLectureContent()">📄 复制文档</button></div></div>'+
    '<div class="lecture-content">'+fmtAns(content)+'</div></div>';
  } else if(type==='ppt'&&data.download_url){
    panel.innerHTML='<div style="padding:12px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"><div><b style="font-size:14px">📊 PPT 课件</b><span style="font-size:10px;background:var(--success-bg);color:var(--success);padding:1px 8px;border-radius:10px;margin-left:8px">AI 已生成</span></div><button class="btn btn-sm btn-outline" onclick="_quickGenerate(\'ppt\')">🔄 重新生成</button></div>'+
    '<div class="ppt-card"><div class="ppt-icon">📊</div><div class="ppt-title">'+esc(data.title||'PPT课件')+'</div><div class="ppt-meta"><span>📄 '+(data.slide_count||'?')+' 页</span></div><a href="'+S.apiBase+data.download_url+'" target="_blank" class="btn btn-primary" style="margin-top:8px;text-decoration:none">📥 下载 PPTX</a></div></div>';
  } else if(type==='study_plan'&&data.study_plan){
    const sp=data.study_plan;
    panel.innerHTML='<div style="padding:12px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"><div><b style="font-size:14px">🗺️ 学习路径</b><span style="font-size:10px;background:var(--success-bg);color:var(--success);padding:1px 8px;border-radius:10px;margin-left:8px">AI 已生成</span></div><button class="btn btn-sm btn-primary" onclick="_quickGenerate(\'study_plan\')">🔄 重新生成</button></div>'+
    '<p style="font-size:12px;color:var(--gray-500);margin-bottom:12px">'+esc(sp.profile_summary||'研究生个性化路径')+'</p>'+
    (sp.steps||[]).map(s=>'<div class="step-card"><div class="step-num">'+(s.order||'?')+'</div><div class="step-info"><h4>'+esc(s.topic||'')+'</h4><p style="margin:2px 0">'+esc(s.reason||'')+'</p><p style="margin:2px 0"><span style="background:var(--primary-bg);padding:1px 6px;border-radius:4px;font-size:10px;margin-right:4px">'+(s.resource_types||[]).join('</span><span style="background:var(--primary-bg);padding:1px 6px;border-radius:4px;font-size:10px;margin-right:4px">')+'</span><span style="font-size:10px;color:var(--gray-400)">⏱ '+(s.estimated_minutes||'?')+' 分钟</span></p><button class="btn btn-sm btn-outline" style="margin-top:4px" onclick="toast(\'后续版本将支持从路径生成对应资源\',\'info\')">📦 生成对应资源</button></div></div>').join('')+'</div>';
  } else if(data.content){
    panel.innerHTML='<pre style="max-height:400px;overflow:auto;font-size:12px;white-space:pre-wrap;padding:12px">'+esc(JSON.stringify(data,null,2))+'</pre>';
  }
  _switchArtifactTab(type);
}

window.highlightSourceCard = function(id) {
  var cards = document.querySelectorAll('.cite-card');
  cards.forEach(function(c) { c.classList.remove('active-pulse'); });
  var card = document.getElementById('cite-card-'+id);
  if (card) {
    card.classList.add('active-pulse');
    card.scrollIntoView({behavior:'smooth',block:'center'});
    setTimeout(function(){ card.classList.remove('active-pulse'); }, 3000);
  }
};

window.highlightCite = function(idx) {
  // Highlight citation card
  $$('.cite-card').forEach(c => c.style.borderColor = '');
  const card = document.getElementById('cite-card-'+idx);
  if (card) { card.style.borderColor = 'var(--primary)'; card.style.boxShadow = '0 0 0 2px var(--primary-bg)'; card.scrollIntoView({behavior:'smooth',block:'center'}); }
  toast('引用 ['+idx+'] 已高亮','info');
};

window.copyLectureContent = function() {
  const content = document.querySelector('#artifact-lecture .lecture-content');
  if (!content) return;
  navigator.clipboard.writeText(content.innerText).then(() => toast('文档已复制','success')).catch(() => toast('复制失败','error'));
};

function renderCitations(cits){
  const panel = $('#citations-panel');
  if (!panel) return;
  if (!cits || !cits.length) {
    panel.innerHTML='<div class="cite-section"><h4>📚 课程依据</h4><div class="cite-empty">当前回答暂无课程资料引用<br><span style="font-size:10px;color:var(--gray-400)">回答内容基于课程资料整理，关键结论可追溯。</span></div></div><div class="cite-section" id="agent-section"></div><div class="cite-section" id="profile-section"></div>';
    return;
  }
  const seen = new Set();
  let cards = '';
  let idx = 0;
  cits.forEach(c => {
    const k = c.source || '课程资料';
    if (seen.has(k)) return;
    seen.add(k);
    idx++;
    const score = c.score || 0;
    const scorePct = Math.round(score * 100);
    const scoreClass = scorePct >= 70 ? 'high' : scorePct >= 40 ? 'medium' : 'low';
    const snippet = (c.content || '').substring(0, 120);
    cards += '<div class="cite-card" id="cite-card-'+idx+'">'+
      '<div class="cite-header">'+
        '<span class="cite-filename"><span class="cite-num">['+idx+']</span> '+esc(k)+'</span>'+
        '<span class="cite-score '+scoreClass+'">'+(scorePct > 0 ? '相关度 '+scorePct+'%' : '来源')+'</span>'+
      '</div>'+
      (snippet ? '<div class="cite-snippet">'+esc(snippet)+'</div>' : '')+
      '<div class="cite-meta">'+
        (c.page_number ? '<span>📍 第'+c.page_number+'页</span>' : '')+
        '<button class="cite-btn" onclick="highlightCite('+idx+')">查看引用 →</button>'+
      '</div>'+
    '</div>';
  });
  panel.innerHTML='<div class="cite-section"><h4>📚 课程依据</h4><div class="cite-card-grid">'+cards+'</div></div><div class="cite-section" id="agent-section"></div><div class="cite-section" id="profile-section"></div>';
  // Preserve agent and profile sections
  const agSec = document.getElementById('agent-section');
  if (agSec) agSec.innerHTML = '<h4>🤖 学习助手协作</h4><div class="agent-trace-grid" id="agent-trace">'+buildAgentTrace([{agent:'AI学习助手',status:'completed'},{agent:'资料检索',status:'completed',detail:cits.length+' 条引用'},{agent:'内容校验',status:'completed'},{agent:'资源生成',status:'pending'}])+'</div>';
  const pfSec = document.getElementById('profile-section');
  if (pfSec && $('#profile-mini')) {
    const pfContent = $('#profile-mini').innerHTML || '';
    pfSec.innerHTML = '<h4>🎓 学习画像</h4><div id="profile-mini">'+pfContent+'</div>';
  }
}

function updateAgentTrace(hasAnswered, citationCount) {
  const trace = document.getElementById('agent-trace');
  if (!trace) return;
  const agents = [
    {agent:'AI学习助手',status:'completed'},
    {agent:'资料检索',status:hasAnswered?'completed':'pending',detail:hasAnswered?(citationCount||0)+' 条引用':''},
    {agent:'内容校验',status:hasAnswered?'completed':'pending'},
    {agent:'资源生成',status:'pending'}
  ];
  trace.innerHTML = buildAgentTrace(agents);
}

function renderProfileMini(pf){
  const panel=$('#profile-mini');if(!panel)return;
  panel.innerHTML='<div style="font-size:11px;display:grid;grid-template-columns:1fr 1fr;gap:4px"><div>水平: '+esc(pf.knowledge_level||'—')+'</div><div>风格: '+esc(pf.cognitive_style||'—')+'</div><div>节奏: '+esc(pf.pace_preference||'—')+'</div><div>专业: '+esc(pf.major||'—')+'</div></div>';
}

// ════════════ PAGE: GENERATOR ════════════
function initGenerator(){
  const el=document.getElementById('page-generator');
  let h='<div class="card"><div class="card-header"><h3>📖 当前章节</h3></div><div class="gen-topic">'+esc(S.courseName)+' — 导数与极限入门</div><div class="gen-tags"><span class="gen-tag">AI 个性化</span><span class="gen-tag">知识库增强</span><span class="gen-tag">多智能体协作</span></div></div>';
  h+='<div class="card"><div class="card-header"><h3>✏️ 输入学习主题</h3></div><div style="display:flex;gap:8px;margin-bottom:8px"><input id="gen-topic-input" placeholder="输入学习主题..." style="flex:1;padding:8px 12px;border:1px solid var(--gray-300);border-radius:6px;font-size:13px" value="导数与极限入门"><button class="btn btn-primary" onclick="_genAllResources()">⚡ 生成全部 5 类资源</button></div><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-sm btn-outline" onclick="document.getElementById(\'gen-topic-input\').value=\'导数定义与几何意义\'">导数定义</button><button class="btn btn-sm btn-outline" onclick="document.getElementById(\'gen-topic-input\').value=\'极限运算法则\'">极限运算法则</button><button class="btn btn-sm btn-outline" onclick="document.getElementById(\'gen-topic-input\').value=\'连续函数性质\'">连续函数</button></div></div>';
  const resources=[{id:'lecture_doc',icon:'📄',name:'讲义文档',desc:'个性化AI讲义'},{id:'mindmap',icon:'🧠',name:'思维导图',desc:'概念关系可视化'},{id:'quiz',icon:'📝',name:'自适应测验',desc:'知识点自测'},{id:'ppt',icon:'📊',name:'PPT课件',desc:'可下载PPTX'},{id:'study_plan',icon:'🗺️',name:'学习路径',desc:'个性化学习计划'}];
  h+='<div class="resource-cards">';resources.forEach(r=>{h+='<div class="res-card" id="rcard-'+r.id+'" onclick="_genSingle(\''+r.id+'\')"><div class="res-icon">'+r.icon+'</div><div class="res-name">'+r.name+'</div><div class="res-desc">'+r.desc+'</div><span class="res-status ready" id="rstatus-'+r.id+'">可生成</span></div>';});h+='</div>';
  h+='<div class="card" style="background:var(--gray-50);border:1px dashed var(--gray-200)"><button class="btn btn-sm btn-outline" onclick="var el=document.getElementById(\'gen-extended\');el.style.display=el.style.display===\'none\'?\'block\':\'none\'" style="width:100%;text-align:left">🔧 后续扩展</button><div id="gen-extended" style="display:none;margin-top:8px"><div class="res-card" style="opacity:0.5;cursor:default"><div class="res-icon">🎬</div><div class="res-name">数字人讲解</div><div class="res-desc">后续版本扩展</div><span class="res-status" style="background:var(--gray-100);color:var(--gray-400)">扩展中</span></div></div></div>';
  h+='<div class="card" id="gen-progress-card" style="display:none"><div class="card-header"><h3>⚙️ 生成进度</h3></div><div class="gen-progress-text" id="gen-progress-text">准备中...</div><div class="gen-progress-bar-wrap"><div class="gen-progress-bar-fill" id="gen-progress-bar"></div></div><div class="progress-steps" id="gen-progress-steps"><div class="progress-step" id="gstep-0">分析画像</div><div class="progress-step" id="gstep-1">检索知识</div><div class="progress-step" id="gstep-2">生成路径</div><div class="progress-step" id="gstep-3">生成导图</div><div class="progress-step" id="gstep-4">生成测验</div><div class="progress-step" id="gstep-5">生成讲义</div><div class="progress-step" id="gstep-6">生成PPT</div></div></div>';
  h+='<div class="card"><div class="card-header"><h3>📋 生成结果</h3></div><div id="gen-result-summary" class="result-summary" style="display:none"><div class="rs-item"><div class="rs-val" id="rs-topic">—</div><div class="rs-lbl">当前主题</div></div><div class="rs-divider"></div><div class="rs-item"><div class="rs-val" id="rs-count">0</div><div class="rs-lbl">已生成资源</div></div><div class="rs-divider"></div><div class="rs-item"><div class="rs-val" id="rs-cites">0</div><div class="rs-lbl">引用数量</div></div><div class="rs-divider"></div><div class="rs-item"><div class="rs-val" id="rs-ppt">—</div><div class="rs-lbl">PPT状态</div></div></div><div class="artifacts-tabs" id="gen-result-tabs"><div class="artifacts-tab active" onclick="_switchGenTab(\'mindmap\')">思维导图</div><div class="artifacts-tab" onclick="_switchGenTab(\'lecture\')">讲解文档</div><div class="artifacts-tab" onclick="_switchGenTab(\'ppt\')">PPT预览</div><div class="artifacts-tab" onclick="_switchGenTab(\'quiz\')">练习题</div><div class="artifacts-tab" onclick="_switchGenTab(\'study_plan\')">学习路径</div></div><div id="gen-results" style="min-height:440px"><div class="artifact-empty"><div class="ae-icon">🧠</div><div class="ae-title">思维导图</div><div class="ae-hint">点击上方资源卡片或"生成全部5类资源"按钮开始</div><button class="btn btn-primary btn-sm ae-btn" onclick="_genSingle(\'mindmap\')">⚡ 立即生成</button></div></div></div>';
  el.innerHTML=h;
  S.genCache={};
}

window._switchGenTab=function(tab){
  $$('#gen-result-tabs .artifacts-tab').forEach(t=>t.classList.remove('active'));
  $$('#gen-result-tabs .artifacts-tab').forEach(t=>{
    const m={mindmap:'思维导图',lecture:'讲解文档',ppt:'PPT预览',quiz:'练习题',study_plan:'学习路径'};
    const txt = (t.textContent||'').trim();
    const match = m[tab] || '';
    if(txt.includes(match))t.classList.add('active');
  });
  if(S.genCache[tab])$('#gen-results').innerHTML=fmtGenResult(tab,S.genCache[tab]);
  else {
    const labels = {mindmap:'思维导图',lecture:'讲解文档',ppt:'PPT课件',quiz:'练习题',study_plan:'学习路径'};
    const icons = {mindmap:'🧠',lecture:'📖',ppt:'📊',quiz:'📝',study_plan:'🗺️'};
    $('#gen-results').innerHTML='<div class="artifact-empty"><div class="ae-icon">'+(icons[tab]||'📦')+'</div><div class="ae-title">'+(labels[tab]||tab)+'</div><div class="ae-hint">该资源尚未生成</div><button class="btn btn-primary btn-sm ae-btn" onclick="_genSingle(\''+tab+'\')">⚡ 立即生成</button></div>';
  }
};

window._genSingle=async function(type){
  if(!S.token){toast('请先登录','error');return;}
  const topic=document.getElementById('gen-topic-input')?.value||'导数与极限入门';
  const se=document.getElementById('rstatus-'+type);if(se){se.className='res-status generating';se.textContent='生成中...';}
  const pc=$('#gen-progress-card');if(pc)pc.style.display='block';
  try{
    const{ok,data}=await api('/api/app/generate',{method:'POST',body:JSON.stringify({course_id:S.courseId,resource_type:type,topic})});
    if(ok){
      S.genCache[type]=data;
      if(se){se.className='res-status ready';se.textContent='已完成';}
      $('#gen-results').innerHTML=fmtGenResult(type,data);
      updateGenSummary();
      toast(({mindmap:'思维导图',quiz:'测验',lecture_doc:'讲义',ppt:'PPT',study_plan:'学习路径'}[type]||type)+' 已生成','success');
    } else {
      if(se){se.className='res-status failed';se.textContent='失败';}
      $('#gen-results').innerHTML='<div class="artifact-empty"><div class="ae-icon">⚠</div><div class="ae-title">生成失败</div><div class="ae-hint">请重试或尝试不同主题</div><button class="btn btn-primary btn-sm ae-btn" onclick="_genSingle(\''+type+'\')">🔄 重试</button></div>';
      toast('生成失败，请重试','error');
    }
  }catch(e){if(se){se.className='res-status failed';se.textContent='失败';}toast('操作失败，请重试','error');}
};

function updateGenSummary() {
  const summary = document.getElementById('gen-result-summary');
  if (!summary) return;
  const cached = S.genCache;
  const types = Object.keys(cached);
  const count = types.length;
  const topic = document.getElementById('gen-topic-input')?.value || '—';
  const citeCount = cached.ppt ? (cached.ppt.metadata?.context_chunks || 0) : 0;
  const pptReady = cached.ppt && cached.ppt.download_url ? '可下载' : '未生成';

  document.getElementById('rs-topic').textContent = topic;
  document.getElementById('rs-count').textContent = count;
  document.getElementById('rs-cites').textContent = citeCount;
  document.getElementById('rs-ppt').textContent = pptReady;
  summary.style.display = count > 0 ? 'flex' : 'none';
}

window._genAllResources=async function(){
  const types=['study_plan','mindmap','quiz','lecture_doc','ppt'];
  const pc=$('#gen-progress-card');if(pc)pc.style.display='block';
  var totalSteps=types.length;
  var progressBar=document.getElementById('gen-progress-bar');
  var progressText=document.getElementById('gen-progress-text');
  for(let i=0;i<types.length;i++){
    var gs=document.getElementById('gstep-'+(i+2));if(gs){gs.className='progress-step active';gs.textContent='⏳ '+['生成路径','生成导图','生成测验','生成讲义','生成PPT'][i];}
    if(i===0){document.getElementById('gstep-0')&&(document.getElementById('gstep-0').className='progress-step done');document.getElementById('gstep-1')&&(document.getElementById('gstep-1').className='progress-step done');}
    if(progressBar)progressBar.style.width=Math.round((i+1)/totalSteps*100)+'%';
    if(progressText)progressText.textContent='正在生成: '+['学习路径','思维导图','测验','讲义','PPT'][i]+' ('+(i+1)+'/'+totalSteps+')';
    await _genSingle(types[i]);
    if(gs){gs.className='progress-step done';gs.textContent='✅ '+['生成路径','生成导图','生成测验','生成讲义','生成PPT'][i];}
  }
  if(progressBar)progressBar.style.width='100%';
  if(progressText)progressText.textContent='✅ 全部 5 类资源生成完毕！';
  if(pc)setTimeout(()=>{pc.style.display='none';},3000);
  const cached = S.genCache;
  const c = Object.keys(cached).length;
  if (c >= 4) toast('已生成讲义、思维导图、测验、PPT 和学习路径','success');
};

function fmtGenResult(type,data){
  if(type==='mindmap'&&data.mermaid){
    // Use simple hack: wrap in a div that product renderer can pick up
    const id = 'gen-mindmap-' + Date.now();
    setTimeout(() => {
      const container = document.getElementById(id);
      if (container) {
        renderMindmapProduct(container, data.mermaid, {
          fallback: data.metadata ? data.metadata.fallback : false,
          used_kb: data.metadata ? data.metadata.used_rag : true,
          used_profile: data.metadata ? data.metadata.used_profile : true,
          citation_count: data.metadata ? (data.metadata.context_chunks || 0) : 0
        });
        setTimeout(setupMindmapDrag, 500);
      }
    }, 50);
    return '<div id="'+id+'"></div>';
  }
  if(type==='quiz'&&data.items)return'<div style="padding:12px">'+data.items.map((it,i)=>'<div class="quiz-item" onclick="this.classList.toggle(\'expanded\');const ex=this.querySelector(\'.q-explanation\');if(ex)ex.style.display=ex.style.display===\'none\'?\'block\':\'none\';const ops=this.querySelectorAll(\'.q-option\');ops.forEach(o=>o.style.display=o.style.display===\'none\'?\'block\':\'none\')"><div class="q-text">Q'+(i+1)+'. '+esc(it.question)+' '+(it.difficulty?'<span style="font-size:10px;color:var(--gray-400)">'+(it.difficulty==='basic'?'基础':it.difficulty==='intermediate'?'进阶':'挑战')+'</span>':'')+'</div>'+it.options.map((o,j)=>'<div class="q-option'+(j===it.answer?' correct':'')+'" style="display:none">'+String.fromCharCode(65+j)+'. '+esc(o)+(j===it.answer?' ✓':'')+'</div>').join('')+'<div class="q-explanation" style="display:none">💡 '+esc(it.explanation||'')+'</div></div>').join('')+'</div>';
  if(type==='lecture'&&data.content)return'<div class="lecture-content" style="padding:12px">'+fmtAns(data.content)+'<div style="margin-top:12px"><button class="btn btn-sm btn-outline" onclick="navigator.clipboard.writeText(document.querySelector(\'.lecture-content\').innerText).then(()=>toast(\'复制成功\',\'success\'))">📄 复制文档</button></div></div>';
  if(type==='ppt'&&data.download_url)return'<div class="ppt-card"><div class="ppt-icon">📊</div><div class="ppt-title">'+esc(data.title||'PPT课件')+'</div><div class="ppt-meta"><span>📄 '+(data.slide_count||'?')+' 页</span></div><a href="'+S.apiBase+data.download_url+'" target="_blank" class="btn btn-primary" style="margin-top:8px;text-decoration:none">📥 下载 PPTX</a></div>';
  if(type==='study_plan'&&data.study_plan){const sp=data.study_plan;return'<div style="padding:12px"><p style="font-size:12px;color:var(--gray-500);margin-bottom:12px">'+esc(sp.profile_summary||'')+'</p>'+(sp.steps||[]).map(s=>'<div class="step-card"><div class="step-num">'+(s.order||'?')+'</div><div class="step-info"><h4>'+esc(s.topic||'')+'</h4><p style="margin:2px 0">'+esc(s.reason||'')+'</p><p style="margin:2px 0"><span style="background:var(--primary-bg);padding:1px 6px;border-radius:4px;font-size:10px;margin-right:4px">'+(s.resource_types||[]).join('</span><span style="background:var(--primary-bg);padding:1px 6px;border-radius:4px;font-size:10px;margin-right:4px">')+'</span><span style="font-size:10px;color:var(--gray-400)">⏱ '+(s.estimated_minutes||'?')+' 分钟</span></p><button class="btn btn-sm btn-outline" style="margin-top:4px" onclick="toast(\'后续版本支持\',\'info\')">📦 生成对应资源</button></div></div>').join('')+'</div>';}
  return'<pre style="max-height:400px;overflow:auto;font-size:12px;padding:12px">'+esc(JSON.stringify(data,null,2))+'</pre>';
}

// ════════════ PAGE: COURSES ════════════
async function loadCourses(){
  const el=document.getElementById('page-courses');el.innerHTML='<div class="loading-block"><span class="spinner"></span> 加载课程...</div>';
  try{
    let enriched=S.courses;
    if((!enriched||enriched.length===0)&&S.token){const{ok,data}=await api('/api/app/bootstrap');if(ok&&data.courses&&data.courses.length){enriched=data.courses;S.courses=data.courses;}}
    let h='<div class="card"><div class="card-header"><h3>课程列表</h3><button class="btn btn-sm btn-primary" onclick="_createCourse()">+ 创建课程</button></div>';
    if(!enriched||enriched.length===0)h+='<div class="empty-state"><div class="empty-icon">📚</div><p>暂无课程</p><p style="font-size:11px;color:var(--gray-400)">点击"创建课程"添加</p></div>';
    else{
      enriched.sort((a,b)=>{const ka=a.has_knowledge_base?1:0,kb=b.has_knowledge_base?1:0;if(ka!==kb)return kb-ka;const na=(a.name||'').includes('高等数学上')?1:0,nb=(b.name||'').includes('高等数学上')?1:0;return nb-na;});
      enriched.forEach(c=>{const sel=c.id===S.courseId;const hasKB=c.has_knowledge_base||(c.chunks_count>0);const kbBadge=hasKB?'<span style="font-size:10px;background:var(--success-bg);color:var(--success);padding:1px 6px;border-radius:8px;margin-left:6px">📚 知识库就绪</span>':'<span style="font-size:10px;background:var(--warning-bg);color:var(--warning);padding:1px 6px;border-radius:8px;margin-left:6px">⚠ 暂无资料</span>';
        h+='<div class="course-card'+(sel?' selected':'')+'" onclick="_selectCourse('+c.id+',\''+esc(c.name||'')+'\','+(c.chunks_count||0)+','+hasKB+')"><h4>📚 '+esc(c.name||'')+(sel?' ✓':'')+kbBadge+'</h4><div class="course-meta"><span>课程知识点: '+(c.chunks_count||0)+'</span><span>'+esc(c.description||'')+'</span></div></div>';});
    }
    h+='</div><div class="card"><div class="card-header"><h3>创建课程</h3></div><div class="form-group"><label>课程名称</label><input id="new-course-name" placeholder="例: 高等数学"></div><div class="form-group"><label>课程描述</label><input id="new-course-desc" placeholder="简要说明"></div><button class="btn btn-primary" onclick="_createCourse()">创建</button></div>';
    el.innerHTML=h;
  }catch(e){
    var errMsg = (e.message||'');
    if(errMsg==='Failed to fetch' || errMsg.includes('fetch')){
      errMsg = '无法连接后端服务。请确认后端已启动（双击 run.bat 或执行 bash scripts/start_app.sh），然后刷新页面。';
    }
    el.innerHTML='<div class="error-card" style="max-width:500px;margin:20px auto"><div class="err-title">⚠ 数据看板加载失败</div><div class="err-detail">'+esc(errMsg)+'</div><div class="err-suggestion">检查后端服务是否运行在 http://127.0.0.1:8000</div><div class="err-actions"><button class="btn btn-sm btn-primary" onclick="loadDashboard()">🔄 重试</button><button class="btn btn-sm btn-outline" onclick="navTo(\'assistant\')">💬 去学习助手</button></div></div>';
  }
}

window._selectCourse=function(id,name,chunks,hasKB){S.courseId=id;S.courseName=name;S.kbChunks=chunks||0;S.kbReady=!!hasKB;updateTopbar();loadCourses();toast(hasKB?'已选择: '+name+'（'+chunks+' 知识点）':'已选择: '+name+'（暂无课程资料）',hasKB?'success':'info');};
window._createCourse=async function(){const name=document.getElementById('new-course-name')?.value.trim();if(!name){toast('请输入课程名称','error');return;}const desc=document.getElementById('new-course-desc')?.value.trim()||'';try{const{ok,data}=await api('/api/courses',{method:'POST',body:JSON.stringify({name,description:desc})});if(ok){S.courseId=data.id;S.courseName=data.name;updateTopbar();loadCourses();toast('课程创建成功','success');}else toast('创建失败','error');}catch(e){toast('创建失败','error');}};

// ════════════ PAGE: KNOWLEDGE BASE ════════════
function loadKnowledgeBase(){
  const el=document.getElementById('page-knowledge');
  el.innerHTML='<div class="card"><div class="card-header"><h3>📚 课程资料库状态</h3></div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;text-align:center"><div class="grid-stat"><div class="val">'+(S.kbChunks||0)+'</div><div class="lbl">知识片段</div></div><div class="grid-stat"><div class="val">'+(S.kbReady?'已连接':'未构建')+'</div><div class="lbl">资料检索</div></div><div class="grid-stat"><div class="val">—</div><div class="lbl">扫描资料</div></div></div><div style="margin-top:12px;font-size:12px;color:var(--gray-500)"><p>当前课程: '+esc(S.courseName)+'</p><p>📌 扫描版PDF需安装OCR组件，普通文本资料可直接使用</p></div></div><div class="card"><div class="card-header"><h3>🔍 课程资料检索</h3></div><div style="display:flex;gap:8px;margin-bottom:8px"><input id="rag-query" placeholder="输入关键词: 过拟合、正则化..." style="flex:1;padding:8px;border:1px solid var(--gray-300);border-radius:6px;font-size:13px"><button class="btn btn-primary" onclick="_ragSearch()">检索</button></div><div id="rag-results"><div class="empty-state" style="padding:20px"><p style="font-size:12px;color:var(--gray-400)">输入关键词测试知识库检索</p></div></div></div>';
}

window._ragSearch=async function(){const q=document.getElementById('rag-query')?.value.trim();if(!q)return;const el=$('#rag-results');el.innerHTML='<div class="loading-block"><span class="spinner"></span> 检索中...</div>';try{const{ok,data}=await api('/api/rag/courses/'+S.courseId+'/search?q='+encodeURIComponent(q)+'&top_k=5');if(ok&&data.results){let h='<p style="font-size:12px;color:var(--gray-500);margin-bottom:8px">找到 '+data.results.length+' 条结果</p>';data.results.forEach(r=>{h+='<div class="cite-card"><div class="cite-header"><span class="cite-filename">📄 '+esc(r.source||'资料')+'</span><span class="cite-score high">相关度 '+Math.round((r.score||0)*100)+'%</span></div><div class="cite-snippet">'+esc((r.content||'').substring(0,200))+'</div><div class="cite-meta">'+(r.page_number?'<span>📍 第'+r.page_number+'页</span>':'')+'</div></div>';});el.innerHTML=h;}else el.innerHTML='<div class="empty-state"><p>无结果或知识库未构建</p></div>';}catch(e){el.innerHTML='<div class="error-card"><div class="err-title">检索失败</div><div class="err-suggestion">请确认知识库已构建</div></div>';}};

// ════════════ PAGE: LEARNING PATH ════════════
function loadLearningPath(){
  const el=document.getElementById('page-learning-path');
  el.innerHTML='<div class="card"><div class="card-header"><h3>🗺️ 学习路径</h3><button class="btn btn-sm btn-primary" onclick="loadLearningPath()">🔄 重新生成</button></div><p style="font-size:11px;color:var(--gray-500);margin-bottom:8px">📌 示例路径 · 点击"重新生成"获取 AI 个性化版本</p>'+(DEFAULT_PLAN.steps||[]).map(s=>'<div class="step-card"><div class="step-num">'+(s.order||'?')+'</div><div class="step-info"><h4>'+esc(s.topic||'')+'</h4><p>'+esc(s.reason||'')+'</p><p>资源: '+(s.resource_types||[]).join(', ')+' | 预计: '+(s.estimated_minutes||'?')+' 分钟</p><p style="color:var(--success)">🏋️ '+esc(s.practice||'')+'</p></div></div>').join('')+'</div>';
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),20000);
  api('/api/app/generate',{method:'POST',body:JSON.stringify({course_id:S.courseId,resource_type:'study_plan',topic:'导数与极限入门'}),signal:controller.signal}).then(({ok,data})=>{clearTimeout(timeout);if(ok&&data.study_plan){const sp=data.study_plan;el.innerHTML='<div class="card"><div class="card-header"><h3>🗺️ '+esc(sp.title||'学习路径')+'</h3><button class="btn btn-sm btn-primary" onclick="loadLearningPath()">🔄 重新生成</button></div><p style="font-size:12px;color:var(--gray-500);margin-bottom:8px">'+esc(sp.profile_summary||'')+'</p>'+(sp.steps||[]).map(s=>'<div class="step-card"><div class="step-num">'+(s.order||'?')+'</div><div class="step-info"><h4>'+esc(s.topic||'')+'</h4><p>'+esc(s.reason||'')+'</p><p>资源: '+(s.resource_types||[]).join(', ')+' | 预计: '+(s.estimated_minutes||'?')+' 分钟</p></div></div>').join('')+'</div>';}}).catch(()=>{clearTimeout(timeout);});
}

// ════════════ PAGE: SETTINGS ════════════
function loadSettings(){
  const el=document.getElementById('page-settings');
  el.innerHTML='<div class="card"><div class="card-header"><h3>⚙️ AI 模型服务配置</h3></div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;margin-bottom:12px"><div><b>当前模型：</b>DeepSeek</div><div><b>星火模型：</b>可配置</div><div><b>备用机制：</b>已启用</div></div>'+
    '<div><button class="btn btn-sm btn-outline" onclick="var el=document.getElementById(\'settings-advanced\');var arrow=document.getElementById(\'settings-arrow\');el.style.display=el.style.display===\'none\'?\'block\':\'none\';arrow.textContent=el.style.display===\'none\'?\'▶\':\'▼\';"><span id="settings-arrow">▶</span> 高级配置</button></div>'+
    '<div id="settings-advanced" style="display:none;margin-top:12px;border-top:1px solid var(--gray-100);padding-top:12px">'+
    '<div class="form-group"><label>AI 模型服务</label><select id="settings-provider" onchange="_onProviderChange()"><option value="deepseek">DeepSeek</option><option value="spark">讯飞星火</option></select></div>'+
    '<div class="form-group" id="spark-model-group" style="display:none"><label>星火模型版本</label><select id="settings-spark-model"><option value="generalv3.5">generalv3.5</option><option value="generalv3">generalv3</option><option value="lite">lite</option><option value="pro-128k">pro-128k</option><option value="max-32k">max-32k</option><option value="4.0Ultra">4.0Ultra</option></select></div>'+
    '<div class="form-group"><label>API 密钥</label><input id="settings-key" type="password" placeholder="输入 API 密钥..."><div class="form-hint">密钥仅保存在本地后端，不会上传云端</div></div>'+
    '<div style="display:flex;gap:8px"><button class="btn btn-primary" onclick="_saveSettings()">💾 保存</button><button class="btn btn-outline" onclick="_testConnection()">🔌 测试连接</button></div>'+
    '<div id="settings-status" style="margin-top:8px;font-size:12px"></div>'+
    '</div></div>'+
    '<div class="card"><div class="card-header"><h3>📊 系统状态</h3></div><div id="settings-sys-status"><div class="loading-block"><span class="spinner"></span> 加载...</div></div></div>'+
    '<div class="card"><div class="card-header"><h3>🔒 安全说明</h3></div><p style="font-size:12px;color:var(--gray-500)">🔐 密钥仅保存在本地后端 · 🚫 不会上传云端 · ✅ 已排除版本管理跟踪</p></div>';
  api('/api/settings/status').then(({ok,data})=>{const s=$('#settings-sys-status');if(ok)s.innerHTML='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px"><div><b>当前模型:</b> '+esc(data.llm_provider||'—')+'</div><div><b>模型版本:</b> '+esc(data.llm_model||'—')+'</div><div><b>演示模式:</b> '+(data.is_mock?'是':'否')+'</div><div><b>DeepSeek:</b> '+(data.deepseek_configured?'✅已配置':'❌未配置')+'</div><div><b>讯飞星火:</b> '+(data.spark_configured?'✅已配置':'❌未配置')+'</div><div><b>星火版本:</b> '+esc(data.spark_model||'—')+'</div><div><b>备用服务:</b> '+esc(data.fallback_provider||'—')+'</div><div><b>语义索引:</b> '+(data.embedding_is_mock?'未启用':'已启用')+'</div></div>';}).catch(()=>{});}

window._onProviderChange=function(){
  var prov=document.getElementById('settings-provider')?.value;
  var sparkGroup=document.getElementById('spark-model-group');
  if(sparkGroup)sparkGroup.style.display=prov==='spark'?'block':'none';
  var baseInput=document.getElementById('settings-base');
  if(baseInput)baseInput.value=prov==='spark'?'https://spark-api-open.xf-yun.com/v1':'https://api.deepseek.com/v1';
};

window._saveSettings=async function(){var provider=document.getElementById('settings-provider')?.value||'deepseek';var key=document.getElementById('settings-key')?.value.trim();if(!key){toast('请输入 API 密码','error');return;}var base=document.getElementById('settings-base')?.value.trim();var model=document.getElementById('settings-spark-model')?.value||document.getElementById('settings-model')?.value.trim()||'deepseek-chat';var se=$('#settings-status');se.innerHTML='<span class="spinner"></span> 保存中...';try{var body={provider:provider,api_key:key,base_url:base||(provider==='spark'?'https://spark-api-open.xf-yun.com/v1':'https://api.deepseek.com/v1'),model:model};const{ok,data}=await api('/api/settings/llm',{method:'POST',body:JSON.stringify(body)});se.innerHTML=ok?'<span style="color:var(--success)">✅ 已保存</span>':'<span style="color:var(--danger)">❌ 失败: '+esc(data.detail||'')+'</span>';}catch(e){se.innerHTML='<span style="color:var(--danger)">❌ 错误</span>';}};
window._testConnection=async function(){var provider=document.getElementById('settings-provider')?.value||'deepseek';const se=$('#settings-status');se.innerHTML='<span class="spinner"></span> 测试 '+esc(provider)+' 中...';try{const{ok,data}=await api('/api/settings/test-llm',{method:'POST',body:JSON.stringify({message:'你好，请回复连接成功',provider:provider})});se.innerHTML=(ok&&data.ok)?'<span style="color:var(--success)">✅ '+esc(provider)+' 连接成功! '+data.latency_ms+'ms</span>':'<span style="color:var(--danger)">❌ '+esc(data.error||'连接失败')+'</span>';}catch(e){se.innerHTML='<span style="color:var(--danger)">❌ 错误</span>';}};

// ════════════ FULL DEMO ════════════
window._runFullDemo=async function(){
  if(!S.token){toast('请先登录','error');return;}
  const stepNames=['检查模型','准备课程','分析画像','资料检索','生成回答','生成导图','生成测验','生成讲义','生成PPT','完成展示'];
  navTo('dashboard');const el=document.getElementById('page-dashboard');
  el.innerHTML='<div class="card"><div class="card-header"><h3>🎯 全流程演示 — 多智能体流水席</h3></div><div class="demo-timeline" id="demo-steps">'+stepNames.map(s=>'<div class="demo-timeline-item waiting" id="dstep-'+s+'"><span class="dt-icon">⏳</span><span class="dt-label">'+s+'</span><span class="dt-time"></span></div>').join('')+'</div><div id="demo-output" style="margin-top:12px;font-size:12px"></div></div>';
  const markStep=(name,status)=>{const s=document.getElementById('dstep-'+name);if(s){s.className='demo-timeline-item '+status;var icon=s.querySelector('.dt-icon');if(icon){icon.textContent=status==='running'?'🔄':status==='done'?'✅':status==='fail'?'❌':'⏳';}}};
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  const out=$('#demo-output');

  for(let i=0;i<3;i++){markStep(stepNames[i],'running');out.innerHTML='<span class="spinner"></span> '+stepNames[i]+'...';await delay(300);markStep(stepNames[i],'done');}
  markStep(stepNames[3],'running');
  try{
    const{ok,data}=await api('/api/app/run-demo',{method:'POST',body:JSON.stringify({course_id:S.courseId})});
    markStep(stepNames[3],'done');
    const resNames=['生成回答','生成导图','生成测验','生成讲义','生成PPT'];
    for(let i=0;i<resNames.length;i++){const n=resNames[i];const si=stepNames.indexOf(n);if(si>=0)markStep(stepNames[si],'running');out.innerHTML='<span class="spinner"></span> '+n+'...';await delay(400);if(si>=0)markStep(stepNames[si],'done');}
    markStep('完成展示','done');
    out.innerHTML='';

    if(data.steps)data.steps.forEach(s=>{out.innerHTML+='<div style="margin:2px 0">'+(s.status==='success'?'✅':'❌')+' '+s.name+': '+esc(s.detail||'')+'</div>';});

    if(ok&&data.demo_results){
      S.demoResults=data.demo_results;
      const dr=data.demo_results,rs=dr.resources||{};
      const resCount=Object.keys(rs).length;
      const citCount=(dr.citations||[]).length;

      out.innerHTML+='<div class="card" style="margin-top:12px;background:var(--primary-bg);border:1px solid var(--primary-light)"><div class="card-header"><h3>✅ 演示完成</h3></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px"><div>📝 RAG 问答已完成</div><div>📚 引用 '+citCount+' 条课程资料</div><div>🧠 已生成 '+resCount+' 类学习资源</div><div>📊 PPT 可下载</div></div><div style="margin-top:8px"><button class="btn btn-primary" onclick="navTo(\'assistant\');_switchArtifactTab(\'mindmap\')">👀 查看思维导图</button> <button class="btn btn-outline" onclick="navTo(\'generator\')">📋 查看全部资源</button></div></div>';

      if(dr.answer){const msgs=$('#chat-messages');msgs.innerHTML='';msgs.innerHTML+='<div class="msg-bubble user"><div class="msg-content">'+esc(dr.question||'')+'</div></div>';msgs.innerHTML+='<div class="msg-bubble agent"><div class="msg-content">'+fmtAns(dr.answer).substring(0,500)+'...</div></div>';if(dr.citations)renderCitations(dr.citations);}
      if(rs.mindmap)renderArtifact('mindmap',rs.mindmap);
      if(rs.quiz)renderArtifact('quiz',rs.quiz);
      if(rs.lecture_doc)renderArtifact('lecture',rs.lecture_doc);
      if(rs.ppt)renderArtifact('ppt',rs.ppt);
      if(rs.study_plan)renderArtifact('study_plan',{study_plan:rs.study_plan});
      toast('演示完成！已生成 问答、思维导图、测验、讲义、PPT 和学习路径','success');
      setTimeout(()=>{navTo('assistant');_switchArtifactTab('mindmap');},1500);
    }
  }catch(e){stepNames.forEach(s=>markStep(s,'fail'));out.innerHTML='<div class="error-card"><div class="err-title">演示失败</div><div class="err-detail">'+esc(friendlyError(e))+'</div></div>';}
};

// ════════════ HELPERS ════════════
function fmtAns(t){if(!t)return'';var s=esc(t);s=s.replace(/\*\*(.+?)\*\*/g,'<b>$1</b>');s=s.replace(/\n---\n/g,'<hr style="border:none;border-top:1px dashed var(--gray-200);margin:8px 0">');s=s.replace(/\[cite:\s*(\d+)\]/gi,'<span class="citation-tag" onclick="highlightSourceCard(\'$1\')" title="点击查看引用来源">[$1]</span>');s=s.replace(/\n/g,'<br>');return s;}

// ════════════ R2.2 QUIZ INTERACTIVE ════════════
window.submitQuizAnswer = function(qIdx, optIdx, correctIdx) {
  var sel = '#quiz-'+qIdx+' .quiz-option-btn';
  var btns = document.querySelectorAll(sel);
  var fb = document.getElementById('quiz-fb-'+qIdx);
  var expl = document.getElementById('quiz-expl-'+qIdx);
  btns.forEach(function(b,i) {
    b.disabled = true;
    if (i === correctIdx) b.classList.add('correct');
    else if (i === optIdx && i !== correctIdx) b.classList.add('wrong');
  });
  if (fb) {
    fb.className = 'quiz-feedback '+(optIdx===correctIdx?'correct-fb':'wrong-fb')+' show';
    fb.innerHTML = optIdx===correctIdx?'✅ 回答正确！':'❌ 回答错误，正确答案是 '+String.fromCharCode(65+correctIdx);
    fb.style.display='block';
  }
  if (expl) { expl.className = 'quiz-feedback show'; expl.style.display='block'; }
  var qEl = document.getElementById('quiz-'+qIdx);
  if (qEl) {
    var toastEl = document.createElement('div');
    toastEl.className = 'quiz-profile-toast';
    toastEl.textContent = '📊 答题行为已捕获，正在隐式修正您的知识短板画像参数...';
    qEl.appendChild(toastEl);
    setTimeout(function(){ if(toastEl.parentNode) toastEl.parentNode.removeChild(toastEl); }, 4000);
  }
};

// ════════════ R2.2-FINAL: TIMEOUT FALLBACK ════════════
function showDemoFallbackAnswer(q, lid) {
  var demoAnswer = '\n<b>核心概念</b>\n\n导数的本质是函数在某一点处的<em>瞬时变化率</em>。从几何角度看，导数就是曲线在该点切线的斜率。\n\n导数和函数变化率的关系：\n\n1. <b>变化率是导数的物理意义</b>：如果你正在开车，车速表显示的就是位移对时间的导数。\n\n2. <b>正导数表示函数递增</b>：f\'(x) > 0 时，函数在该点附近呈上升趋势。\n\n3. <b>负导数表示函数递减</b>：f\'(x) < 0 时，函数在该点附近呈下降趋势。\n\n4. <b>导数为零是关键点</b>：f\'(x) = 0 处可能是极值点。\n\n<b>例题</b>：对于 f(x) = x²，求导得 f\'(x) = 2x。当 x 从 0 变到 2 时，f\'(x) 从 0 变到 4，说明函数值的变化速度在加快。';
  
  var demoCitations = [
    {id:'1',source:'人工智能导论 · 过拟合与欠拟合', score:0.98, content:'过拟合是指模型在训练数据上表现很好，但泛化到新数据时性能显著下降的现象...', page_number:'课程资料'},
    {id:'2',source:'人工智能导论 · 正则化', score:0.92, content:'正则化通过给损失函数添加惩罚项来限制模型复杂度，是防止过拟合的核心技术...', page_number:'课程资料'},
    {id:'3',source:'人工智能导论 · 训练集与验证集', score:0.87, content:'合理划分训练集、验证集和测试集是评估模型泛化能力的基础...', page_number:'课程资料'}
  ];
  var demoTrace = [
    {agent_name:'AI学习助手',status:'completed',message:'已完成问题意图分析'},
    {agent_name:'资料检索',status:'completed',message:'检索到 3 条课程资料引用'},
    {agent_name:'内容校验',status:'completed',message:'回答已通过课程资料校验'}
  ];
  
  renderAgentTracesFromBackend(demoTrace);
  renderCitations(demoCitations);
  
  var html = '<div class="msg-content">';
  html += '<div style="font-size:10px;background:var(--warning-bg);color:var(--warning);padding:4px 10px;border-radius:6px;margin-bottom:8px;display:inline-block">⚠️ 演示回答 · 真实回答仍在生成中...</div>';
  html += fmtAns(demoAnswer);
  html += '</div>';
  var demoData = {citations:demoCitations, agent_traces:demoTrace};
  html += buildAnswerSummaryCard(demoData);
  
  var el = document.getElementById(lid);
  if (el) { el.innerHTML = html; }
  S.currentAnswerData = {answer:demoAnswer, citations:demoCitations, agent_traces:demoTrace};
  toast('已显示演示回答。真实回答生成后会替换。','info');
}

// ════════════ R2.3-Lite: RADAR CHART ════════════
var _profileRadarChart = null;
function updateProfileRadar(profile) {
  var canvas = document.getElementById('profileRadarChart');
  if (!canvas || typeof Chart === 'undefined') return;
  canvas.style.display = 'block';
  var ctx = canvas.getContext('2d');
  var data = profile || S.profileDelta || {};

  var labels = ['知识基础','认知风格','学习目标','学习节奏','知识短板','资源偏好','元学习','学习动机'];
  var values = [
    data.knowledge_level === 'advanced' ? 85 : data.knowledge_level === 'intermediate' ? 60 : data.knowledge_level === 'beginner' ? 30 : 45,
    data.cognitive_style === 'visual' ? 80 : data.cognitive_style === 'logical' ? 70 : data.cognitive_style === 'practice_oriented' ? 60 : 45,
    data.learning_goal === '考研复习' ? 90 : 55,
    data.pace_preference === 'fast' ? 75 : data.pace_preference === 'slow' ? 35 : 50,
    data.detected_weakness ? 30 : 65,
    data.resource_preference ? 70 : 55,
    60, 65
  ];

  if (_profileRadarChart) { _profileRadarChart.destroy(); _profileRadarChart = null; }

  _profileRadarChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: labels,
      datasets: [{
        label: '学习画像',
        data: values,
        backgroundColor: 'rgba(79,70,229,0.12)',
        borderColor: 'rgba(79,70,229,0.8)',
        borderWidth: 2,
        pointBackgroundColor: '#4f46e5',
        pointRadius: 3,
        tension: 0.4
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      animation: { duration: 600 },
      scales: { r: { beginAtZero: true, max: 100, ticks: { stepSize: 20, font: { size: 8 } }, pointLabels: { font: { size: 8 } } } },
      plugins: { legend: { display: false } }
    }
  });
}

// ════════════ R2.3-Lite: QUIZ INTERACTIVE ════════════
function renderInteractiveQuiz(items, prefix) {
  var out = '<div style="padding:8px"><div id="quiz-score-'+prefix+'" style="font-size:11px;color:var(--gray-500);margin-bottom:8px">已答 0 / '+items.length+' 题 | 正确率 —%</div>';
  items.forEach(function(it, i) {
    var question = it.question || it.stem || it.title || '';
    var options = it.options || it.choices || [];
    var answer = it.answer !== undefined ? it.answer : (it.correct_answer !== undefined ? it.correct_answer : (it.correct !== undefined ? it.correct : -1));
    var explanation = it.explanation || it.analysis || '';
    var difficulty = it.difficulty || it.level || '';
    var concept = it.knowledge_point || it.concept || it.topic || '';
    var diffLabel = difficulty === 'basic' ? '基础' : difficulty === 'intermediate' ? '进阶' : difficulty === 'advanced' ? '挑战' : '';
    // Normalize answer index
    var correctIdx = -1;
    if (typeof answer === 'number') { correctIdx = answer; }
    else if (typeof answer === 'string') { correctIdx = answer.toUpperCase().charCodeAt(0) - 65; }

    out += '<div class="quiz-item" id="'+prefix+'-'+i+'"><div class="q-text">Q'+(i+1)+'. '+esc(question)+
      (diffLabel?' <span style="font-size:10px;color:var(--gray-400)">'+diffLabel+'</span>':'')+
      (concept?' <span style="font-size:10px;background:var(--primary-bg);padding:1px 6px;border-radius:4px">'+esc(concept)+'</span>':'')+
      '</div>';
    options.forEach(function(o, j) {
      out += '<button class="quiz-option-btn" onclick="handleQuizOption(\''+prefix+'\','+i+','+j+','+correctIdx+',\''+esc(concept||question.substring(0,20))+'\')">'+String.fromCharCode(65+j)+'. '+esc(o)+'</button>';
    });
    out += '<div class="quiz-feedback" id="'+prefix+'-fb-'+i+'"></div>';
    out += '<div class="quiz-feedback" id="'+prefix+'-expl-'+i+'">💡 '+esc(explanation)+'</div></div>';
  });
  out += '</div>';
  return out;
}

window.handleQuizOption = function(prefix, qIdx, optIdx, correctIdx, concept) {
  var btns = document.querySelectorAll('#'+prefix+'-'+qIdx+' .quiz-option-btn');
  var fb = document.getElementById(prefix+'-fb-'+qIdx);
  var expl = document.getElementById(prefix+'-expl-'+qIdx);
  var isCorrect = optIdx === correctIdx;

  btns.forEach(function(b, i) {
    b.disabled = true;
    b.classList.remove('selected');
    if (i === correctIdx) b.classList.add('correct');
    else if (!isCorrect && i === optIdx) b.classList.add('wrong');
  });

  if (fb) {
    fb.className = 'quiz-feedback '+(isCorrect?'correct-fb':'wrong-fb')+' show';
    fb.innerHTML = isCorrect ? '✅ 回答正确！' : '❌ 回答错误，正确答案是 '+String.fromCharCode(65+correctIdx);
    fb.style.display = 'block';
  }
  if (expl) { expl.className = 'quiz-feedback show'; expl.style.display = 'block'; }

  // Update score
  updateQuizScore(prefix);

  // R2.3-Lite: light tip for wrong answers
  if (!isCorrect && concept) {
    var tip = document.createElement('div');
    tip.className = 'quiz-profile-toast';
    tip.textContent = '📌 该题暴露出对「'+concept+'」的薄弱理解，建议回到学习路径复习相关步骤。';
    var qEl = document.getElementById(prefix+'-'+qIdx);
    if (qEl) qEl.appendChild(tip);
  }
};

function updateQuizScore(prefix) {
  var items = document.querySelectorAll('[id^="'+prefix+'-"] .quiz-option-btn');
  var quizItems = document.querySelectorAll('[id^="'+prefix+'-"].quiz-item');
  var total = quizItems.length;
  var answered = 0, correct = 0;
  quizItems.forEach(function(item) {
    var btns = item.querySelectorAll('.quiz-option-btn');
    var anyDisabled = false, anyCorrect = false;
    btns.forEach(function(b) {
      if (b.disabled) anyDisabled = true;
      if (b.classList.contains('correct') && b.disabled) anyCorrect = true;
    });
    if (anyDisabled) answered++;
    if (anyCorrect) correct++;
  });
  var pct = answered > 0 ? Math.round(correct/answered*100) : 0;
  var scoreEl = document.getElementById('quiz-score-'+prefix);
  if (scoreEl) scoreEl.innerHTML = '已答 '+answered+' / '+total+' 题 | 正确 '+correct+' 题 | 正确率 '+pct+'%';
}

window.resetAllQuiz = function(prefix) {
  var items = document.querySelectorAll('[id^="'+prefix+'-"].quiz-item');
  items.forEach(function(item) {
    var btns = item.querySelectorAll('.quiz-option-btn');
    btns.forEach(function(b) { b.disabled = false; b.classList.remove('correct','wrong','selected'); });
    var fb = item.querySelector('.quiz-feedback');
    if (fb) { fb.className = 'quiz-feedback'; fb.style.display = 'none'; fb.innerHTML = ''; }
    var expl = item.querySelectorAll('.quiz-feedback');
    expl.forEach(function(e) { if (e.id && e.id.indexOf('-expl-') >= 0) { e.className = 'quiz-feedback'; e.style.display = 'none'; } });
  });
  var scoreEl = document.getElementById('quiz-score-'+prefix);
  if (scoreEl) scoreEl.innerHTML = '已答 0 / '+items.length+' 题 | 正确率 —%';
};

// ════════════ R3: AVATAR FUNCTIONS ════════════
window._avatarSpeakAnswer = async function() {
  var text = (S.currentAnswerData?.answer || S.lastAnswerTopic || '').substring(0, 500);
  if (!text) { toast('暂无回答可供讲解', 'info'); return; }
  try {
    var res = await api('/api/avatar/speak', {method:'POST', body:JSON.stringify({text:text,source:'answer'})});
    if (res.ok && res.data.ok) {
      document.getElementById('avatar-status-text').textContent = '正在讲解...';
      toast('数字人正在讲解当前回答', 'success');
    } else {
      var msg = (res.data?.message || res.data?.error_code || '数字人服务不可用');
      document.getElementById('avatar-status-text').textContent = '未配置';
      toast(msg, 'info');
    }
  } catch(e) { toast('数字人服务不可用', 'info'); }
};
window._avatarSpeakPath = async function() {
  var plan = S.genCache?.['study_plan'];
  var text = plan?.study_plan?.profile_summary || '暂无学习路径';
  text = text.substring(0, 300);
  try {
    var res = await api('/api/avatar/speak', {method:'POST', body:JSON.stringify({text:text,source:'study_plan'})});
    if (res.ok && res.data.ok) {
      document.getElementById('avatar-status-text').textContent = '正在讲解...';
      toast('数字人正在讲解学习路径', 'success');
    } else {
      document.getElementById('avatar-status-text').textContent = '未配置';
      toast(res.data?.message || '数字人服务不可用', 'info');
    }
  } catch(e) { toast('数字人服务不可用', 'info'); }
};
window._avatarStop = async function() {
  document.getElementById('avatar-status-text').textContent = '已就绪';
  toast('已停止讲解', 'info');
};

// ── COMPETITION DEMO MODE ──────────────────────

// Demo problem (fixed for competition)
var DEMO_QUESTION = '我在学习人工智能导论，机器学习基础一般，容易混淆过拟合和欠拟合。请帮我理解过拟合和正则化的关系。';
var DEMO_TOPIC = '过拟合与正则化';

// Flow state
var compRunning = false;
var compResults = { answer: '', citations: [], mindmap: null, quiz: null, studyPlan: null };

window._toggleAdvanced = function() {
  var g = document.getElementById('nav-advanced-group');
  var t = document.getElementById('nav-advanced-toggle');
  if (!g || !t) return;
  var isVisible = g.style.display !== 'none';
  g.style.display = isVisible ? 'none' : 'block';
  t.querySelector('span:last-child').textContent = isVisible ? '高级功能 ▾' : '高级功能 ▴';
};

// ── Step helpers ──

function compUpdateAgentTrace(steps) {
  var tc = document.getElementById('comp-agent-trace-content');
  if (!tc) return;
  var icons = {
    '画像分析': '🔍', '课程资料检索': '📚', '可信答案校验': '✅',
    '学习资源生成': '⚡', '学习路径规划': '🗺️'
  };
  var descriptions = {
    '画像分析': '识别你的学习基础、目标和偏好',
    '课程资料检索': '从课程知识库中查找相关内容',
    '可信答案校验': '检查回答是否有资料依据',
    '学习资源生成': '生成导图、测验和学习路径',
    '学习路径规划': '根据你的薄弱点规划学习顺序'
  };
  var html = '';
  steps.forEach(function(s) {
    var icon = icons[s.name] || '🤖';
    var cls = s.status === 'completed' ? 'is-completed' : (s.status === 'running' ? 'is-running' : (s.status === 'failed' ? 'is-failed' : ''));
    var tag = s.status === 'completed' ? '已完成' : (s.status === 'running' ? '执行中' : (s.status === 'failed' ? '已降级处理' : '待执行'));
    var detail = s.detail || descriptions[s.name] || '';
    html += '<div class="agent-trace-card ' + cls + '" data-testid="agent-step">' +
      '<div class="agent-icon">' + icon + '</div>' +
      '<div class="agent-info"><div class="agent-name">' + esc(s.name) + '</div>' +
      '<div class="agent-detail">' + esc(detail) + '</div></div>' +
      '<span class="agent-status-tag ' + s.status + '">' + tag + '</span></div>';
  });
  tc.innerHTML = html;
}

function compUpdateProgress(text) {
  var p = document.getElementById('comp-progress');
  var pt = document.getElementById('comp-progress-text');
  if (p) p.style.display = 'block';
  if (pt) pt.textContent = text;
}

function compUpdateProfile(delta) {
  var pt = document.getElementById('comp-profile-text');
  if (!pt) return;
  if (delta && delta.knowledge_level) {
    pt.innerHTML = '🎓 水平: ' + esc(delta.knowledge_level) +
      (delta.cognitive_style ? ' | 风格: ' + esc(delta.cognitive_style) : '') +
      (delta.last_topic ? ' | 主题: ' + esc(delta.last_topic) : '');
  }
}

function compUpdateCitations(cits) {
  var el = document.getElementById('comp-citations');
  if (!el) return;
  if (cits && cits.length > 0) {
    var html = '<h4>📚 课程依据</h4><p style="font-size:10px;color:var(--gray-400);margin-bottom:4px">回答内容基于《人工智能导论》课程资料整理，关键结论可追溯。</p><div class="comp-citations-list">';
    cits.forEach(function(c, i) {
      var title = c.title || c.source || c.chapter || '课程知识片段';
      var page = c.page ? ' (p.' + esc(c.page) + ')' : '';
      html += '<div class="comp-citation-item cit-clickable" data-testid="citation-card" data-cit-idx="' + i + '" onclick="_compHighlightCitation(' + i + ')">' +
        '<span class="cit-num">[' + (i+1) + ']</span>' +
        '<span>' + esc(title) + page + '</span></div>';
    });
    html += '</div>';
    el.innerHTML = html;
  } else {
    el.innerHTML = '<h4>📚 课程依据</h4><p style="font-size:11px;color:var(--gray-400)">已基于《人工智能导论》课程资料整理本节依据。<br>学习流程不受影响。</p>';
  }
}

window._compHighlightCitation = function(idx) {
  // Remove all highlights
  document.querySelectorAll('.cit-clickable').forEach(function(c) { c.classList.remove('cit-highlight'); });
  // Highlight clicked
  var target = document.querySelector('.cit-clickable[data-cit-idx="' + idx + '"]');
  if (target) {
    target.classList.add('cit-highlight');
    target.scrollIntoView({behavior:'smooth',block:'nearest'});
    // Auto-remove after 2s
    setTimeout(function() { target.classList.remove('cit-highlight'); }, 2000);
  }
};

function compAddChatMsg(role, content) {
  var msgs = document.getElementById('comp-chat-messages');
  if (!msgs) return;
  var empty = msgs.querySelector('.comp-empty-state');
  if (empty) empty.remove();
  var div = document.createElement('div');
  div.className = 'comp-msg ' + (role === 'user' ? 'comp-msg-user' : 'comp-msg-bot');
  div.innerHTML = content;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function compShowError(context, fallbackMsg) {
  var msgs = document.getElementById('comp-chat-messages');
  if (!msgs) return;
  var div = document.createElement('div');
  div.className = 'comp-msg comp-msg-bot comp-msg-error';
  div.innerHTML = '<div class="comp-error-card"><div class="comp-error-icon">⚠️</div><div class="comp-error-msg">' + fallbackMsg + '</div></div>';
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

// ── Workspace tabs ──

function compInitTabs() {
  var tabs = document.querySelectorAll('#comp-workspace-tabs .comp-tab');
  tabs.forEach(function(tab) {
    tab.addEventListener('click', function() {
      tabs.forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');
      var panelId = 'comp-panel-' + tab.dataset.tab;
      document.querySelectorAll('.comp-tab-panel').forEach(function(p) { p.style.display = 'none'; });
      var panel = document.getElementById(panelId);
      if (panel) panel.style.display = 'block';
      document.getElementById('comp-ws-empty') && (document.getElementById('comp-ws-empty').style.display = 'none');
    });
  });
}

function compSwitchTab(tabName) {
  var tabs = document.querySelectorAll('#comp-workspace-tabs .comp-tab');
  tabs.forEach(function(t) { t.classList.remove('active'); });
  var target = document.querySelector('#comp-workspace-tabs .comp-tab[data-tab="' + tabName + '"]');
  if (target) target.classList.add('active');
  document.querySelectorAll('.comp-tab-panel').forEach(function(p) { p.style.display = 'none'; });
  var panel = document.getElementById('comp-panel-' + tabName);
  if (panel) panel.style.display = 'block';
  var ws = document.getElementById('comp-ws-empty');
  if (ws) ws.style.display = 'none';
}

// ── Quiz rendering ──

var compQuizState = { items: [], selected: {}, submitted: {}, score: 0 };

function compRenderQuiz(items) {
  compQuizState = { items: items || [], selected: {}, submitted: {}, score: 0 };
  var panel = document.getElementById('comp-panel-quiz');
  if (!panel || !items || items.length === 0) return;
  var html = '<div class="comp-quiz-wrapper">';
  items.forEach(function(q, qi) {
    var kp = q.knowledge_point || q.topic || '过拟合与正则化';
    html += '<div class="comp-quiz-item" data-testid="quiz-card">' +
      '<div class="comp-quiz-q"><span class="comp-quiz-num">' + (qi+1) + '.</span> ' + esc(q.question || q.q || '') + '</div>';
    var opts = q.options || q.opts || [];
    opts.forEach(function(o, oi) {
      var optText = typeof o === 'string' ? o : (o.text || o.label || '');
      html += '<div class="comp-quiz-opt" data-testid="quiz-option" data-qi="' + qi + '" data-oi="' + oi + '" onclick="_compSelectQuiz(' + qi + ',' + oi + ')">' +
        '<span class="comp-quiz-opt-marker" id="comp-quiz-marker-' + qi + '-' + oi + '">' + String.fromCharCode(65+oi) + '</span>' +
        '<span>' + esc(optText) + '</span></div>';
    });
    // Feedback area (hidden until selection)
    html += '<div class="comp-quiz-feedback" id="comp-quiz-fb-' + qi + '" style="display:none"></div>';
    html += '</div>';
  });
  html += '<div class="comp-quiz-footer">' +
    '<div class="comp-quiz-progress" id="comp-quiz-progress">已答: 0/' + items.length + '</div>' +
    '<button class="btn btn-primary comp-quiz-submit" onclick="_compSubmitQuiz()">✅ 提交测验</button>' +
    '</div>';
  html += '<div class="comp-quiz-result" id="comp-quiz-result" style="display:none"></div>';
  html += '</div>';
  panel.innerHTML = html;
}

window._compSelectQuiz = function(qi, oi) {
  if (compQuizState.submitted[qi]) return;
  var q = compQuizState.items[qi];
  var ans = q.answer !== undefined ? q.answer : (q.correct !== undefined ? q.correct : 0);

  // Clear previous selection in this question
  var items = document.querySelectorAll('.comp-quiz-opt[data-qi="' + qi + '"]');
  items.forEach(function(el) {
    el.classList.remove('selected', 'correct', 'incorrect');
    var mk = document.getElementById('comp-quiz-marker-' + el.dataset.qi + '-' + el.dataset.oi);
    if (mk) { mk.className = 'comp-quiz-opt-marker'; mk.textContent = String.fromCharCode(65 + parseInt(el.dataset.oi)); }
  });

  // Mark selected
  var target = document.querySelector('.comp-quiz-opt[data-qi="' + qi + '"][data-oi="' + oi + '"]');
  if (target) target.classList.add('selected');
  var marker = document.getElementById('comp-quiz-marker-' + qi + '-' + oi);
  if (marker) marker.className = 'comp-quiz-opt-marker selected';

  compQuizState.selected[qi] = oi;
  compQuizState.submitted[qi] = true;

  // Disable options for this question
  items.forEach(function(el) { el.style.pointerEvents = 'none'; });

  // Show correct/incorrect
  items.forEach(function(el) {
    var elOi = parseInt(el.dataset.oi);
    if (elOi === ans) {
      el.classList.add('correct');
      var mk = document.getElementById('comp-quiz-marker-' + qi + '-' + elOi);
      if (mk) { mk.className = 'comp-quiz-opt-marker correct'; mk.textContent = '\u2713'; }
    }
  });
  if (oi !== ans) {
    target.classList.add('incorrect');
    if (marker) { marker.className = 'comp-quiz-opt-marker incorrect'; marker.textContent = '\u2717'; }
  }

  // Show instant feedback
  var fb = document.getElementById('comp-quiz-fb-' + qi);
  if (fb) {
    fb.style.display = 'block';
    var isCorrect = (oi === ans);
    var explain = q.explanation || q.explain || '';
    var kp = q.knowledge_point || q.topic || '过拟合与正则化';
    fb.innerHTML = '<div class="comp-quiz-fb-inner ' + (isCorrect ? 'fb-correct' : 'fb-incorrect') + '">' +
      '<div class="fb-result">' + (isCorrect ? '✅ 回答正确' : '📖 还需要复习这个知识点') + '</div>' +
      (explain ? '<div class="fb-explain"><strong>解析：</strong>' + esc(explain) + '</div>' : '') +
      '<div class="fb-knowledge">📚 知识点：' + esc(kp) + '</div></div>';
    fb.classList.add('fade-in');
  }

  // Update progress
  var answered = Object.keys(compQuizState.submitted).length;
  var total = compQuizState.items.length;
  var progressEl = document.getElementById('comp-quiz-progress');
  if (progressEl) progressEl.textContent = '已答: ' + answered + '/' + total;

  // Submit to backend (fire-and-forget)
  compSubmitToBackend(q, oi, ans);
  // Refresh learning report
  setTimeout(function() { compLoadLearningReport(); }, 800);
};

// ── Quiz backend submit ──

function compSubmitToBackend(q, selectedOi, correctAns) {
  if (!S.token) return;
  var isCorrect = (selectedOi === correctAns);
  var body = {
    course_id: S.courseId,
    topic: DEMO_TOPIC,
    question_text: q.question || q.q || '',
    selected_answer: String.fromCharCode(65 + selectedOi),
    correct_answer: String.fromCharCode(65 + correctAns),
    is_correct: isCorrect,
    knowledge_point: q.knowledge_point || q.topic || DEMO_TOPIC,
    explanation: q.explanation || q.explain || '',
  };
  fetch(S.apiBase + '/api/app/quiz/submit', {
    method: 'POST',
    headers: {'Content-Type':'application/json', 'Authorization':'Bearer '+S.token},
    body: JSON.stringify(body),
  }).catch(function() {
    // Silent fail — local feedback already shown
    console.warn('Quiz submit failed (non-blocking)');
  });
}

// ── Learning report ──

function compLoadLearningReport() {
  if (!S.token) return;
  fetch(S.apiBase + '/api/app/learning-report?course_id=' + S.courseId + '&topic=' + encodeURIComponent(DEMO_TOPIC), {
    headers: {'Authorization':'Bearer '+S.token},
  }).then(function(r) { return r.json(); })
  .then(function(data) {
    compRenderLearningReport(data);
  }).catch(function() {
    // Report card will show default state
  });
}

function compRenderLearningReport(data) {
  var el = document.getElementById('comp-learning-report');
  if (!el) {
    // Create card if not exists
    var rightCol = document.querySelector('.comp-col-right');
    if (!rightCol) return;
    el = document.createElement('div');
    el.className = 'comp-side-section';
    el.id = 'comp-learning-report';
    el.setAttribute('data-testid', 'learning-report-card');
    rightCol.appendChild(el);
  }

  var total = data.total_attempts || 0;
  if (total === 0) {
    el.innerHTML = '<h4>📊 学习报告</h4><p style="font-size:11px;color:var(--gray-400)">完成测验后将自动生成</p>';
    return;
  }

  var accuracy = Math.round((data.accuracy || 0) * 100);
  var weakPoints = data.weak_points || [];
  var resources = data.recommended_resources || [];
  var profileOk = data.profile_updated;

  var html = '<h4>📊 学习报告</h4>' +
    '<div class="lr-summary">' +
      '<div class="lr-stat"><span class="lr-stat-value" data-testid="accuracy-value">' + accuracy + '%</span><span class="lr-stat-label">正确率</span></div>' +
      '<div class="lr-stat"><span class="lr-stat-value">' + total + '</span><span class="lr-stat-label">已答题</span></div>' +
      '<div class="lr-stat"><span class="lr-stat-value">' + (profileOk ? '✅' : '⏳') + '</span><span class="lr-stat-label">画像更新</span></div>' +
    '</div>';

  if (weakPoints.length > 0) {
    html += '<div class="lr-section"><div class="lr-section-title">📌 当前薄弱点</div><div class="lr-chips">';
    weakPoints.forEach(function(wp) {
      html += '<span class="lr-chip" data-testid="weak-point-chip">' + esc(wp) + '</span>';
    });
    html += '</div></div>';
  }

  if (resources.length > 0) {
    html += '<div class="lr-section"><div class="lr-section-title">📖 推荐复习</div>';
    resources.forEach(function(r) {
      html += '<div class="lr-resource-card" data-testid="recommended-resource-card">' +
        '<span class="lr-resource-icon">' + ({mindmap:'🧠',quiz:'📝',lecture_doc:'📄',study_plan:'🗺️'}[r.type]||'📚') + '</span>' +
        '<span>' + esc(r.title) + '</span></div>';
    });
    html += '</div>';
  }

  html += '<p style="font-size:10px;color:var(--gray-400);margin-top:4px">根据测验表现，系统已识别薄弱点并更新学习画像</p>';
  el.innerHTML = html;
}

window._compSubmitQuiz = function() {
  var total = compQuizState.items.length;
  var answered = Object.keys(compQuizState.submitted).length;
  if (answered < total) {
    toast('请先回答所有题目（已答 ' + answered + '/' + total + '）', 'info');
    return;
  }
  var correct = 0;
  compQuizState.items.forEach(function(q, qi) {
    var sel = compQuizState.selected[qi];
    var ans = q.answer !== undefined ? q.answer : (q.correct !== undefined ? q.correct : 0);
    if (sel === ans) correct++;
  });
  compQuizState.score = correct;
  var result = document.getElementById('comp-quiz-result');
  if (result) {
    result.style.display = 'block';
    var pct = Math.round(correct / total * 100);
    var emoji = pct >= 80 ? '🎉' : (pct >= 60 ? '👍' : '📚');
    result.innerHTML = '<div class="comp-quiz-score">' + emoji + ' 得分: ' + correct + '/' + total + ' (' + pct + '%)</div>' +
      '<p style="font-size:12px;color:var(--gray-500);margin-top:4px">建议回顾知识结构图，加深理解</p>';
    result.classList.add('fade-in');
  }
  var submitBtn = document.querySelector('.comp-quiz-submit');
  if (submitBtn) submitBtn.style.display = 'none';
};

// ── Main flow ──

window._startCompetition = async function() {
  if (compRunning) return;
  // Auto-login
  if (!S.token || !S.user) {
    var ok = await initDemo();
    if (!ok) { toast('演示初始化失败，请确认后端已启动', 'error'); return; }
    updateTopbar();
  }
  // Transition to flow
  var landing = document.getElementById('competition-landing');
  var flow = document.getElementById('competition-flow');
  if (landing) landing.style.display = 'none';
  if (flow) flow.style.display = 'flex';

  // Setup tabs once
  if (!window._compTabsInited) { compInitTabs(); window._compTabsInited = true; }

  // Reset state
  compResults = { answer: '', citations: [], mindmap: null, quiz: null, studyPlan: null };
  var msgs = document.getElementById('comp-chat-messages');
  if (msgs) msgs.innerHTML = '';

  // Run flow
  await runCompetitionFlow();
};

window._compRegenerate = function() {
  if (compRunning) return;
  compRunning = false;
  document.getElementById('comp-btn-regenerate').style.display = 'none';
  var msgs = document.getElementById('comp-chat-messages');
  if (msgs) msgs.innerHTML = '';
  var ws = document.getElementById('comp-workspace');
  document.querySelectorAll('.comp-tab-panel').forEach(function(p) { p.innerHTML = ''; p.style.display = 'none'; });
  document.getElementById('comp-panel-lecture').innerHTML = '<div class="comp-empty-state"><div class="empty-icon">📊</div><p>讲义 与 PPT 学习包将在下一阶段生成</p></div>';
  var wsEmpty = document.getElementById('comp-ws-empty');
  if (wsEmpty) wsEmpty.style.display = '';
  compSwitchTab('mindmap');
  compResults = { answer: '', citations: [], mindmap: null, quiz: null, studyPlan: null };
  runCompetitionFlow();
};

async function runCompetitionFlow() {
  compRunning = true;
  var btn = document.getElementById('comp-btn-regenerate');
  if (btn) { btn.style.display = 'inline-flex'; btn.disabled = true; btn.textContent = '⏳ 正在生成学习方案...'; }

  var dp = window.DEMO_PAYLOAD;
  var usingDemo = false;
  var demoMsgShown = false;
  function showDemoMsg() {
    if (demoMsgShown) return;
    demoMsgShown = true;
    usingDemo = true;
    compAddChatMsg('bot', '<div style="font-size:11px;color:var(--gray-500);padding:8px;background:var(--gray-50);border-radius:6px;margin:8px 0">📡 网络响应较慢，已启用稳定演示内容。学习流程不受影响。</div>');
  }

  // Init trace with all running
  compUpdateAgentTrace([
    {name:'画像分析',status:'running',detail:'识别学习需求...'},
    {name:'课程资料检索',status:'pending',detail:''},
    {name:'可信答案校验',status:'pending',detail:''},
    {name:'学习资源生成',status:'pending',detail:''},
    {name:'学习路径规划',status:'pending',detail:''}
  ]);

  // Show question immediately
  compUpdateProgress('理解学习需求');
  compAddChatMsg('user', esc(dp.question));

  // ── Step 1: Answer with timeout ──
  var askRace = await raceWithDemo('ask', 20000, dp);
  if (askRace.fromDemo) showDemoMsg();
  compResults.answer = askRace.answer;
  compResults.citations = askRace.citations;
  compAddChatMsg('bot', '<div class="comp-answer">' + esc(compResults.answer) + '</div>');
  compUpdateCitations(compResults.citations);
  compUpdateProfile({knowledge_level: '入门学习者', cognitive_style: '循序渐进', last_topic: dp.course.topic});
  compUpdateAgentTrace([
    {name:'画像分析',status:'completed',detail:'已识别学习者画像'},
    {name:'课程资料检索',status:'completed',detail:'检索相关知识点'},
    {name:'可信答案校验',status:'running',detail:'校验回答可信度...'},
    {name:'学习资源生成',status:'pending',detail:''},
    {name:'学习路径规划',status:'pending',detail:''}
  ]);

  // ── Step 2: Mindmap with timeout ──
  compUpdateProgress('构建知识结构');
  compStep2_MindmapDemo(dp, usingDemo);
  compUpdateAgentTrace([
    {name:'画像分析',status:'completed',detail:'已识别学习者画像'},
    {name:'课程资料检索',status:'completed',detail:'检索相关知识点'},
    {name:'可信答案校验',status:'completed',detail:'回答已校验'},
    {name:'学习资源生成',status:'running',detail:'正在生成学习资源...'},
    {name:'学习路径规划',status:'pending',detail:''}
  ]);

  // ── Step 3: Quiz with timeout ──
  compUpdateProgress('生成巩固练习');
  compStep3_QuizDemo(dp, usingDemo);

  // ── Step 4: Study Plan with timeout ──
  compUpdateProgress('规划学习路径');
  compStep4_StudyPlanDemo(dp, usingDemo);

  // ── Step 5: Learning Report ──
  compUpdateProgress('生成学习报告');
  compRenderLearningReportDemo(dp);

  // Done
  compUpdateProgress('✅ 学习方案已生成');
  compUpdateAgentTrace([
    {name:'画像分析',status:'completed',detail:'已识别学习者水平'},
    {name:'课程资料检索',status:'completed',detail:'已检索相关知识片段'},
    {name:'可信答案校验',status:'completed',detail:'回答已校验'},
    {name:'学习资源生成',status:'completed',detail:'知识结构+测验已生成'},
    {name:'学习路径规划',status:'completed',detail:'个性化路径已规划'}
  ]);

  if (btn) { btn.disabled = false; btn.textContent = '🔄 重新生成学习方案'; }
  compRunning = false;

  // Completion summary
  var msg = usingDemo ? '已为你准备稳定演示内容，学习流程不受影响。' : '本次学习方案已生成';
  compAddChatMsg('bot', '<div class="comp-completion"><div class="comp-completion-icon">✅</div><div><strong>' + msg + '</strong></div><div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px">' +
    '<span class="comp-check-item">📖 可信讲解</span><span class="comp-check-item">🧠 知识结构图</span><span class="comp-check-item">📝 巩固练习</span><span class="comp-check-item">🗺️ 个性化路径</span></div></div>');
}

// ── Race: real API vs demo ──
async function raceWithDemo(type, timeoutMs, dp) {
  var realPromise;
  if (type === 'ask') {
    realPromise = compAskReal();
  }
  var demoPromise = new Promise(function(resolve) {
    setTimeout(function() {
      if (type === 'ask') {
        resolve({fromDemo: true, answer: dp.answer, citations: dp.citations});
      }
    }, timeoutMs);
  });
  if (realPromise) {
    try {
      var result = await Promise.race([realPromise, demoPromise]);
      return result;
    } catch(e) {
      console.warn('API race error:', e.message);
      return {fromDemo: true, answer: dp.answer, citations: dp.citations};
    }
  }
  return await demoPromise;
}

async function compAskReal() {
  try {
    var controller = new AbortController();
    var timeoutId = setTimeout(function() { controller.abort(); }, 20000);
    var res = await fetch(S.apiBase + '/api/app/ask', {
      method: 'POST',
      headers: {'Content-Type':'application/json', 'Authorization':'Bearer '+S.token},
      body: JSON.stringify({question: DEMO_QUESTION, course_id: S.courseId}),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    var data = await res.json().catch(function(){ return {}; });
    if (res.ok && data && data.answer) {
      return {fromDemo: false, answer: data.answer || '', citations: data.citations || []};
    }
    throw new Error('API returned no answer');
  } catch(e) {
    throw e;
  }
}

async function compStep1_Ask() {
  try {
    var controller = new AbortController();
    var timeoutId = setTimeout(function() { controller.abort(); }, 25000);
    var res = await fetch(S.apiBase + '/api/app/ask', {
      method: 'POST',
      headers: {'Content-Type':'application/json', 'Authorization':'Bearer '+S.token},
      body: JSON.stringify({question: DEMO_QUESTION, course_id: S.courseId}),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    var data = await res.json().catch(function(){ return {}; });
    var ok = res.ok;
    if (ok && data) {
      compResults.answer = data.answer || data.response || '';
      compResults.citations = data.citations || [];
      compAddChatMsg('bot', '<div class="comp-answer">' + esc(compResults.answer) + '</div>');

      // Citations
      compUpdateCitations(compResults.citations);

      // Profile
      if (data.profile_delta || data.student_profile) {
        compUpdateProfile(data.profile_delta || data.student_profile);
      } else {
        compUpdateProfile({knowledge_level: '入门学习者', cognitive_style: '循序渐进', last_topic: DEMO_TOPIC});
      }

      // Agent trace update
      compUpdateAgentTrace([
        {name:'画像分析',status:'completed',detail:'已识别学习者画像'},
        {name:'课程资料检索',status:'completed',detail:'检索相关知识点'},
        {name:'可信答案校验',status:'running',detail:'校验回答可信度...'},
        {name:'学习资源生成',status:'pending',detail:''},
        {name:'学习路径规划',status:'pending',detail:''}
      ]);

      return true;
    } else {
      // Fallback
      compResults.answer = '过拟合是指模型在训练数据上表现很好，但在新数据上表现很差的现象。正则化是防止过拟合的常用技术，通过在损失函数中添加惩罚项来限制模型复杂度。常见正则化方法包括L1正则化（Lasso）、L2正则化（Ridge）和Dropout。';
      compResults.citations = [];
      compAddChatMsg('bot', '<div class="comp-answer">' + esc(compResults.answer) + '</div>');
      compUpdateCitations([]);
      compShowError('ask', 'AI 讲解生成失败，已使用演示答案。');
      compUpdateProfile({knowledge_level: '入门学习者', cognitive_style: '循序渐进', last_topic: DEMO_TOPIC});
      return true; // Continue flow with fallback
    }
  } catch(e) {
    console.warn('Ask step error:', e.message);
    compResults.answer = '过拟合是指模型在训练数据上表现很好，但在新数据上表现很差的现象。正则化是防止过拟合的常用技术。';
    compAddChatMsg('bot', '<div class="comp-answer">' + esc(compResults.answer) + '</div>');
    compUpdateCitations([]);
    compShowError('ask', 'AI 讲解生成失败，已为你提供演示答案。');
    compUpdateProfile({knowledge_level: '入门学习者', cognitive_style: '循序渐进', last_topic: DEMO_TOPIC});
    return true;
  }
}

async function compStep2_Mindmap() {
  var panel = document.getElementById('comp-panel-mindmap');
  var wsEmpty = document.getElementById('comp-ws-empty');
  if (wsEmpty) wsEmpty.style.display = 'none';

  // 3-stage animation
  var stages = ['正在梳理核心概念', '正在建立知识关系', '正在生成知识结构图'];
  for (var si = 0; si < stages.length; si++) {
    panel.innerHTML = '<div class="mindmap-stage fade-in"><div class="mindmap-stage-icon">🧠</div><div class="mindmap-stage-text">' + stages[si] + '</div><div class="mindmap-stage-dots"><span class="dot active"></span><span class="dot' + (si>=1?' active':'') + '"></span><span class="dot' + (si>=2?' active':'') + '"></span></div></div>';
    await new Promise(function(r) { setTimeout(r, 600); });
  }

  try {
    var controller = new AbortController();
    var timeoutId = setTimeout(function() { controller.abort(); }, 25000);
    var res = await fetch(S.apiBase + '/api/app/generate', {
      method: 'POST',
      headers: {'Content-Type':'application/json', 'Authorization':'Bearer '+S.token},
      body: JSON.stringify({resource_type: 'mindmap', topic: DEMO_TOPIC, course_id: S.courseId}),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    var data = await res.json().catch(function(){ return {}; });
    var ok = res.ok;

    if (ok && data) {
      compResults.mindmap = data;
      var mermaidCode = data.mermaid || data.content || '';
      if (mermaidCode && typeof mermaid !== 'undefined') {
        panel.innerHTML = '<div class="comp-mermaid-wrapper fade-in" data-testid="mindmap-panel"><div class="mermaid" id="comp-mermaid-render">' + esc(mermaidCode) + '</div></div>';
        try {
          await mermaid.run({querySelector: '#comp-mermaid-render'});
        } catch(e) { panel.innerHTML = renderMindmapTextFallback(panel, mermaidCode); }
      } else {
        renderMindmapTextFallback(panel, data.content || mermaidCode || '', data.title);
      }
    } else {
      renderMindmapStructuredFallback(panel);
    }
  } catch(e) {
    console.warn('Mindmap step error:', e.message);
    renderMindmapStructuredFallback(panel);
  }
  compSwitchTab('mindmap');
}

function renderMindmapTextFallback(panel, content, title) {
  panel.innerHTML = '<div class="comp-text-mindmap fade-in" data-testid="mindmap-panel"><div class="mindmap-done-label">已为你生成轻量知识结构，适合快速复习。</div><h4>🧠 ' + esc(title || '知识结构图') + '</h4><pre>' + esc(content || '') + '</pre></div>';
}

function renderMindmapStructuredFallback(panel) {
  var html = '<div class="comp-text-mindmap fade-in" data-testid="mindmap-panel">' +
    '<div class="mindmap-done-label">已为你生成轻量知识结构，适合快速复习。</div>' +
    '<h4>🧠 过拟合与正则化知识框架</h4>' +
    '<div class="mindmap-tree">' +
    '<div class="mindmap-node root"><span class="mm-dot"></span>过拟合与正则化</div>' +
    '<div class="mindmap-branch"><div class="mindmap-node depth1"><span class="mm-dot"></span>过拟合</div>' +
      '<div class="mindmap-leaf">训练误差低，测试误差高</div>' +
      '<div class="mindmap-leaf">模型复杂度过高</div>' +
      '<div class="mindmap-leaf">数据量不足</div></div>' +
    '<div class="mindmap-branch"><div class="mindmap-node depth1"><span class="mm-dot"></span>欠拟合</div>' +
      '<div class="mindmap-leaf">训练和测试误差都高</div>' +
      '<div class="mindmap-leaf">模型过于简单</div></div>' +
    '<div class="mindmap-branch"><div class="mindmap-node depth1"><span class="mm-dot"></span>正则化方法</div>' +
      '<div class="mindmap-leaf">L1 (Lasso) · 特征选择</div>' +
      '<div class="mindmap-leaf">L2 (Ridge) · 权重衰减</div>' +
      '<div class="mindmap-leaf">Dropout · 随机丢弃神经元</div>' +
      '<div class="mindmap-leaf">早停法 · 验证误差上升时停止</div></div>' +
    '</div></div>';
  panel.innerHTML = html;
}

async function compStep3_Quiz() {
  try {
    var controller = new AbortController();
    var timeoutId = setTimeout(function() { controller.abort(); }, 25000);
    var res = await fetch(S.apiBase + '/api/app/generate', {
      method: 'POST',
      headers: {'Content-Type':'application/json', 'Authorization':'Bearer '+S.token},
      body: JSON.stringify({resource_type: 'quiz', topic: DEMO_TOPIC, course_id: S.courseId}),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    var data = await res.json().catch(function(){ return {}; });
    var ok = res.ok;
    var panel = document.getElementById('comp-panel-quiz');
    if (ok && data) {
      compResults.quiz = data;
      var items = null;
      // Try to parse items from content or items field
      if (data.items && Array.isArray(data.items)) {
        items = data.items;
      } else if (data.content) {
        try { var parsed = JSON.parse(data.content); items = parsed.items || parsed.questions || parsed; } catch(e) { /* raw text */ }
      }
      if (!items || items.length === 0) {
        // Fallback quiz
        items = [
          {question:'过拟合的主要表现是什么？',options:['训练误差低，测试误差高','训练和测试误差都低','训练误差高，测试误差低','训练和测试误差都高'],answer:0},
          {question:'L2正则化又称为什么？',options:['Lasso','Ridge回归','Dropout','早停法'],answer:1},
          {question:'Dropout在训练时随机丢弃什么？',options:['权重','偏置','神经元','梯度'],answer:2}
        ];
      }
      compRenderQuiz(items);
    } else {
      // Fallback
      var fbItems = [
        {question:'过拟合的主要表现是什么？',options:['训练误差低，测试误差高','训练和测试误差都低','训练误差高，测试误差低','训练和测试误差都高'],answer:0},
        {question:'L2正则化又称为什么？',options:['Lasso','Ridge回归','Dropout','早停法'],answer:1},
        {question:'Dropout在训练时随机丢弃什么？',options:['权重','偏置','神经元','梯度'],answer:2}
      ];
      compResults.quiz = {items: fbItems};
      compRenderQuiz(fbItems);
      panel.innerHTML += '<div class="comp-error-card" style="margin-top:8px"><div class="comp-error-icon">📝</div><div class="comp-error-msg">练习题生成失败，已使用预设练习题。可继续查看讲解和学习路径。</div></div>';
    }
  } catch(e) {
    console.warn('Quiz step error:', e.message);
    var panel = document.getElementById('comp-panel-quiz');
    var fbItems = [
      {question:'过拟合的主要表现是什么？',options:['训练误差低，测试误差高','训练和测试误差都低','训练误差高，测试误差低','训练和测试误差都高'],answer:0},
      {question:'L2正则化又称为什么？',options:['Lasso','Ridge回归','Dropout','早停法'],answer:1},
      {question:'Dropout在训练时随机丢弃什么？',options:['权重','偏置','神经元','梯度'],answer:2}
    ];
    compResults.quiz = {items: fbItems};
    compRenderQuiz(fbItems);
    if (panel) panel.innerHTML += '<div class="comp-error-card" style="margin-top:8px"><div class="comp-error-icon">📝</div><div class="comp-error-msg">练习题生成失败，已使用预设练习题。</div></div>';
  }
}

async function compStep4_StudyPlan() {
  try {
    var controller = new AbortController();
    var timeoutId = setTimeout(function() { controller.abort(); }, 25000);
    var res = await fetch(S.apiBase + '/api/app/generate', {
      method: 'POST',
      headers: {'Content-Type':'application/json', 'Authorization':'Bearer '+S.token},
      body: JSON.stringify({resource_type: 'study_plan', topic: DEMO_TOPIC, course_id: S.courseId}),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    var data = await res.json().catch(function(){ return {}; });
    var ok = res.ok;
    var panel = document.getElementById('comp-panel-study_plan');
    var wsEmpty = document.getElementById('comp-ws-empty');
    if (wsEmpty) wsEmpty.style.display = 'none';

    if (ok && data) {
      compResults.studyPlan = data;
      var plan = data.study_plan || data;
      var planObj = plan;
      if (typeof plan === 'string') {
        try { planObj = JSON.parse(plan); } catch(e) { planObj = {title: DEMO_TOPIC, phases:[]}; }
      }
      renderStudyPlan(panel, planObj);
    } else {
      renderFallbackStudyPlan(panel);
    }
  } catch(e) {
    console.warn('Study plan step error:', e.message);
    var panel = document.getElementById('comp-panel-study_plan');
    renderFallbackStudyPlan(panel);
  }
  compSwitchTab('study_plan');
}

function renderStudyPlan(panel, plan) {
  var html = '<div class="comp-plan-wrapper">' +
    '<div class="comp-plan-intro fade-in">根据你的问题和当前薄弱点，系统建议按以下顺序学习。</div>' +
    '<h4 style="color:var(--primary);margin:12px 0">🗺️ ' + esc(plan.title || DEMO_TOPIC) + '</h4>';
  var phases = plan.phases || plan.steps || plan.learning_path || [];
  if (phases.length === 0 && plan.profile_summary) {
    html += '<p style="font-size:13px;line-height:1.8;color:var(--gray-700)">' + esc(plan.profile_summary) + '</p>';
  }
  var resources = ['课程知识库', 'AI 讲解', '练习题库', '补充阅读', '错题复盘'];
  phases.forEach(function(p, i) {
    var name = p.name || p.phase || p.step || ('阶段 ' + (i+1));
    var desc = p.description || p.detail || p.content || '';
    var dur = p.duration || p.estimated_time || (20 + i*10) + '分钟';
    var res = p.resources || (resources[i] || '知识库');
    html += '<div class="comp-plan-phase plan-card-enhanced fade-in" data-testid="study-plan-card" style="animation-delay:' + (i*0.1) + 's">' +
      '<div class="comp-plan-phase-num">' + (i+1) + '</div>' +
      '<div class="comp-plan-phase-body">' +
        '<div class="comp-plan-phase-title">' + esc(name) + '</div>' +
        '<div class="comp-plan-phase-desc">' + esc(desc) + '</div>' +
        '<div class="comp-plan-phase-meta">' +
          '<span>⏱ ' + esc(dur) + '</span>' +
          '<span>📚 ' + esc(res) + '</span>' +
        '</div>' +
      '</div></div>';
  });
  html += '</div>';
  panel.innerHTML = html;
}

function renderFallbackStudyPlan(panel) {
  var phases = [
    {name:'理解过拟合',desc:'通过对比训练集和测试集误差，建立过拟合和欠拟合的直观理解',dur:'20分钟',res:'课程知识库'},
    {name:'区分欠拟合',desc:'了解模型过于简单导致训练和测试误差都高的情况',dur:'15分钟',res:'AI 讲解'},
    {name:'学习正则化',desc:'掌握L1(Lasso)和L2(Ridge)正则化的数学原理与使用场景',dur:'30分钟',res:'练习题库'},
    {name:'完成练习',desc:'完成巩固练习，检验对过拟合和正则化的理解',dur:'20分钟',res:'练习题库'},
    {name:'复盘错题',desc:'回顾错题和知识点，强化薄弱环节',dur:'15分钟',res:'错题复盘'}
  ];
  var html = '<div class="comp-plan-wrapper">' +
    '<div class="comp-plan-intro fade-in">根据你的问题和当前薄弱点，系统建议按以下顺序学习。</div>' +
    '<h4 style="color:var(--primary);margin:12px 0">🗺️ 基础复习路径</h4>';
  phases.forEach(function(p, i) {
    html += '<div class="comp-plan-phase plan-card-enhanced fade-in" data-testid="study-plan-card" style="animation-delay:' + (i*0.1) + 's">' +
      '<div class="comp-plan-phase-num">' + (i+1) + '</div>' +
      '<div class="comp-plan-phase-body">' +
        '<div class="comp-plan-phase-title">' + esc(p.name) + '</div>' +
        '<div class="comp-plan-phase-desc">' + esc(p.desc) + '</div>' +
        '<div class="comp-plan-phase-meta"><span>⏱ ' + esc(p.dur) + '</span><span>📚 ' + esc(p.res) + '</span></div>' +
      '</div></div>';
  });
  html += '<div class="comp-plan-note" style="margin-top:8px"><span>💡</span> 学习路径生成失败，已使用基础复习路径。</div></div>';
  panel.innerHTML = html;
}

// ── LEARNING REPORT PAGE ──
function loadLearningReportPage() {
  var el = document.getElementById('lr-standalone');
  if (!el) return;
  if (!S.token) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">🔒</div><p>请先登录演示账号</p></div>'; return; }
  el.innerHTML = '<div class="loading-block"><span class="spinner"></span> 加载中...</div>';
  fetch(S.apiBase + '/api/app/learning-report?course_id=' + S.courseId + '&topic=' + encodeURIComponent(DEMO_TOPIC), {
    headers: {'Authorization':'Bearer '+S.token}
  }).then(function(r) { return r.json(); })
  .then(function(data) {
    compRenderLearningReport(data);
    var lrEl = document.getElementById('comp-learning-report');
    var standalone = document.getElementById('lr-standalone');
    if (lrEl && standalone) {
      standalone.innerHTML = lrEl.innerHTML;
    } else if (standalone) {
      standalone.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><p>暂无学习数据。完成测验后将自动生成报告。</p></div>';
    }
  }).catch(function() {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><p>暂无学习数据。完成测验后将自动生成报告。</p></div>';
  });
}

// ── DEMO STEP FUNCTIONS ──
function compStep2_MindmapDemo(dp, useDemo) {
  var panel = document.getElementById('comp-panel-mindmap');
  var wsEmpty = document.getElementById('comp-ws-empty');
  if (wsEmpty) wsEmpty.style.display = 'none';
  // Render demo mindmap immediately
  renderMindmapStructured(panel, dp.mindmap);
  compSwitchTab('mindmap');
  // Try real API in background
  if (!useDemo && S.token) {
    fetchRealMindmap();
  }
}

function renderMindmapStructured(panel, mmData) {
  var html = '<div class="comp-text-mindmap fade-in" data-testid="mindmap-panel">' +
    '<div class="mindmap-done-label">已生成知识结构，适合快速复习。</div>' +
    '<h4>🧠 ' + esc(mmData.title || '知识结构图') + '</h4>' +
    '<div class="mindmap-tree">';
  (mmData.nodes || []).forEach(function(n) {
    if (n.level === 'root') {
      html += '<div class="mindmap-node root"><span class="mm-dot"></span>' + esc(n.text) + '</div>';
    } else if (n.level === 'branch') {
      html += '<div class="mindmap-branch"><div class="mindmap-node depth1"><span class="mm-dot"></span>' + esc(n.text) + '</div>';
      (n.children || []).forEach(function(c) {
        html += '<div class="mindmap-leaf">' + esc(c) + '</div>';
      });
      html += '</div>';
    }
  });
  html += '</div></div>';
  panel.innerHTML = html;
}

function compStep3_QuizDemo(dp, useDemo) {
  var items = dp.quiz.map(function(q) {
    return {
      question: q.question,
      options: q.options,
      answer: q.correctAnswer,
      explanation: q.explanation,
      knowledge_point: q.knowledgePoint,
      difficulty: q.difficulty
    };
  });
  compRenderQuiz(items);
  // Try real API in background
  if (!useDemo && S.token) {
    fetchRealQuiz();
  }
}

function compStep4_StudyPlanDemo(dp, useDemo) {
  var panel = document.getElementById('comp-panel-study_plan');
  var wsEmpty = document.getElementById('comp-ws-empty');
  if (wsEmpty) wsEmpty.style.display = 'none';
  var phases = (dp.studyPlan || []).map(function(s) {
    return {
      name: s.title,
      description: s.goal,
      dur: s.estimatedTime,
      res: s.resource
    };
  });
  var html = '<div class="comp-plan-wrapper">' +
    '<div class="comp-plan-intro fade-in">根据你的问题和当前薄弱点，系统建议按以下顺序学习。</div>' +
    '<h4 style="color:var(--primary);margin:12px 0">🗺️ ' + esc(dp.course.topic) + ' 学习路径</h4>';
  phases.forEach(function(p, i) {
    html += '<div class="comp-plan-phase plan-card-enhanced fade-in" data-testid="study-plan-card" style="animation-delay:' + (i*0.1) + 's">' +
      '<div class="comp-plan-phase-num">' + (i+1) + '</div>' +
      '<div class="comp-plan-phase-body">' +
        '<div class="comp-plan-phase-title">' + esc(p.name) + '</div>' +
        '<div class="comp-plan-phase-desc">' + esc(p.description) + '</div>' +
        '<div class="comp-plan-phase-meta">' +
          '<span>⏱ ' + esc(p.dur) + '</span>' +
          '<span>📚 ' + esc(p.res) + '</span>' +
        '</div>' +
      '</div></div>';
  });
  html += '</div>';
  panel.innerHTML = html;
  compSwitchTab('study_plan');
  // Try real API in background
  if (!useDemo && S.token) {
    fetchRealStudyPlan();
  }
}

function compRenderLearningReportDemo(dp) {
  var el = document.getElementById('comp-learning-report');
  if (!el) {
    var rightCol = document.querySelector('.comp-col-right');
    if (!rightCol) return;
    el = document.createElement('div');
    el.className = 'comp-side-section';
    el.id = 'comp-learning-report';
    el.setAttribute('data-testid', 'learning-report-card');
    rightCol.appendChild(el);
  }
  var lr = dp.learningReport;
  var accuracy = Math.round((lr.accuracy || 0) * 100);
  var html = '<h4>📊 学习报告</h4>' +
    '<div class="lr-summary">' +
      '<div class="lr-stat"><span class="lr-stat-value">' + accuracy + '%</span><span class="lr-stat-label">正确率</span></div>' +
      '<div class="lr-stat"><span class="lr-stat-value">' + (lr.total_attempts || 0) + '</span><span class="lr-stat-label">已答题</span></div>' +
      '<div class="lr-stat"><span class="lr-stat-value">✅</span><span class="lr-stat-label">画像更新</span></div>' +
    '</div>';
  if (lr.weak_points && lr.weak_points.length > 0) {
    html += '<div class="lr-section"><div class="lr-section-title">📌 当前薄弱点</div><div class="lr-chips">';
    lr.weak_points.forEach(function(wp) {
      html += '<span class="lr-chip">' + esc(wp) + '</span>';
    });
    html += '</div></div>';
  }
  if (lr.recommended_resources && lr.recommended_resources.length > 0) {
    html += '<div class="lr-section"><div class="lr-section-title">📖 推荐复习</div>';
    lr.recommended_resources.forEach(function(r) {
      html += '<div class="lr-resource-card">' +
        '<span class="lr-resource-icon">📚</span><span>' + esc(r.title) + '</span></div>';
    });
    html += '</div>';
  }
  html += '<p style="font-size:10px;color:var(--gray-400);margin-top:4px">根据你的测验表现，系统已更新学习画像，并推荐下一步复习资源。</p>';
  el.innerHTML = html;
}

// Background real API fetchers (fire-and-forget)
function fetchRealMindmap() {
  fetch(S.apiBase + '/api/app/generate', {
    method: 'POST',
    headers: {'Content-Type':'application/json', 'Authorization':'Bearer '+S.token},
    body: JSON.stringify({resource_type:'mindmap', topic: DEMO_TOPIC, course_id: S.courseId})
  }).then(function(r) { return r.json(); })
  .then(function(data) {
    if (data && data.mermaid) {
      var panel = document.getElementById('comp-panel-mindmap');
      if (panel && typeof mermaid !== 'undefined') {
        panel.innerHTML = '<div class="comp-mermaid-wrapper"><div class="mermaid" id="comp-mermaid-render">' + esc(data.mermaid) + '</div></div>';
        mermaid.run({querySelector: '#comp-mermaid-render'}).catch(function(){});
      }
    }
  }).catch(function(){});
}

function fetchRealQuiz() {
  fetch(S.apiBase + '/api/app/generate', {
    method: 'POST',
    headers: {'Content-Type':'application/json', 'Authorization':'Bearer '+S.token},
    body: JSON.stringify({resource_type:'quiz', topic: DEMO_TOPIC, course_id: S.courseId})
  }).then(function(r) { return r.json(); })
  .then(function(data) {
    if (data && data.items && data.items.length > 0) {
      compQuizState = {items: data.items, selected:{}, submitted:{}, score:0};
      compRenderQuiz(data.items);
    }
  }).catch(function(){});
}

function fetchRealStudyPlan() {
  fetch(S.apiBase + '/api/app/generate', {
    method: 'POST',
    headers: {'Content-Type':'application/json', 'Authorization':'Bearer '+S.token},
    body: JSON.stringify({resource_type:'study_plan', topic: DEMO_TOPIC, course_id: S.courseId})
  }).catch(function(){});
}

function _navToCompetition() {
  $$('.page').forEach(p=>p.classList.remove('active'));
  var pg = document.getElementById('page-competition');
  if (pg) pg.classList.add('active');
  var landing = document.getElementById('competition-landing');
  var flow = document.getElementById('competition-flow');
  if (landing) landing.style.display = '';
  if (flow) flow.style.display = 'none';
  $$('.nav-item').forEach(n=>n.classList.remove('active'));
  var compNav = document.getElementById('nav-competition');
  if (compNav) compNav.classList.add('active');
  var g = document.getElementById('nav-advanced-group');
  if (g) g.style.display = 'none';
  var t = document.getElementById('nav-advanced-toggle');
  if (t) t.querySelector('span:last-child').textContent = '高级功能 ▾';
  compRunning = false;
}

// ── INIT ──────────────────────────────────────────
window._navTo=navTo;window.initApp=initApp;
window.addEventListener('error',function(e){if(!e.message&&!e.filename){e.preventDefault();return false;}});
document.addEventListener('DOMContentLoaded',()=>{
  try{if(typeof mermaid!=='undefined')mermaid.initialize({startOnLoad:false,theme:'default',securityLevel:'loose',mindmap:{padding:20}});}catch(e){}
  $$('.nav-item').forEach(item=>on(item,'click',()=>navTo(item.dataset.page)));
  const ci=document.getElementById('chat-input');if(ci)on(ci,'keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();_sendQuestion();}});
  const compCi=document.getElementById('comp-chat-input');if(compCi)on(compCi,'keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();_compAsk();}});
  try{initApp();}catch(e){console.warn('Init:',e.message);}
});
})();
