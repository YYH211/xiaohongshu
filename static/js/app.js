/**
 * Creator - Premium AI Content Dashboard
 * Logic Controller
 */

const API_BASE = '/api';

// --- 初始化 ---
document.addEventListener('DOMContentLoaded', () => {
    initBackgroundCanvas();
    initNavigation();
    loadConfig(); // 预加载配置

    // 绑定快捷键
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            if (document.activeElement.id === 'topic-input') {
                startGenerate();
            }
        }
    });
});

// --- 视觉效果: 动态背景 Canvas ---
function initBackgroundCanvas() {
    const canvas = document.getElementById('bg-canvas');
    const ctx = canvas.getContext('2d');

    let width, height;
    let particles = [];

    function resize() {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;
        initParticles();
    }

    function initParticles() {
        particles = [];
        const count = Math.floor(width * height / 15000); // 根据屏幕面积决定粒子数
        for (let i = 0; i < count; i++) {
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                size: Math.random() * 200 + 50,
                hue: Math.random() * 60 + 220, // Blue-Purple range
                opacity: Math.random() * 0.3
            });
        }
    }

    function animate() {
        ctx.clearRect(0, 0, width, height);

        // 绘制渐变背景
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#0f0f13');
        gradient.addColorStop(1, '#1a1a2e');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        // 绘制流体粒子
        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;

            if (p.x < -p.size) p.x = width + p.size;
            if (p.x > width + p.size) p.x = -p.size;
            if (p.y < -p.size) p.y = height + p.size;
            if (p.y > height + p.size) p.y = -p.size;

            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
            g.addColorStop(0, `hsla(${p.hue}, 80%, 60%, ${p.opacity})`);
            g.addColorStop(1, 'transparent');

            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        });

        requestAnimationFrame(animate);
    }

    window.addEventListener('resize', resize);
    resize();
    animate();
}

// --- 导航与视图切换 ---
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item[data-target]');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetId = item.dataset.target;
            switchView(targetId);

            // 更新激活状态
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
        });
    });
}

function switchView(viewId) {
    // 隐藏所有视图
    document.querySelectorAll('.view-section').forEach(el => {
        el.classList.remove('active');
    });

    // 显示目标视图
    const targetView = document.getElementById(`view-${viewId}`);
    if (targetView) {
        targetView.classList.add('active');
    }
}

// --- 模态框管理 ---
function openModal(modalId) {
    const overlay = document.getElementById('modal-overlay');
    const modal = document.getElementById(`modal-${modalId}`);

    // 隐藏其他模态框
    document.querySelectorAll('.modal-glass').forEach(el => el.classList.remove('active'));

    overlay.classList.add('active');
    modal.classList.add('active');

    if (modalId === 'history') {
        loadTaskHistory();
    }
}

function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.remove('active');
    document.querySelectorAll('.modal-glass').forEach(el => el.classList.remove('active'));
}

// 点击遮罩层关闭
document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') {
        closeModal();
    }
});

// --- 核心功能: 生成内容 ---
async function startGenerate() {
    const topicInput = document.getElementById('topic-input');
    const topic = topicInput.value.trim();
    const contentType = document.querySelector('input[name="content-type"]:checked').value;

    if (!topic) {
        showToast('请输入创作主题', 'info');
        topicInput.focus();
        return;
    }

    // 创建任务卡片 UI
    const taskId = 'task-' + Date.now();
    createTaskStatusCard(taskId, topic);

    // 清空输入
    topicInput.value = '';

    try {
        updateTaskProgress(taskId, 10, '正在启动创作引擎...');

        const response = await fetch(`${API_BASE}/generate-and-publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic, content_type: contentType })
        });

        // 模拟进度 (真实进度需 WebSocket，此处为模拟体验)
        simulateProgress(taskId);

        const data = await response.json();

        if (data.success) {
            updateTaskProgress(taskId, 100, '发布成功！');
            showToast('内容创作完成', 'success');

            // 延迟展示结果
            setTimeout(() => {
                showResultModal(data.data);
            }, 1000);
        } else {
            updateTaskStatus(taskId, 'error', data.error || '生成失败');
            showToast(data.error || '生成失败', 'error');
        }
    } catch (error) {
        updateTaskStatus(taskId, 'error', error.message);
        showToast(`请求失败: ${error.message}`, 'error');
    }
}

function createTaskStatusCard(taskId, topic) {
    const container = document.getElementById('current-task-container');
    container.innerHTML = `
        <div id="${taskId}" class="status-card">
            <div class="status-header">
                <span class="status-topic">${topic}</span>
                <span class="status-badge running">进行中</span>
            </div>
            <div class="progress-track">
                <div class="progress-fill" style="width: 0%"></div>
            </div>
            <div class="status-text">准备就绪</div>
        </div>
    `;
}

function updateTaskProgress(taskId, percent, text) {
    const card = document.getElementById(taskId);
    if (!card) return;

    card.querySelector('.progress-fill').style.width = `${percent}%`;
    card.querySelector('.status-text').textContent = text;
}

function updateTaskStatus(taskId, status, message) {
    const card = document.getElementById(taskId);
    if (!card) return;

    const badge = card.querySelector('.status-badge');
    badge.className = `status-badge ${status}`;
    badge.textContent = status === 'error' ? '失败' : '完成';

    card.querySelector('.status-text').textContent = message;
}

async function simulateProgress(taskId) {
    const steps = [
        { p: 30, t: '正在全网检索相关资料...' },
        { p: 50, t: 'AI 正在深度阅读与分析...' },
        { p: 70, t: '正在撰写与润色文案...' },
        { p: 90, t: '正在生成配图并发布...' }
    ];

    for (const step of steps) {
        await new Promise(r => setTimeout(r, 1500));
        const card = document.getElementById(taskId);
        // 如果任务已经结束（比如报错了），就不再更新
        if (!card || card.querySelector('.status-badge').classList.contains('error')) break;
        updateTaskProgress(taskId, step.p, step.t);
    }
}

// --- 结果展示 ---
function showResultModal(data) {
    document.getElementById('res-title').textContent = data.title || '无标题';
    document.getElementById('res-time').textContent = data.publish_time || new Date().toLocaleString();
    document.getElementById('res-content').textContent = data.content || '';

    // Tags
    const tagsContainer = document.getElementById('res-tags');
    tagsContainer.innerHTML = (data.tags || []).map(tag => `<span class="tag-glass">#${tag}</span>`).join('');

    // Images
    const imgContainer = document.getElementById('res-images');
    imgContainer.innerHTML = (data.images || []).map(url => `<img src="${url}" onclick="window.open('${url}')">`).join('');

    openModal('result');
}

// --- 热点发现 ---
let selectedTopics = new Set();

async function fetchTrendingTopicsByDomain(domain) {
    // 更新 Tab 状态
    document.querySelectorAll('.tab-glass').forEach(el => {
        el.classList.toggle('active', el.textContent.includes(domain));
    });

    const grid = document.getElementById('trending-grid');
    grid.innerHTML = '<div class="empty-state-glass"><span class="icon">⏳</span><p>正在搜寻全网热点...</p></div>';

    try {
        const response = await fetch(`${API_BASE}/fetch-trending-topics`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain })
        });

        const data = await response.json();
        if (data.success && data.topics) {
            renderTrendingCards(data.topics);
        } else {
            grid.innerHTML = '<div class="empty-state-glass"><p>未找到相关热点</p></div>';
        }
    } catch (error) {
        showToast('获取热点失败', 'error');
        grid.innerHTML = '<div class="empty-state-glass"><p>加载失败，请重试</p></div>';
    }
}

async function fetchTopicsFromUrl() {
    const url = document.getElementById('url-input').value.trim();
    if (!url) return showToast('请输入链接', 'info');

    const grid = document.getElementById('trending-grid');
    grid.innerHTML = '<div class="empty-state-glass"><span class="icon">🕷️</span><p>正在爬取并分析网页...</p></div>';

    try {
        const response = await fetch(`${API_BASE}/fetch-topics-from-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        const data = await response.json();
        if (data.success && data.topics) {
            renderTrendingCards(data.topics);
        }
    } catch (error) {
        showToast('提取失败', 'error');
    }
}

function renderTrendingCards(topics) {
    const grid = document.getElementById('trending-grid');
    grid.innerHTML = '';
    selectedTopics.clear();
    updateBatchActionState();
    updateSelectAllButtonState();

    currentTopics = topics; // 保存当前主题列表

    topics.forEach((topic, index) => {
        const card = document.createElement('div');
        card.className = 'topic-card';
        card.innerHTML = `
            <div class="card-check">✓</div>
            <div class="card-title">${topic.title}</div>
            <div class="card-summary">${topic.summary}</div>
        `;

        card.onclick = () => toggleTopicSelection(card, topic);
        grid.appendChild(card);

        // 动画入场
        card.style.animation = `slideInUp 0.5s ease backwards ${index * 0.05}s`;
    });

    // 显示全选工具栏
    const toolbar = document.getElementById('topic-toolbar');
    if (topics.length > 0) {
        toolbar.style.display = 'flex';
    } else {
        toolbar.style.display = 'none';
    }
}

function toggleTopicSelection(card, topic) {
    if (selectedTopics.has(topic)) {
        selectedTopics.delete(topic);
        card.classList.remove('selected');
    } else {
        selectedTopics.add(topic);
        card.classList.add('selected');
    }
    updateBatchActionState();
    updateSelectAllButtonState();
}

// 当前渲染的主题列表（用于全选）
let currentTopics = [];

function toggleSelectAll() {
    const cards = document.querySelectorAll('.topic-card');
    const allSelected = selectedTopics.size === currentTopics.length && currentTopics.length > 0;

    if (allSelected) {
        // 取消全选
        selectedTopics.clear();
        cards.forEach(card => card.classList.remove('selected'));
    } else {
        // 全选
        currentTopics.forEach(topic => selectedTopics.add(topic));
        cards.forEach(card => card.classList.add('selected'));
    }
    updateBatchActionState();
    updateSelectAllButtonState();
}

function updateSelectAllButtonState() {
    const btn = document.getElementById('btn-select-all');
    if (!btn) return;

    const allSelected = selectedTopics.size === currentTopics.length && currentTopics.length > 0;
    if (allSelected) {
        btn.innerHTML = '<span class="icon">✕</span> 取消全选';
    } else {
        btn.innerHTML = '<span class="icon">✓</span> 全选所有';
    }
}

function updateBatchActionState() {
    const bar = document.getElementById('batch-actions');
    const count = selectedTopics.size;

    document.getElementById('selected-count').textContent = `已选 ${count} 项`;

    if (count > 0) {
        bar.style.display = 'flex';
    } else {
        bar.style.display = 'none';
    }
}

async function batchGenerate() {
    if (selectedTopics.size === 0) return;

    const topics = Array.from(selectedTopics).map(t => t.title);
    showToast(`开始批量生成 ${topics.length} 个任务`, 'success');

    // 切换到创作中心查看进度
    switchView('home');

    // 这里简单处理，实际应该有批量任务的 UI
    // 暂时只演示第一个
    const topicInput = document.getElementById('topic-input');
    topicInput.value = topics[0];
    startGenerate();
}

// --- 配置管理 ---
async function loadConfig() {
    try {
        const res = await fetch(`${API_BASE}/config`);
        const data = await res.json();
        if (data.success && data.config) {
            const c = data.config;
            if (c.llm_api_key) document.getElementById('llm_api_key').placeholder = '已配置 (******)';
            if (c.openai_base_url) document.getElementById('openai_base_url').value = c.openai_base_url;
            if (c.default_model) document.getElementById('default_model').value = c.default_model;
            if (c.xhs_mcp_url) document.getElementById('xhs_mcp_url').value = c.xhs_mcp_url;
        }
    } catch (e) {
        console.error('Config load failed', e);
    }
}

async function saveConfig() {
    const config = {
        llm_api_key: document.getElementById('llm_api_key').value,
        openai_base_url: document.getElementById('openai_base_url').value,
        default_model: document.getElementById('default_model').value,
        xhs_mcp_url: document.getElementById('xhs_mcp_url').value,
        jina_api_key: document.getElementById('jina_api_key').value,
        tavily_api_key: document.getElementById('tavily_api_key').value
    };

    try {
        const res = await fetch(`${API_BASE}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        const data = await res.json();
        if (data.success) {
            showToast('配置已保存', 'success');
            closeModal();
        }
    } catch (e) {
        showToast('保存失败', 'error');
    }
}

async function validateModel() {
    const status = document.getElementById('model-status');
    status.textContent = '验证中...';
    status.style.color = 'var(--color-text-muted)';

    try {
        const res = await fetch(`${API_BASE}/validate-model`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                llm_api_key: document.getElementById('llm_api_key').value,
                openai_base_url: document.getElementById('openai_base_url').value,
                model_name: document.getElementById('default_model').value
            })
        });
        const data = await res.json();
        if (data.success) {
            status.textContent = '✓ 可用';
            status.style.color = '#4caf50';
        } else {
            status.textContent = '✗ 不可用';
            status.style.color = '#f44336';
        }
    } catch (e) {
        status.textContent = '验证出错';
        status.style.color = '#f44336';
    }
}

// --- 历史记录 ---
// --- 历史记录 ---
let allHistoryData = [];

async function loadTaskHistory() {
    const list = document.getElementById('history-list');
    list.innerHTML = '<div style="text-align:center;padding:20px;">加载中...</div>';

    try {
        const res = await fetch(`${API_BASE}/history?limit=20`);
        const data = await res.json();

        if (data.success) {
            allHistoryData = data.data || [];
            // 默认显示全部
            applyFilter('all');
        } else {
            list.innerHTML = '<div style="text-align:center;padding:20px;color:gray;">暂无历史记录</div>';
        }
    } catch (e) {
        list.innerHTML = '加载失败';
    }
}

function applyFilter(status) {
    // 更新按钮状态
    document.querySelectorAll('.segment-btn').forEach(btn => {
        if (btn.textContent === '全部' && status === 'all') btn.classList.add('active');
        else if (btn.textContent === '成功' && status === 'success') btn.classList.add('active');
        else if (btn.textContent === '失败' && status === 'error') btn.classList.add('active');
        else btn.classList.remove('active');
    });

    // 筛选数据
    let filteredData = allHistoryData;
    if (status !== 'all') {
        filteredData = allHistoryData.filter(task => task.status === status);
    }

    renderHistoryList(filteredData);
}

function renderHistoryList(tasks) {
    const list = document.getElementById('history-list');

    if (tasks.length === 0) {
        list.innerHTML = '<div style="text-align:center;padding:20px;color:gray;">暂无相关记录</div>';
        return;
    }

    list.innerHTML = tasks.map(task => `
        <div class="history-item">
            <div class="history-info">
                <h4>${task.topic}</h4>
                <div class="history-meta">
                    ${new Date(task.created_at).toLocaleString()}
                    <span class="history-status ${task.status}">${task.status}</span>
                </div>
            </div>
            <button class="btn-text" onclick='showResultModal(${JSON.stringify(task)})'>查看</button>
        </div>
    `).join('');
}

// --- 工具函数 ---
function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
