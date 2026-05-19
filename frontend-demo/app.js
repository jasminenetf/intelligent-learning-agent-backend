/**
 * 智学・多智能体 — 学习工作台 Application Logic
 * Uses /api/app bootstrap aggregation API instead of scattered low-level APIs.
 */
(function(){
'use strict';

// ── State ────────────────────────────────────────────────────────
const S = {
  apiBase: 'http://127.0.0.1:8000',
  token: localStorage.getItem('hermes_token') || '',
  user: null,
  courseId: 2,
  courseName: '高等数学',
  courses: [],
  profile: null,
  sidebarCollapsed: false,
  kbReady: false,
  kbChunks: 0,
  demoRunning: false,
};

// ── DOM helpers ──────────────────────────────────────────────────
const $ = (sel, ctx) => (ctx||document).querySelector(sel);
const $$ = (sel, ctx) => (ctx||document).querySelectorAll(sel);
const on = (el, ev, fn) => el.addEventListener(ev, fn);

// ── API ──────────────────────────────────────────────────────────
async function api(path, opts={}) {
  const base = S.apiBase.replace(/\/$/,'');
  const headers = {'Content-Type':'application/json'};
  if (S.token) headers['Authorization'] = 'Bearer ' + S.token;
  const res = await fetch(base + path, {...opts, headers});
  const data = await res.json().catch(() => ({}));
  return {ok: res.ok, status: res.status, data};
}

function setToken(t) {
  S.token = t;
  if (t) localStorage.setItem('hermes_token', t);
  else localStorage.removeItem('hermes_token');
  updateTopbar();
}

// ── Toast ────────────────────────────────────────────────────────
let toastTimer;
function toast(msg, type='info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; el.style.display='none'; }, 3500);
  el.style.display = 'block';
}

// ── Navigation ───────────────────────────────────────────────────
function navTo(pageId) {
  $$('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-'+pageId);
  if (page) page.classList.add('active');

  $$('.nav-item').forEach(n => n.classList.remove('active'));
  const navItem = $(`.nav-item[data-page="${pageId}"]`);
  if (navItem) navItem.classList.add('active');

  // Load page-specific data
  if (pageId === 'dashboard') loadDashboard();
  if (pageId === 'assistant') initAssistant();
  if (pageId === 'generator') initGenerator();
  if (pageId === 'courses') loadCourses();
  if (pageId === 'knowledge') loadKnowledgeBase();
  if (pageId === 'learning-path') loadLearningPath();
  if (pageId === 'settings') loadSettings();
}

// ── Topbar ───────────────────────────────────────────────────────
function updateTopbar() {
  const userSpan = $('#topbar-user');
  const courseSpan = $('#topbar-course');
  const badgeEl = $('#topbar-badge');

  if (S.user) {
    userSpan.innerHTML = `<span class="topbar-avatar">${(S.user.username||'?')[0].toUpperCase()}</span><span>${S.user.username||''}</span>`;
    userSpan.style.display = 'flex';
  } else {
    userSpan.innerHTML = '<button class="btn btn-sm btn-primary" onclick="window._loginDemo()">演示账号登录</button>';
    userSpan.style.display = 'flex';
  }

  courseSpan.textContent = S.courseName || '未选择课程';

  if (S.kbReady && S.token) {
    badgeEl.className = 'topbar-badge ok';
    badgeEl.textContent = 'Agentic RAG 已连接';
  } else if (S.token) {
    badgeEl.className = 'topbar-badge warn';
    badgeEl.textContent = '知识库未就绪';
  } else {
    badgeEl.className = 'topbar-badge err';
    badgeEl.textContent = '未登录';
  }

  // Sidebar footer
  const sf = $('#sidebar-footer');
  if (S.token) {
    sf.innerHTML = '<span class="status-dot online"></span> API 正常';
  } else {
    sf.innerHTML = '<span class="status-dot offline"></span> 未连接';
  }
}

// ── Sidebar toggle ───────────────────────────────────────────────
window._toggleSidebar = function() {
  S.sidebarCollapsed = !S.sidebarCollapsed;
  const sb = document.getElementById('sidebar');
  if (S.sidebarCollapsed) sb.classList.add('collapsed');
  else sb.classList.remove('collapsed');
};

// ── Bootstrap ────────────────────────────────────────────────────
async function initApp() {
  try {
    const {ok, data} = await api('/api/app/bootstrap');
    if (!ok) return;

    S.courses = data.courses || [];
    if (data.selected_course && data.selected_course.id) {
      S.courseId = data.selected_course.id;
      S.courseName = data.selected_course.name || '未选择';
    }

    if (data.user && data.user.authenticated) {
      S.user = data.user;
      S.profile = data.profile_exists || false;
    }

    if (!S.token && S.user) {
      // Need to login
      await initDemo();
    }

    if (data.next_step === 'configure_key') {
      navTo('settings');
      toast('请先配置 DeepSeek API Key', 'info');
    } else if (data.next_step === 'login') {
      await initDemo();
      navTo('dashboard');
    } else if (data.next_step === 'create_course') {
      navTo('courses');
      toast('请创建或选择课程', 'info');
    } else if (!S.token) {
      await initDemo();
      navTo('dashboard');
    } else {
      navTo('dashboard');
    }

    updateTopbar();
  } catch(e) {
    console.error('Bootstrap failed:', e);
    navTo('settings');
    toast('无法连接后端，请确认服务已启动', 'error');
  }
}

// ── Demo init ────────────────────────────────────────────────────
async function initDemo() {
  try {
    const {ok, data} = await api('/api/app/demo-init', {method:'POST'});
    if (ok && data.token) {
      setToken(data.token);
      S.user = data.user;
      S.courseId = data.course ? data.course.id : 2;
      S.courseName = data.course ? data.course.name : '高等数学';
      S.kbReady = data.course ? data.course.has_knowledge_base : false;
      S.kbChunks = data.course ? data.course.chunks_count : 0;
      updateTopbar();
      toast('演示环境已就绪', 'success');
      return true;
    }
    return false;
  } catch(e) {
    console.error('Demo init failed:', e);
    return false;
  }
}

window._loginDemo = async function() {
  const ok = await initDemo();
  if (ok) {
    navTo('dashboard');
    loadDashboard();
  } else {
    toast('演示初始化失败，请检查后端服务', 'error');
  }
};

window._logout = function() {
  setToken('');
  S.user = null;
  S.profile = null;
  S.courses = [];
  S.kbReady = false;
  updateTopbar();
  navTo('settings');
  toast('已退出登录', 'info');
};

// ═════════════════════════════════════════════════════════════════
// PAGE: Dashboard
// ═════════════════════════════════════════════════════════════════
async function loadDashboard() {
  const el = document.getElementById('page-dashboard');
  el.innerHTML = '<div class="loading-block"><span class="spinner"></span> 加载中...</div>';

  try {
    const {ok, data} = await api(`/api/app/dashboard?course_id=${S.courseId}`);
    if (!ok) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠</div><p>加载失败</p></div>'; return; }

    const d = data;
    const kb = d.knowledge_base || {};
    const pf = d.profile || {};

    let html = '<div class="grid grid-3">';

    // System status cards
    html += `<div class="card grid-stat"><div class="val" style="color:var(--success)">✓</div><div class="lbl">LLM: ${(d.course||{}).name||'就绪'}</div></div>`;
    html += `<div class="card grid-stat"><div class="val">${kb.chunks_count||0}</div><div class="lbl">知识块</div></div>`;
    html += `<div class="card grid-stat"><div class="val">${pf ? '✓' : '—'}</div><div class="lbl">学生画像</div></div>`;
    html += '</div>';

    // Course info
    if (d.course) {
      html += `<div class="card"><div class="card-header"><h3>当前课程</h3></div>
        <p style="font-size:15px;font-weight:700">${esc(d.course.name)}</p>
        <p style="font-size:12px;color:var(--gray-500)">${esc(d.course.description||'')}</p>
        <div style="display:flex;gap:20px;margin-top:8px;font-size:12px;color:var(--gray-500)">
          <span>知识块: ${kb.chunks_count||0}</span>
          <span>向量库: ${kb.vector_ready?'就绪':'未构建'}</span>
          <span>状态: ${kb.status||'未知'}</span>
        </div></div>`;
    }

    // Suggested actions
    if (d.suggested_actions && d.suggested_actions.length) {
      html += '<div class="card"><div class="card-header"><h3>建议操作</h3></div>';
      d.suggested_actions.forEach(a => {
        html += `<button class="btn btn-outline btn-sm" style="margin:4px" onclick="window._navTo('${a.action==='start_qa'?'assistant':a.action==='configure_key'?'settings':a.action==='upload_materials'?'courses':a.action==='extract_profile'?'assistant':'dashboard'}')">${esc(a.label)}</button>`;
      });
      html += '</div>';
    }

    // Profile mini
    if (pf && pf.knowledge_level) {
      html += `<div class="card"><div class="card-header"><h3>学习画像摘要</h3></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px">
          <div><b>知识水平:</b> ${esc(pf.knowledge_level||'—')}</div>
          <div><b>认知风格:</b> ${esc(pf.cognitive_style||'—')}</div>
          <div><b>学习节奏:</b> ${esc(pf.pace_preference||'—')}</div>
          <div><b>专业:</b> ${esc(pf.major||'—')}</div>
        </div></div>`;
    }

    // Quick actions
    html += `<div class="card">
      <div class="card-header"><h3>快捷操作</h3></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="navTo('assistant')">💬 开始学习</button>
        <button class="btn btn-secondary" onclick="navTo('generator')">⚡ 生成资源</button>
        <button class="btn btn-outline" onclick="window._runFullDemo()">🎯 一键演示</button>
      </div></div>`;

    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠</div><p>加载失败: ${esc(e.message)}</p></div>`;
  }
}

// ═════════════════════════════════════════════════════════════════
// PAGE: Learning Assistant
// ═════════════════════════════════════════════════════════════════
function initAssistant() {
  const msgs = $('#chat-messages');
  if (!msgs) return;
  if (msgs.children.length === 0) {
    msgs.innerHTML = `<div class="empty-state" style="padding:60px 20px">
      <div class="empty-icon">💬</div>
      <p>向 Tutor Agent 提问</p>
      <p style="font-size:11px;color:var(--gray-400)">AI 将基于课程知识库回答你的问题</p>
    </div>`;
  }
  // Init artifacts tabs
  renderArtifactTabs();
  // Init citations panel
  $('#citations-panel').innerHTML = `<h4>📚 文献溯源</h4><p style="font-size:12px;color:var(--gray-400)">提问后显示引用来源</p>`;
  // Profile mini
  if (S.profile) {
    renderProfileMini();
  }
}

window._sendQuestion = async function() {
  const input = document.getElementById('chat-input');
  const q = input.value.trim();
  if (!q) return;
  if (!S.token) { toast('请先登录','error'); return; }

  const msgs = $('#chat-messages');

  // Add user message
  msgs.innerHTML += `<div class="msg-bubble user"><div class="msg-content">${esc(q)}</div></div>`;
  input.value = '';

  // Add loading
  const loadId = 'load_' + Date.now();
  msgs.innerHTML += `<div class="msg-bubble agent" id="${loadId}"><div class="msg-content"><span class="spinner"></span> Tutor Agent 思考中...</div></div>`;
  msgs.scrollTop = msgs.scrollHeight;

  try {
    const {ok, data} = await api('/api/app/ask', {
      method:'POST',
      body: JSON.stringify({course_id: S.courseId, question: q, top_k: 8})
    });

    const loadEl = document.getElementById(loadId);
    if (loadEl) loadEl.remove();

    if (ok) {
      let html = `<div class="msg-content">${formatAnswer(data.answer)}</div>`;
      if (data.citations && data.citations.length) {
        html += '<div class="msg-citations">📚 引用: ';
        const seen = new Set();
        data.citations.forEach(c => {
          const s = c.source || 'unknown';
          if (!seen.has(s)) { seen.add(s); html += `<span style="margin-right:8px">📄 ${esc(s)}</span>`; }
        });
        html += '</div>';
        // Update citations panel
        renderCitations(data.citations);
      }
      msgs.innerHTML += `<div class="msg-bubble agent">${html}</div>`;
    } else {
      msgs.innerHTML += `<div class="msg-bubble agent"><div class="msg-content" style="color:var(--danger)">❌ ${esc(data.detail||'请求失败')}</div></div>`;
    }
  } catch(e) {
    const loadEl = document.getElementById(loadId);
    if (loadEl) loadEl.remove();
    msgs.innerHTML += `<div class="msg-bubble agent"><div class="msg-content" style="color:var(--danger)">❌ 网络错误: ${esc(e.message)}</div></div>`;
  }

  msgs.scrollTop = msgs.scrollHeight;
};

window._quickGenerate = async function(type) {
  if (!S.token) { toast('请先登录','error'); return; }
  const topic = document.getElementById('chat-input').value.trim() || '导数与极限入门';
  toast(`正在生成${type}...`, 'info');
  try {
    const {ok, data} = await api('/api/app/generate', {
      method:'POST',
      body: JSON.stringify({course_id: S.courseId, resource_type: type, topic})
    });
    if (ok) {
      renderArtifact(type, data);
      toast(`${type} 生成完成`, 'success');
    } else {
      toast(`生成失败: ${data.detail||'未知错误'}`, 'error');
    }
  } catch(e) {
    toast(`生成失败: ${e.message}`, 'error');
  }
};

// ── Artifacts ────────────────────────────────────────────────────
function renderArtifactTabs() {
  const tabs = $('#artifacts-tabs');
  tabs.innerHTML = '';
  ['mindmap','quiz','lecture','ppt','study_plan'].forEach(t => {
    const label = {mindmap:'思维导图',quiz:'练习题库',lecture:'讲义文档',ppt:'PPT预览',study_plan:'学习路径'}[t];
    tabs.innerHTML += `<div class="artifacts-tab" data-tab="${t}" onclick="window._switchArtifactTab('${t}')">${label}</div>`;
  });
  // Default active
  const first = $('.artifacts-tab', tabs);
  if (first) first.classList.add('active');
  const firstPanel = $(`#artifact-${first?first.dataset.tab:'mindmap'}`);
  if (firstPanel) firstPanel.classList.add('active');
}

window._switchArtifactTab = function(tab) {
  $$('.artifacts-tab').forEach(t => t.classList.remove('active'));
  $$('.artifacts-tab').forEach(t => { if (t.dataset.tab === tab) t.classList.add('active'); });
  $$('#artifacts-content .tab-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById('artifact-'+tab);
  if (panel) panel.classList.add('active');
};

function renderArtifact(type, data) {
  const panel = document.getElementById('artifact-'+type);
  if (!panel) return;

  if (type === 'mindmap' && data.mermaid) {
    panel.innerHTML = `<div class="mermaid-wrap"><div class="mermaid">${data.mermaid}</div><pre style="margin-top:8px;max-height:150px;overflow:auto">${esc(data.mermaid)}</pre></div>`;
    setTimeout(() => {
      try { mermaid.run({nodes: [panel.querySelector('.mermaid')]}); } catch(e) {}
    }, 100);
  } else if (type === 'quiz' && data.items) {
    let html = '';
    data.items.forEach((it, i) => {
      html += `<div class="quiz-item"><div class="q-text">Q${i+1}. ${esc(it.question)}</div>`;
      it.options.forEach((o, j) => {
        html += `<div class="q-option${j===it.answer?' correct':''}">${String.fromCharCode(65+j)}. ${esc(o)}${j===it.answer?' ✓':''}</div>`;
      });
      if (it.explanation) html += `<div class="q-explain">💡 ${esc(it.explanation)}</div>`;
      html += '</div>';
    });
    panel.innerHTML = html;
  } else if (type === 'lecture' && data.content) {
    panel.innerHTML = `<div style="white-space:pre-wrap;font-size:13px;line-height:1.8">${formatAnswer(data.content)}</div>`;
  } else if (type === 'ppt' && data.download_url) {
    panel.innerHTML = `<div style="text-align:center;padding:30px">
      <div style="font-size:48px;margin-bottom:12px">📊</div>
      <p style="font-size:14px;font-weight:600">${esc(data.title||'PPT课件')}</p>
      <p style="font-size:12px;color:var(--gray-500)">${data.slide_count||'?'} 页</p>
      <a href="${S.apiBase}${data.download_url}" target="_blank" class="btn btn-primary" style="margin-top:12px">📥 下载 PPTX</a>
    </div>`;
  } else if (type === 'study_plan' && data.study_plan) {
    const sp = data.study_plan;
    let html = `<p style="font-size:12px;color:var(--gray-500);margin-bottom:8px">${esc(sp.profile_summary||'')}</p>`;
    (sp.steps||[]).forEach(s => {
      html += `<div class="step-card"><div class="step-num">${s.order||'?'}</div><div class="step-info"><h4>${esc(s.topic||'')}</h4><p>${esc(s.reason||'')} | ${(s.resource_types||[]).join(', ')} | ${s.estimated_minutes||'?'}min</p><p>${esc(s.practice||'')}</p></div></div>`;
    });
    panel.innerHTML = html;
  } else {
    panel.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>尚未生成${type}资源</p><p style="font-size:11px;color:var(--gray-400)">在聊天中输入问题或点击快捷按钮生成</p></div>`;
  }

  window._switchArtifactTab(type);
}

function renderCitations(citations) {
  if (!citations || !citations.length) return;
  const panel = $('#citations-panel');
  let html = '<h4>📚 文献溯源</h4>';
  const seen = new Set();
  citations.forEach(c => {
    const key = c.source || 'unknown';
    if (seen.has(key)) return;
    seen.add(key);
    html += `<div class="cite-item"><div class="cite-src">${esc(key)}</div>
      ${c.page_number ? `<div class="cite-page">页 ${c.page_number}</div>` : ''}
      ${c.score ? `<div class="cite-page">相关度: ${(c.score*100).toFixed(0)}%</div>` : ''}
    </div>`;
  });
  panel.innerHTML = html;
}

function renderProfileMini() {
  // Try to get actual profile
  api('/api/profiles/me').then(({ok, data}) => {
    if (!ok) return;
    const panel = $('#profile-mini');
    if (!panel) return;
    let html = '<h4>🎓 学习画像</h4>';
    html += `<div style="font-size:11px;display:grid;grid-template-columns:1fr 1fr;gap:4px">`;
    html += `<div>水平: ${esc(data.knowledge_level||'—')}</div>`;
    html += `<div>风格: ${esc(data.cognitive_style||'—')}</div>`;
    html += `<div>节奏: ${esc(data.pace_preference||'—')}</div>`;
    html += `<div>专业: ${esc(data.major||'—')}</div>`;
    html += '</div>';
    panel.innerHTML = html;
  }).catch(() => {});
}

// ═════════════════════════════════════════════════════════════════
// PAGE: Generator
// ═════════════════════════════════════════════════════════════════
function initGenerator() {
  const el = document.getElementById('page-generator');
  let html = '';

  // Chapter card
  html += `<div class="card"><div class="card-header"><h3>📖 当前章节</h3></div>
    <div class="gen-topic">${esc(S.courseName)} — 导数与极限入门</div>
    <div class="gen-tags">
      <span class="gen-tag">视觉偏好</span>
      <span class="gen-tag">基础薄弱</span>
      <span class="gen-tag">需要分步讲解</span>
      <span class="gen-tag">考试导向</span>
    </div></div>`;

  // Input
  html += `<div class="card"><div class="card-header"><h3>✏️ 告诉我需要的学习资源</h3></div>
    <div style="display:flex;gap:8px;margin-bottom:8px">
      <input id="gen-topic-input" placeholder="输入学习主题..." style="flex:1;padding:8px 12px;border:1px solid var(--gray-300);border-radius:6px;font-size:13px" value="导数与极限入门">
      <button class="btn btn-primary" onclick="window._genAllResources()">⚡ 生成资源</button>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <button class="btn btn-sm btn-outline" onclick="document.getElementById('gen-topic-input').value='导数定义与几何意义'">导数定义</button>
      <button class="btn btn-sm btn-outline" onclick="document.getElementById('gen-topic-input').value='极限运算法则'">极限运算法则</button>
      <button class="btn btn-sm btn-outline" onclick="document.getElementById('gen-topic-input').value='连续函数性质'">连续函数</button>
    </div></div>`;

  // Resource cards
  const resources = [
    {id:'lecture_doc',icon:'📄',name:'讲义文档',desc:'个性化AI讲义'},
    {id:'mindmap',icon:'🧠',name:'思维导图',desc:'概念关系可视化'},
    {id:'quiz',icon:'📝',name:'自适应测验',desc:'知识点自测'},
    {id:'ppt',icon:'📊',name:'PPT课件',desc:'可下载PPTX'},
    {id:'study_plan',icon:'🗺️',name:'学习路径',desc:'个性化学习计划'},
    {id:'video',icon:'🎬',name:'数字人视频',desc:'待开发',beta:true},
  ];
  html += '<div class="resource-cards">';
  resources.forEach(r => {
    html += `<div class="res-card" id="rcard-${r.id}" onclick="${r.beta?'':`window._genSingle('${r.id}')`}">
      <div class="res-icon">${r.icon}</div>
      <div class="res-name">${r.name}</div>
      <div class="res-desc">${r.desc}</div>
      <span class="res-status ready" id="rstatus-${r.id}">${r.beta?'待开发':'可生成'}</span>
    </div>`;
  });
  html += '</div>';

  // Progress
  html += `<div class="card" id="gen-progress-card" style="display:none">
    <div class="card-header"><h3>⚙️ 多智能体生成进度</h3></div>
    <div class="progress-steps" id="gen-progress-steps">
      <div class="progress-step" id="gstep-profile">分析画像</div>
      <div class="progress-step" id="gstep-rag">检索知识</div>
      <div class="progress-step" id="gstep-generate">Tutor协同生成</div>
      <div class="progress-step" id="gstep-output">输出资源</div>
    </div></div>`;

  // Result tabs
  html += `<div class="card"><div class="card-header"><h3>📋 生成结果</h3></div>
    <div class="artifacts-tabs" id="gen-result-tabs">
      <div class="artifacts-tab active" onclick="window._switchGenTab('mindmap')">思维导图</div>
      <div class="artifacts-tab" onclick="window._switchGenTab('lecture')">讲解文档</div>
      <div class="artifacts-tab" onclick="window._switchGenTab('ppt')">PPT预览</div>
      <div class="artifacts-tab" onclick="window._switchGenTab('quiz')">练习题</div>
      <div class="artifacts-tab" onclick="window._switchGenTab('study_plan')">学习路径</div>
    </div>
    <div id="gen-results" style="padding:16px"><div class="empty-state"><div class="empty-icon">📭</div><p>点击资源卡片开始生成</p></div></div></div>`;

  el.innerHTML = html;
  S._genResults = {};
}

window._switchGenTab = function(tab) {
  $$('#gen-result-tabs .artifacts-tab').forEach(t => t.classList.remove('active'));
  $$('#gen-result-tabs .artifacts-tab').forEach(t => { if (t.textContent.includes({mindmap:'思维导图',lecture:'讲解文档',ppt:'PPT预览',quiz:'练习题',study_plan:'学习路径'}[tab]||'')) t.classList.add('active'); });
  // Show cached result
  if (S._genResults[tab]) {
    const el = $('#gen-results');
    el.innerHTML = formatGenResult(tab, S._genResults[tab]);
  }
};

window._genSingle = async function(type) {
  if (!S.token) { toast('请先登录','error'); return; }
  const topic = document.getElementById('gen-topic-input')?.value || '导数与极限入门';
  const statusEl = document.getElementById('rstatus-'+type);
  if (statusEl) { statusEl.className = 'res-status generating'; statusEl.textContent = '生成中...'; }

  // Show progress
  const pcard = $('#gen-progress-card');
  if (pcard) pcard.style.display = 'block';
  ['gstep-profile','gstep-rag','gstep-generate','gstep-output'].forEach((id,i) => {
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el) el.className = 'progress-step active';
    }, i * 300);
  });

  try {
    const {ok, data} = await api('/api/app/generate', {
      method:'POST',
      body: JSON.stringify({course_id: S.courseId, resource_type: type, topic})
    });

    // Mark all progress done
    ['gstep-profile','gstep-rag','gstep-generate','gstep-output'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.className = 'progress-step done';
    });

    if (ok) {
      S._genResults[type] = data;
      if (statusEl) { statusEl.className = 'res-status ready'; statusEl.textContent = '已完成'; }
      $('#gen-results').innerHTML = formatGenResult(type, data);
      toast(`${type} 生成完成`, 'success');
    } else {
      if (statusEl) { statusEl.className = 'res-status failed'; statusEl.textContent = '失败'; }
      toast(`生成失败: ${data.detail||'未知错误'}`, 'error');
    }
  } catch(e) {
    if (statusEl) { statusEl.className = 'res-status failed'; statusEl.textContent = '失败'; }
    ['gstep-profile','gstep-rag','gstep-generate','gstep-output'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.className = 'progress-step fail';
    });
    toast(`生成失败: ${e.message}`, 'error');
  }
};

window._genAllResources = async function() {
  for (const type of ['mindmap','lecture_doc','quiz','ppt','study_plan']) {
    await window._genSingle(type);
  }
};

function formatGenResult(type, data) {
  if (type === 'mindmap' && data.mermaid) return `<div class="mermaid-wrap"><div class="mermaid">${data.mermaid}</div></div>`;
  if (type === 'quiz' && data.items) {
    return data.items.map((it,i) => `<div class="quiz-item"><div class="q-text">Q${i+1}. ${esc(it.question)}</div>` +
      it.options.map((o,j) => `<div class="q-option${j===it.answer?' correct':''}">${String.fromCharCode(65+j)}. ${esc(o)}${j===it.answer?' ✓':''}</div>`).join('') +
      `<div class="q-explain">💡 ${esc(it.explanation||'')}</div></div>`).join('');
  }
  if (type === 'lecture' && data.content) return `<div style="white-space:pre-wrap;font-size:13px;line-height:1.8">${formatAnswer(data.content)}</div>`;
  if (type === 'ppt' && data.download_url) return `<div style="text-align:center;padding:30px"><div style="font-size:48px">📊</div><p style="font-weight:600">${esc(data.title||'PPT')}</p><a href="${S.apiBase}${data.download_url}" target="_blank" class="btn btn-primary">📥 下载 PPTX</a></div>`;
  if (type === 'study_plan' && data.study_plan) {
    const sp = data.study_plan;
    return `<p style="font-size:12px;color:var(--gray-500)">${esc(sp.profile_summary||'')}</p>` +
      (sp.steps||[]).map(s => `<div class="step-card"><div class="step-num">${s.order||'?'}</div><div class="step-info"><h4>${esc(s.topic||'')}</h4><p>${esc(s.reason||'')} | ${(s.resource_types||[]).join(',')} | ${s.estimated_minutes||'?'}min</p></div></div>`).join('');
  }
  return `<pre style="max-height:400px;overflow:auto;font-size:12px">${esc(JSON.stringify(data,null,2))}</pre>`;
}

// ═════════════════════════════════════════════════════════════════
// PAGE: Courses
// ═════════════════════════════════════════════════════════════════
async function loadCourses() {
  const el = document.getElementById('page-courses');
  el.innerHTML = '<div class="loading-block"><span class="spinner"></span> 加载课程...</div>';

  try {
    const {ok, data} = await api('/api/courses');
    if (!ok) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠</div><p>请先登录</p></div>'; return; }

    S.courses = Array.isArray(data) ? data : [];

    let html = `<div class="card"><div class="card-header"><h3>课程列表</h3>
      <button class="btn btn-sm btn-primary" onclick="window._createCourse()">+ 创建课程</button></div>`;

    if (S.courses.length === 0) {
      html += '<div class="empty-state"><div class="empty-icon">📚</div><p>暂无课程</p><p style="font-size:11px;color:var(--gray-400)">点击"创建课程"添加</p></div>';
    } else {
      S.courses.forEach(c => {
        const sel = c.id === S.courseId;
        html += `<div class="course-card${sel?' selected':''}" onclick="window._selectCourse(${c.id},'${esc(c.name)}')">
          <h4>📚 ${esc(c.name)} ${sel?'✓':''}</h4>
          <div class="course-meta"><span>ID: ${c.id}</span><span>${esc(c.description||'')}</span></div>
          <div style="margin-top:6px;font-size:11px;color:var(--gray-500)">知识块: ${c.chunks_count||'未知'}</div>
        </div>`;
      });
    }
    html += '</div>';

    // Create form
    html += `<div class="card"><div class="card-header"><h3>创建课程</h3></div>
      <div class="form-group"><label>课程名称</label><input id="new-course-name" placeholder="例: 高等数学"></div>
      <div class="form-group"><label>课程描述</label><input id="new-course-desc" placeholder="简要说眀"></div>
      <button class="btn btn-primary" onclick="window._createCourse()">创建</button></div>`;

    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠</div><p>加载失败: ${esc(e.message)}</p></div>`;
  }
}

window._selectCourse = function(id, name) {
  S.courseId = id;
  S.courseName = name;
  updateTopbar();
  loadCourses();
  toast(`已选择: ${name}`, 'success');
};

window._createCourse = async function() {
  const name = document.getElementById('new-course-name')?.value.trim();
  if (!name) { toast('请输入课程名称','error'); return; }
  const desc = document.getElementById('new-course-desc')?.value.trim() || '';
  try {
    const {ok, data} = await api('/api/courses', {method:'POST', body: JSON.stringify({name, description: desc})});
    if (ok) {
      S.courseId = data.id;
      S.courseName = data.name;
      updateTopbar();
      loadCourses();
      toast('课程创建成功', 'success');
    } else {
      toast(`创建失败: ${data.detail||''}`, 'error');
    }
  } catch(e) {
    toast(`创建失败: ${e.message}`, 'error');
  }
};

// ═════════════════════════════════════════════════════════════════
// PAGE: Knowledge Base
// ═════════════════════════════════════════════════════════════════
function loadKnowledgeBase() {
  const el = document.getElementById('page-knowledge');

  let html = `<div class="card"><div class="card-header"><h3>📚 知识库状态</h3></div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;text-align:center">
      <div class="grid-stat"><div class="val">${S.kbChunks||0}</div><div class="lbl">知识块</div></div>
      <div class="grid-stat"><div class="val">${S.kbReady?'就绪':'未构建'}</div><div class="lbl">ChromaDB</div></div>
      <div class="grid-stat"><div class="val">—</div><div class="lbl">OCR来源</div></div>
    </div>
    <div style="margin-top:12px;font-size:12px;color:var(--gray-500)">
      <p>当前课程: ${esc(S.courseName)}</p>
      <p>⚠ Tesseract OCR: 真实扫描PDF需安装Tesseract，文字型PDF可直接解析</p>
    </div></div>`;

  // Search test
  html += `<div class="card"><div class="card-header"><h3>🔍 RAG 检索测试</h3></div>
    <div style="display:flex;gap:8px;margin-bottom:8px">
      <input id="rag-query" placeholder="输入关键词如: 导数、极限..." style="flex:1;padding:8px;border:1px solid var(--gray-300);border-radius:6px;font-size:13px">
      <button class="btn btn-primary" onclick="window._ragSearch()">检索</button>
    </div>
    <div id="rag-results"><div class="empty-state" style="padding:20px"><p style="font-size:12px;color:var(--gray-400)">输入关键词测试知识库检索</p></div></div></div>`;

  el.innerHTML = html;
}

window._ragSearch = async function() {
  const q = document.getElementById('rag-query')?.value.trim();
  if (!q) return;
  const el = $('#rag-results');
  el.innerHTML = '<div class="loading-block"><span class="spinner"></span> 检索中...</div>';
  try {
    const {ok, data} = await api(`/api/rag/courses/${S.courseId}/search?q=${encodeURIComponent(q)}&top_k=5`);
    if (ok && data.results) {
      let html = `<p style="font-size:12px;color:var(--gray-500);margin-bottom:8px">找到 ${data.results.length} 条结果</p>`;
      data.results.forEach(r => {
        html += `<div class="cite-item"><div class="cite-src">${esc(r.source||'unknown')}</div>
          <div style="font-size:11px;margin-top:4px">${esc((r.content||'').substring(0,200))}</div>
          <div class="cite-page">相关度: ${((r.score||0)*100).toFixed(0)}%</div></div>`;
      });
      el.innerHTML = html;
    } else {
      el.innerHTML = '<div class="empty-state"><p>无结果或知识库未构建</p></div>';
    }
  } catch(e) {
    el.innerHTML = `<p style="color:var(--danger)">检索失败: ${esc(e.message)}</p>`;
  }
};

// ═════════════════════════════════════════════════════════════════
// PAGE: Learning Path
// ═════════════════════════════════════════════════════════════════
function loadLearningPath() {
  const el = document.getElementById('page-learning-path');

  el.innerHTML = '<div class="loading-block"><span class="spinner"></span> 生成学习路径...</div>';

  api('/api/app/generate', {
    method:'POST',
    body: JSON.stringify({course_id: S.courseId, resource_type:'study_plan', topic:'导数与极限入门'})
  }).then(({ok, data}) => {
    if (ok && data.study_plan) {
      const sp = data.study_plan;
      let html = `<div class="card"><div class="card-header"><h3>🗺️ ${esc(sp.title||'学习路径')}</h3></div>
        <p style="font-size:13px;color:var(--gray-500);margin-bottom:12px">${esc(sp.profile_summary||'')}</p>`;
      (sp.steps||[]).forEach(s => {
        html += `<div class="step-card"><div class="step-num">${s.order||'?'}</div><div class="step-info">
          <h4>${esc(s.topic||'')}</h4>
          <p>${esc(s.reason||'')}</p>
          <p>资源: ${(s.resource_types||[]).join(', ')} | 预计: ${s.estimated_minutes||'?'}分钟</p>
          <p style="color:var(--success)">🏋️ ${esc(s.practice||'')}</p>
        </div></div>`;
      });
      if (sp.recommended_topics) {
        html += `<div style="margin-top:12px"><b>推荐主题:</b> ${sp.recommended_topics.map(t=>esc(t)).join(' → ')}</div>`;
      }
      html += '</div>';
      el.innerHTML = html;
    } else {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">🗺️</div><p>生成学习路径失败</p></div>';
    }
  }).catch(e => {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠</div><p>错误: ${esc(e.message)}</p></div>`;
  });
}

// ═════════════════════════════════════════════════════════════════
// PAGE: Settings
// ═════════════════════════════════════════════════════════════════
function loadSettings() {
  const el = document.getElementById('page-settings');

  let html = `<div class="card"><div class="card-header"><h3>⚙️ API Key 配置</h3></div>
    <div class="form-group"><label>API Key</label><input id="settings-key" type="password" placeholder="sk-...">
      <div class="form-hint">Key 仅保存在后端 backend/.env，不会上传云端</div></div>
    <div class="form-group"><label>API Base URL</label><input id="settings-base" value="https://api.deepseek.com/v1"></div>
    <div class="form-group"><label>Model</label><input id="settings-model" value="deepseek-chat"></div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-primary" onclick="window._saveSettings()">💾 保存配置</button>
      <button class="btn btn-outline" onclick="window._testConnection()">🔌 测试连接</button>
    </div>
    <div id="settings-status" style="margin-top:8px;font-size:12px"></div></div>`;

  html += `<div class="card"><div class="card-header"><h3>📊 系统状态</h3></div>
    <div id="settings-sys-status"><div class="loading-block"><span class="spinner"></span> 加载...</div></div></div>`;

  html += `<div class="card"><div class="card-header"><h3>🔒 安全说明</h3></div>
    <p style="font-size:12px;color:var(--gray-500)">• API Key 仅保存在后端 .env 文件中<br>• 已通过 .gitignore 排除，不会提交到 Git<br>• 前端通过后端代理调用，不直接暴露 Key<br>• status 接口仅返回 configured=true/false</p></div>`;

  el.innerHTML = html;

  // Load status
  api('/api/settings/status').then(({ok, data}) => {
    const sel = $('#settings-sys-status');
    if (ok) {
      sel.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">
        <div><b>LLM Provider:</b> ${esc(data.llm_provider||'—')}</div>
        <div><b>LLM Model:</b> ${esc(data.llm_model||'—')}</div>
        <div><b>Is Mock:</b> ${data.is_mock?'是':'否'}</div>
        <div><b>DeepSeek配置:</b> ${data.deepseek_configured?'✅ 已配':'❌ 未配'}</div>
        <div><b>Embedding:</b> ${esc(data.embedding_provider||'—')}</div>
        <div><b>Embedding Mock:</b> ${data.embedding_is_mock?'是':'否'}</div>
      </div>`;
    }
  }).catch(() => {});
}

window._saveSettings = async function() {
  const key = document.getElementById('settings-key')?.value.trim();
  const base = document.getElementById('settings-base')?.value.trim();
  const model = document.getElementById('settings-model')?.value.trim();
  if (!key) { toast('请输入 API Key','error'); return; }

  const statusEl = $('#settings-status');
  statusEl.innerHTML = '<span class="spinner"></span> 保存中...';

  try {
    const {ok, data} = await api('/api/settings/llm', {
      method:'POST',
      body: JSON.stringify({
        provider: 'deepseek',
        api_key: key,
        base_url: base || 'https://api.deepseek.com/v1',
        model: model || 'deepseek-chat'
      })
    });
    if (ok) {
      statusEl.innerHTML = '<span style="color:var(--success)">✅ 配置已保存。可能需要重启后端。</span>';
      toast('配置已保存', 'success');
    } else {
      statusEl.innerHTML = `<span style="color:var(--danger)">❌ 保存失败: ${esc(data.detail||'')}</span>`;
    }
  } catch(e) {
    statusEl.innerHTML = `<span style="color:var(--danger)">❌ 错误: ${esc(e.message)}</span>`;
  }
};

window._testConnection = async function() {
  const statusEl = $('#settings-status');
  statusEl.innerHTML = '<span class="spinner"></span> 测试连接中...';
  try {
    const {ok, data} = await api('/api/settings/test-llm', {
      method:'POST',
      body: JSON.stringify({message:'你好，请回复"连接成功"'})
    });
    if (ok && data.ok) {
      statusEl.innerHTML = `<span style="color:var(--success)">✅ 连接成功! 延迟: ${data.latency_ms||'?'}ms</span>`;
    } else {
      statusEl.innerHTML = `<span style="color:var(--danger)">❌ 连接失败: ${esc(data.error||'')}</span>`;
    }
  } catch(e) {
    statusEl.innerHTML = `<span style="color:var(--danger)">❌ 错误: ${esc(e.message)}</span>`;
  }
};

// ═════════════════════════════════════════════════════════════════
// Full Demo
// ═════════════════════════════════════════════════════════════════
window._runFullDemo = async function() {
  if (!S.token) { toast('请先登录','error'); return; }
  if (S.demoRunning) return;
  S.demoRunning = true;

  navTo('dashboard');
  const el = document.getElementById('page-dashboard');

  const stepNames = ['系统状态','画像提取','RAG问答','学习路径','思维导图','测验','PPT'];
  let html = '<div class="card"><div class="card-header"><h3>🎯 全流程演示</h3></div><div class="demo-steps" id="demo-steps">';
  stepNames.forEach(s => { html += `<div class="demo-step" id="dstep-${s}">${s}</div>`; });
  html += '</div><div id="demo-output" style="margin-top:12px;font-size:12px"></div></div>';
  el.innerHTML = html;

  const markStep = (name, status) => {
    const step = document.getElementById('dstep-'+name);
    if (step) step.className = 'demo-step ' + status;
  };

  const out = $('#demo-output');
  for (const [i, name] of stepNames.entries()) {
    markStep(name, 'running');
    out.innerHTML += `<div>⏳ ${name}...</div>`;
  }

  try {
    const {ok, data} = await api('/api/app/run-demo', {method:'POST', body: JSON.stringify({course_id: S.courseId})});
    out.innerHTML = '';

    if (ok && data.steps) {
      data.steps.forEach(s => {
        const status = s.status === 'success' ? 'done' : 'fail';
        markStep(s.name, status);
        out.innerHTML += `<div style="margin:2px 0">${s.status==='success'?'✅':'❌'} ${s.name}: ${esc(s.detail||'')}</div>`;
      });
      out.innerHTML += `<div style="margin-top:8px;font-weight:600;color:var(--success)">${data.summary||''}</div>`;
    } else {
      stepNames.forEach(s => markStep(s, 'fail'));
      out.innerHTML = '<div style="color:var(--danger)">演示失败</div>';
    }
  } catch(e) {
    stepNames.forEach(s => markStep(s, 'fail'));
    out.innerHTML = `<div style="color:var(--danger)">错误: ${esc(e.message)}</div>`;
  }
  S.demoRunning = false;
};

// ═════════════════════════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════════════════════════
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function formatAnswer(text) {
  if (!text) return '';
  // Basic markdown-like formatting
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\n---\n/g, '<hr style="border:none;border-top:1px dashed var(--gray-200);margin:8px 0">')
    .replace(/\n/g, '<br>');
}

// ── Init ─────────────────────────────────────────────────────────
window._navTo = navTo;
window.initApp = initApp;

// Bind nav items
document.addEventListener('DOMContentLoaded', () => {
  $$('.nav-item').forEach(item => {
    on(item, 'click', () => navTo(item.dataset.page));
  });

  // Enter key in chat
  const chatInput = document.getElementById('chat-input');
  if (chatInput) {
    on(chatInput, 'keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        window._sendQuestion();
      }
    });
  }

  initApp();
});

})();
