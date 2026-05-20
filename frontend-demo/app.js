/**
 * 智学·多智能体 — 学习工作台 Application Logic v3
 * R2.1: Artifacts产品化 — 思维导图重构、源码折叠、缩放、引用卡片、Agent过程、回答折叠
 */
(function(){
'use strict';

const S = {
  apiBase: 'http://127.0.0.1:8000',
  token: localStorage.getItem('hermes_token') || '',
  user: null, courseId: 2, courseName: '高等数学上',
  courses: [], profile: null, sidebarCollapsed: false,
  kbReady: false, kbChunks: 16,
  demoResults: null, genCache: {}, zoomScale: 1, zoomPanX: 0, zoomPanY: 0,
  lastQuestion: '', lastAnswerTopic: '导数与极限入门'
};

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
}

function updateTopbar(){
  const u=$('#topbar-user'),c=$('#topbar-course'),b=$('#topbar-badge'),sf=$('#sidebar-footer'),lo=$('#btn-logout');
  if(S.user){u.innerHTML='<span class="topbar-avatar">'+(S.user.username||'?')[0].toUpperCase()+'</span><span>'+esc(S.user.username||'')+'</span>';u.style.display='flex';if(lo)lo.style.display='inline-flex';}
  else{u.innerHTML='<button class="btn btn-sm btn-primary" onclick="_loginDemo()">演示登录</button>';u.style.display='flex';if(lo)lo.style.display='none';}
  if(c)c.textContent=S.courseName||'未选择';
  if(b){b.className='topbar-badge '+(S.kbReady?'ok':'warn');b.textContent=S.kbReady?'知识库已就绪':'课程资料不足';}
  if(sf)sf.innerHTML=S.token?'<span class="status-dot online"></span> API 正常':'<span class="status-dot offline"></span> 未连接';
}

window._toggleSidebar=function(){S.sidebarCollapsed=!S.sidebarCollapsed;const sb=document.getElementById('sidebar');sb.classList.toggle('collapsed',S.sidebarCollapsed);};

// ════════════ BOOTSTRAP ════════════
async function initApp(){
  try{
    const{ok,data}=await api('/api/app/bootstrap');
    if(!ok){showWelcome();return;}
    S.courses=data.courses||[];
    if(data.selected_course&&data.selected_course.id){S.courseId=data.selected_course.id;S.courseName=data.selected_course.name||'未选择';S.kbChunks=data.selected_course.chunks_count||0;S.kbReady=data.selected_course.has_knowledge_base||false;}
    if(data.user&&data.user.authenticated)S.user=data.user;
    const isAuth = data.user && data.user.authenticated;
    if(!isAuth){setToken('');S.user=null;showWelcome();return;}
    if(!data.config.deepseek_configured){navTo('settings');toast('请先配置 AI 模型 Key','info');return;}
    navTo('assistant');
    updateTopbar();
  }catch(e){console.warn('Bootstrap:',e.message);showWelcome();}
}

function showWelcome(){
  $$('.page').forEach(p=>p.classList.remove('active'));
  let w=document.getElementById('page-welcome');
  if(!w){
    w=document.createElement('main');w.id='page-welcome';w.className='page-content page active';
    w.innerHTML='<div style="max-width:600px;margin:60px auto;text-align:center">'+
      '<div style="font-size:48px;margin-bottom:16px">🎓</div>'+
      '<h2 style="font-size:22px;font-weight:700;margin-bottom:8px">智学 · 多智能体学习工作台</h2>'+
      '<p style="font-size:14px;color:var(--gray-500);margin-bottom:24px;line-height:1.8">基于课程资料、学生画像和多智能体协同<br>为你生成 问答、讲义、思维导图、测验、PPT 与学习路径</p>'+
      '<div style="display:flex;justify-content:center;gap:20px;margin-bottom:28px;font-size:12px;color:var(--gray-500)">'+
        '<div style="text-align:center"><div style="font-size:20px;margin-bottom:4px">🔌</div>连接 AI 模型</div>'+
        '<div style="text-align:center"><div style="font-size:20px;margin-bottom:4px">👤</div>进入演示账号</div>'+
        '<div style="text-align:center"><div style="font-size:20px;margin-bottom:4px">📚</div>选择课程资料</div>'+
        '<div style="text-align:center"><div style="font-size:20px;margin-bottom:4px">🚀</div>开始个性化学习</div>'+
      '</div>'+
      '<button class="btn btn-lg btn-primary" id="btn-welcome-demo" style="font-size:15px;padding:12px 32px" onclick="_loginDemo()">🎯 进入演示学习环境</button>'+
      '<div style="margin-top:12px"><button class="btn btn-outline btn-sm" onclick="navTo(\'settings\')">⚙️ 配置 API Key</button></div>'+
      '<p style="font-size:11px;color:var(--gray-400);margin-top:16px">演示账号自动准备课程、画像和知识库 · 无需注册</p>'+
    '</div>';
    document.querySelector('.main-area').appendChild(w);
  }
  w.classList.add('active');
  updateTopbar();
}

async function initDemo(){
  try{
    const{ok,data}=await api('/api/app/demo-init',{method:'POST'});
    if(ok&&data.token){setToken(data.token);S.user=data.user;S.courseId=data.course?data.course.id:2;S.courseName=data.course?data.course.name:'高等数学上';S.kbReady=data.course?data.course.has_knowledge_base:false;S.kbChunks=data.course?data.course.chunks_count:0;
      try{const{ok:o2,data:d2}=await api('/api/app/bootstrap');if(o2&&d2.courses)S.courses=d2.courses;}catch(e){}
      if(data.course&&!S.courses.length)S.courses=[{id:data.course.id,name:data.course.name,chunks_count:data.course.chunks_count||0,has_knowledge_base:data.course.has_knowledge_base||false}];
      updateTopbar();
      if(data.course&&data.course.recommended_for_demo)toast('演示就绪（'+esc(data.course.name)+', '+data.course.chunks_count+' 知识点）','success');
      else if(data.message)toast(data.message,'info');else toast('演示已就绪','success');
      return true;}
    return false;
  }catch(e){console.warn('Demo init:',e.message);return false;}
}

window._loginDemo=async function(){if(await initDemo()){navTo('assistant');}};
window._logout=function(){setToken('');S.user=null;S.profile=null;S.courses=[];S.kbReady=false;S.demoResults=null;updateTopbar();navTo('settings');toast('已退出','info');};

// ════════════ PAGE: DASHBOARD ════════════
async function loadDashboard(){
  const el=document.getElementById('page-dashboard');
  el.innerHTML='<div class="loading-block"><span class="spinner"></span> 加载...</div>';
  try{
    const{ok,data}=await api('/api/app/dashboard?course_id='+S.courseId);
    if(!ok){el.innerHTML='<div class="empty-state"><div class="empty-icon">⚠</div><p>加载失败</p></div>';return;}
    const d=data,kb=d.knowledge_base||{},pf=d.profile||{};
    let h='<div class="grid grid-3">';
    h+='<div class="card grid-stat"><div class="val" style="color:var(--success)">✓</div><div class="lbl">AI模型已连接</div></div>';
    h+='<div class="card grid-stat"><div class="val">'+(kb.chunks_count||0)+'</div><div class="lbl">课程知识点</div></div>';
    h+='<div class="card grid-stat"><div class="val">'+(pf?'✓':'—')+'</div><div class="lbl">学习画像</div></div></div>';
    if(d.course)h+='<div class="card"><div class="card-header"><h3>当前课程</h3></div><p style="font-size:15px;font-weight:700">'+esc(d.course.name)+'</p><p style="font-size:12px;color:var(--gray-500)">'+esc(d.course.description||'')+'</p><div style="display:flex;gap:20px;margin-top:8px;font-size:12px;color:var(--gray-500)"><span>知识点: '+(kb.chunks_count||0)+'</span><span>资料检索: '+(kb.vector_ready?'已就绪':'未构建')+'</span></div></div>';
    if(d.suggested_actions&&d.suggested_actions.length){h+='<div class="card"><div class="card-header"><h3>建议操作</h3></div>';d.suggested_actions.forEach(a=>{h+='<button class="btn btn-outline btn-sm" style="margin:4px" onclick="navTo(\''+(a.action==='start_qa'?'assistant':a.action==='configure_key'?'settings':a.action==='upload_materials'?'courses':'dashboard')+'\')">'+esc(a.label)+'</button>';});h+='</div>';}
    if(pf&&pf.knowledge_level)h+='<div class="card"><div class="card-header"><h3>学习画像</h3></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px"><div><b>知识水平:</b> '+esc(pf.knowledge_level||'—')+'</div><div><b>认知风格:</b> '+esc(pf.cognitive_style||'—')+'</div><div><b>学习节奏:</b> '+esc(pf.pace_preference||'—')+'</div><div><b>专业:</b> '+esc(pf.major||'—')+'</div></div></div>';
    h+='<div class="card"><div class="card-header"><h3>快捷操作</h3></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" onclick="navTo(\'assistant\')">💬 开始学习</button><button class="btn btn-secondary" onclick="navTo(\'generator\')">⚡ 生成资源</button><button class="btn btn-outline" onclick="_runFullDemo()">🎯 一键演示</button></div></div>';
    el.innerHTML=h;
  }catch(e){el.innerHTML='<div class="empty-state"><div class="empty-icon">⚠</div><p>加载失败: '+esc(e.message)+'</p></div>';}
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
    msgs.innerHTML='<div class="msg-bubble agent"><div class="msg-content"><b>你好！我是你的 AI 学习助手。</b><br><br>📚 <b>当前课程：</b>'+esc(S.courseName)+'<br>📊 <b>资料状态：</b>课程资料已就绪，'+S.kbChunks+' 个课程知识点<br>🧠 <b>推荐操作：</b>先问一个问题，或直接生成复习资料<br><br>可以帮你：<br>• 解释概念和答疑<br>• 生成思维导图、测验题、讲义<br>• 规划个性化学习路径<br><br><b>试试直接点击下方问题：</b></div></div>';
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
  if(cp)cp.innerHTML='<div class="cite-section"><h4>📚 文献溯源</h4><div class="cite-empty">提问后将在这里展示课程资料引用</div></div><div class="cite-section"><h4>🤖 多智能体协作</h4><div class="agent-trace-grid" id="agent-trace">'+buildAgentTrace([{agent:'AI学习助手',status:'completed'},{agent:'资料检索',status:'completed'},{agent:'内容校验',status:'pending'},{agent:'资源生成',status:'pending'}])+'</div></div><div class="cite-section" id="profile-mini-section"><h4>🎓 学习画像</h4><div id="profile-mini" style="font-size:11px;color:var(--gray-400)">加载中...</div></div>';
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
    DEFAULT_QUIZ.map((it,i)=>'<div class="quiz-item" style="cursor:pointer" onclick="this.classList.toggle(\'expanded\')"><div class="q-text">Q'+(i+1)+'. '+esc(it.question)+' <span style="font-size:10px;color:var(--gray-400)">'+(it.difficulty||'')+'</span> <span style="font-size:10px;background:var(--primary-bg);padding:1px 6px;border-radius:4px">'+(it.tags||[]).join(',')+'</span></div>'+
    it.options.map((o,j)=>
      '<div class="q-option'+(j===it.answer?' correct':'')+'" style="display:'+(j===it.answer?'block':'none')+'">'+String.fromCharCode(65+j)+'. '+esc(o)+' ✓</div>'
    ).join('')+
    '<div class="q-explanation" style="display:none">💡 '+esc(it.explanation||'')+'</div></div>').join('')+
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
  animateAgentAsk();
  msgs.scrollTop=msgs.scrollHeight;
  


window._sendQuestion=async function(){
  const input=document.getElementById('chat-input');const q=input.value.trim();
  if(!q)return;
  input.value='';
  await _askQuestion(q);
};
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
      if(data.citations&&data.citations.length){
        // Don't show citations inline, they go in the right panel
        renderCitations(data.citations);
        updateAgentTrace(true, data.citations.length);
      } else {
        updateAgentTrace(true, 0);
      }
      msgs.innerHTML+=html;
    }else{
      const errDetail = data.detail || '请求失败';
      msgs.innerHTML+='<div class="msg-bubble agent"><div class="msg-content">'+
        '<div class="error-card"><div class="err-title">⚠ 操作失败</div>'+
        '<div class="err-detail">'+esc(errDetail)+'</div>'+
        '<div class="err-suggestion">建议：检查网络连接后重试，或尝试其他问题</div>'+
        '<div class="err-actions"><button class="btn btn-sm btn-primary" onclick="_sendQuestion()">🔄 重试</button></div></div></div></div>';
    }
  }catch(e){
    const le=document.getElementById(lid);if(le)le.remove();
    msgs.innerHTML+='<div class="msg-bubble agent"><div class="msg-content">'+
      '<div class="error-card"><div class="err-title">⚠ 操作失败</div>'+
      '<div class="err-detail">无法连接到学习服务</div>'+
      '<div class="err-suggestion">建议：检查后端服务是否正在运行，然后重试</div>'+
      '<div class="err-actions"><button class="btn btn-sm btn-primary" onclick="_sendQuestion()">🔄 重试</button></div></div></div></div>';
  }
  msgs.scrollTop=msgs.scrollHeight;
};

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
    data.items.map((it,i)=>'<div class="quiz-item" onclick="this.classList.toggle(\'expanded\');const ex=this.querySelector(\'.q-explanation\');if(ex)ex.style.display=ex.style.display===\'none\'?\'block\':\'none\';const ops=this.querySelectorAll(\'.q-option\');ops.forEach(o=>o.style.display=o.style.display===\'none\'?\'block\':\'none\')"><div class="q-text">Q'+(i+1)+'. '+esc(it.question)+' '+(it.difficulty?'<span style="font-size:10px;color:var(--gray-400)">'+(it.difficulty==='basic'?'基础':it.difficulty==='intermediate'?'进阶':'挑战')+'</span>':'')+'</div>'+
    it.options.map((o,j)=>
      '<div class="q-option'+(j===it.answer?' correct':'')+'" style="display:none">'+String.fromCharCode(65+j)+'. '+esc(o)+(j===it.answer?' ✓':'')+'</div>'
    ).join('')+
    '<div class="q-explanation" style="display:none">💡 '+esc(it.explanation||'')+'</div></div>').join('')+'</div>';
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
    panel.innerHTML='<div class="cite-section"><h4>📚 文献溯源</h4><div class="cite-empty">当前回答暂无课程引用<br><span style="font-size:10px;color:var(--gray-400)">请先构建课程资料库或换一个问题</span></div></div><div class="cite-section" id="agent-section"></div><div class="cite-section" id="profile-section"></div>';
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
  panel.innerHTML='<div class="cite-section"><h4>📚 文献溯源</h4><div class="cite-card-grid">'+cards+'</div></div><div class="cite-section" id="agent-section"></div><div class="cite-section" id="profile-section"></div>';
  // Preserve agent and profile sections
  const agSec = document.getElementById('agent-section');
  if (agSec) agSec.innerHTML = '<h4>🤖 多智能体协作</h4><div class="agent-trace-grid" id="agent-trace">'+buildAgentTrace([{agent:'AI学习助手',status:'completed'},{agent:'资料检索',status:'completed',detail:cits.length+' 条引用'},{agent:'内容校验',status:'completed'},{agent:'资源生成',status:'pending'}])+'</div>';
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
  const resources=[{id:'lecture_doc',icon:'📄',name:'讲义文档',desc:'个性化AI讲义'},{id:'mindmap',icon:'🧠',name:'思维导图',desc:'概念关系可视化'},{id:'quiz',icon:'📝',name:'自适应测验',desc:'知识点自测'},{id:'ppt',icon:'📊',name:'PPT课件',desc:'可下载PPTX'},{id:'study_plan',icon:'🗺️',name:'学习路径',desc:'个性化学习计划'},{id:'video',icon:'🎬',name:'数字人视频',desc:'待开发',beta:true}];
  h+='<div class="resource-cards">';resources.forEach(r=>{h+='<div class="res-card" id="rcard-'+r.id+'" onclick="'+(r.beta?'':'_genSingle(\''+r.id+'\')')+'"><div class="res-icon">'+r.icon+'</div><div class="res-name">'+r.name+'</div><div class="res-desc">'+r.desc+'</div><span class="res-status ready" id="rstatus-'+r.id+'">'+(r.beta?'待开发':'可生成')+'</span></div>';});h+='</div>';
  h+='<div class="card" id="gen-progress-card" style="display:none"><div class="card-header"><h3>⚙️ 生成进度</h3></div><div class="progress-steps" id="gen-progress-steps"><div class="progress-step" id="gstep-0">分析画像</div><div class="progress-step" id="gstep-1">检索知识</div><div class="progress-step" id="gstep-2">生成路径</div><div class="progress-step" id="gstep-3">生成导图</div><div class="progress-step" id="gstep-4">生成测验</div><div class="progress-step" id="gstep-5">生成讲义</div><div class="progress-step" id="gstep-6">生成PPT</div></div></div>';
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
  for(let i=0;i<types.length;i++){
    const gs=document.getElementById('gstep-'+(i+2));if(gs){gs.className='progress-step active';gs.textContent='⏳ '+['生成路径','生成导图','生成测验','生成讲义','生成PPT'][i];}
    if(i===0){document.getElementById('gstep-0')&&(document.getElementById('gstep-0').className='progress-step done');document.getElementById('gstep-1')&&(document.getElementById('gstep-1').className='progress-step done');}
    await _genSingle(types[i]);
    if(gs){gs.className='progress-step done';gs.textContent='✅ '+['生成路径','生成导图','生成测验','生成讲义','生成PPT'][i];}
  }
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
  }catch(e){el.innerHTML='<div class="empty-state"><div class="empty-icon">⚠</div><p>加载失败: '+esc(e.message)+'</p></div>';}
}

window._selectCourse=function(id,name,chunks,hasKB){S.courseId=id;S.courseName=name;S.kbChunks=chunks||0;S.kbReady=!!hasKB;updateTopbar();loadCourses();toast(hasKB?'已选择: '+name+'（'+chunks+' 知识点）':'已选择: '+name+'（暂无课程资料）',hasKB?'success':'info');};
window._createCourse=async function(){const name=document.getElementById('new-course-name')?.value.trim();if(!name){toast('请输入课程名称','error');return;}const desc=document.getElementById('new-course-desc')?.value.trim()||'';try{const{ok,data}=await api('/api/courses',{method:'POST',body:JSON.stringify({name,description:desc})});if(ok){S.courseId=data.id;S.courseName=data.name;updateTopbar();loadCourses();toast('课程创建成功','success');}else toast('创建失败','error');}catch(e){toast('创建失败','error');}};

// ════════════ PAGE: KNOWLEDGE BASE ════════════
function loadKnowledgeBase(){
  const el=document.getElementById('page-knowledge');
  el.innerHTML='<div class="card"><div class="card-header"><h3>📚 知识库状态</h3></div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;text-align:center"><div class="grid-stat"><div class="val">'+(S.kbChunks||0)+'</div><div class="lbl">课程知识点</div></div><div class="grid-stat"><div class="val">'+(S.kbReady?'就绪':'未构建')+'</div><div class="lbl">资料检索</div></div><div class="grid-stat"><div class="val">—</div><div class="lbl">扫描资料</div></div></div><div style="margin-top:12px;font-size:12px;color:var(--gray-500)"><p>当前课程: '+esc(S.courseName)+'</p><p>⚠ 扫描版PDF需安装Tesseract OCR，文字型PDF可自动解析</p></div></div><div class="card"><div class="card-header"><h3>🔍 课程资料检索测试</h3></div><div style="display:flex;gap:8px;margin-bottom:8px"><input id="rag-query" placeholder="输入关键词: 导数、极限..." style="flex:1;padding:8px;border:1px solid var(--gray-300);border-radius:6px;font-size:13px"><button class="btn btn-primary" onclick="_ragSearch()">检索</button></div><div id="rag-results"><div class="empty-state" style="padding:20px"><p style="font-size:12px;color:var(--gray-400)">输入关键词测试知识库检索</p></div></div></div>';
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
  el.innerHTML='<div class="card"><div class="card-header"><h3>⚙️ API Key 配置</h3></div><div class="form-group"><label>API Key</label><input id="settings-key" type="password" placeholder="sk-..."><div class="form-hint">Key 仅保存在后端，不上传云端</div></div><div style="display:flex;gap:8px"><button class="btn btn-primary" onclick="_saveSettings()">💾 保存</button><button class="btn btn-outline" onclick="_testConnection()">🔌 测试连接</button></div><div id="settings-status" style="margin-top:8px;font-size:12px"></div><div style="margin-top:12px"><button class="btn btn-sm btn-outline" onclick="document.getElementById(\'settings-advanced\').style.display=document.getElementById(\'settings-advanced\').style.display===\'none\'?\'block\':\'none\'">⚙️ 高级设置</button></div><div id="settings-advanced" style="display:none;margin-top:8px"><div class="form-group"><label>API Base URL</label><input id="settings-base" value="https://api.deepseek.com/v1"></div><div class="form-group"><label>Model</label><input id="settings-model" value="deepseek-chat"></div></div></div><div class="card"><div class="card-header"><h3>📊 系统状态</h3></div><div id="settings-sys-status"><div class="loading-block"><span class="spinner"></span> 加载...</div></div></div><div class="card"><div class="card-header"><h3>🔒 安全说明</h3></div><p style="font-size:12px;color:var(--gray-500)">🔐 Key 仅保存在本地后端 · 🚫 不会上传云端 · ✅ 已排除版本管理跟踪</p></div>';
  api('/api/settings/status').then(({ok,data})=>{const s=$('#settings-sys-status');if(ok)s.innerHTML='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px"><div><b>AI Provider:</b> '+esc(data.llm_provider||'—')+'</div><div><b>模型:</b> '+esc(data.llm_model||'—')+'</div><div><b>Mock模式:</b> '+(data.is_mock?'是':'否')+'</div><div><b>Key已配置:</b> '+(data.deepseek_configured?'✅':'❌')+'</div><div><b>资料检索:</b> '+(data.embedding_is_mock?'未启用':'已启用')+'</div></div>';}).catch(()=>{});}

window._saveSettings=async function(){const key=document.getElementById('settings-key')?.value.trim(),base=document.getElementById('settings-base')?.value.trim(),model=document.getElementById('settings-model')?.value.trim();if(!key){toast('请输入 API Key','error');return;}const se=$('#settings-status');se.innerHTML='<span class="spinner"></span> 保存中...';try{const{ok,data}=await api('/api/settings/llm',{method:'POST',body:JSON.stringify({provider:'deepseek',api_key:key,base_url:base||'https://api.deepseek.com/v1',model:model||'deepseek-chat'})});se.innerHTML=ok?'<span style="color:var(--success)">✅ 已保存</span>':'<span style="color:var(--danger)">❌ 失败: '+esc(data.detail||'')+'</span>';}catch(e){se.innerHTML='<span style="color:var(--danger)">❌ 错误</span>';}};
window._testConnection=async function(){const se=$('#settings-status');se.innerHTML='<span class="spinner"></span> 测试中...';try{const{ok,data}=await api('/api/settings/test-llm',{method:'POST',body:JSON.stringify({message:'你好，请回复连接成功'})});se.innerHTML=(ok&&data.ok)?'<span style="color:var(--success)">✅ 连接成功! '+data.latency_ms+'ms</span>':'<span style="color:var(--danger)">❌ '+esc(data.error||'连接失败')+'</span>';}catch(e){se.innerHTML='<span style="color:var(--danger)">❌ 错误</span>';}};

// ════════════ FULL DEMO ════════════
window._runFullDemo=async function(){
  if(!S.token){toast('请先登录','error');return;}
  const stepNames=['检查模型','准备课程','分析画像','资料检索','生成回答','生成导图','生成测验','生成讲义','生成PPT','完成展示'];
  navTo('dashboard');const el=document.getElementById('page-dashboard');
  el.innerHTML='<div class="card"><div class="card-header"><h3>🎯 全流程演示</h3></div><div class="demo-steps" id="demo-steps">'+stepNames.map(s=>'<div class="demo-step" id="dstep-'+s+'">'+s+'</div>').join('')+'</div><div id="demo-output" style="margin-top:12px;font-size:12px"></div></div>';
  const markStep=(name,status)=>{const s=document.getElementById('dstep-'+name);if(s)s.className='demo-step '+status;};
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
  }catch(e){stepNames.forEach(s=>markStep(s,'fail'));out.innerHTML='<div class="error-card"><div class="err-title">演示失败</div><div class="err-detail">'+esc(e.message)+'</div></div>';}
};

// ════════════ HELPERS ════════════
function fmtAns(t){if(!t)return'';return esc(t).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\n---\n/g,'<hr style="border:none;border-top:1px dashed var(--gray-200);margin:8px 0">').replace(/\n/g,'<br>');}

// ── INIT ──────────────────────────────────────────
window._navTo=navTo;window.initApp=initApp;
window.addEventListener('error',function(e){if(!e.message&&!e.filename){e.preventDefault();return false;}});
document.addEventListener('DOMContentLoaded',()=>{
  try{if(typeof mermaid!=='undefined')mermaid.initialize({startOnLoad:false,theme:'default',securityLevel:'loose',mindmap:{padding:20}});}catch(e){}
  $$('.nav-item').forEach(item=>on(item,'click',()=>navTo(item.dataset.page)));
  const ci=document.getElementById('chat-input');if(ci)on(ci,'keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();_sendQuestion();}});
  try{initApp();}catch(e){console.warn('Init:',e.message);document.getElementById('page-assistant').innerHTML='<div class="empty-state"><div class="empty-icon">⚠</div><p>初始化失败</p><p style="font-size:11px;color:var(--gray-400)">请确认后端已启动</p></div>';}
});
})();
