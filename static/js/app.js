const API_BASE = '/api';

// 防抖函数
let modelValidationTimeout = null;

// 任务管理 - 重新设计
let taskCardMap = {}; // { taskId: cardId } 映射任务ID到卡片ID

// 折叠面板
function togglePanel(panelId) {
    let panel, toggle;

    if (panelId === 'history') {
        panel = document.getElementById('history-panel-body');
        toggle = document.getElementById('history-toggle');
    } else {
        panel = document.getElementById(`${panelId}-panel`);
        toggle = document.getElementById(`${panelId}-toggle`);
    }

    if (!panel || !toggle) return;

    panel.classList.toggle('collapsed');
    toggle.classList.toggle('collapsed');
    toggle.textContent = panel.classList.contains('collapsed') ? '▶' : '▼';
}

// 验证模型是否可用
async function validateModel() {
    const apiKey = document.getElementById('llm_api_key').value.trim();
    const baseUrl = document.getElementById('openai_base_url').value.trim();
    const modelName = document.getElementById('default_model').value.trim();
    const statusEl = document.getElementById('model-validation-status');

    // 清空之前的状态
    statusEl.textContent = '';
    statusEl.className = 'validation-status';

    // 检查必填字段
    if (!apiKey || !baseUrl || !modelName) {
        return;
    }

    // 显示验证中状态
    statusEl.textContent = '验证中...';
    statusEl.className = 'validation-status validating';

    try {
        const response = await fetch(`${API_BASE}/validate-model`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                llm_api_key: apiKey,
                openai_base_url: baseUrl,
                model_name: modelName
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            statusEl.textContent = '✓ 模型可用';
            statusEl.className = 'validation-status valid';
        } else {
            statusEl.textContent = `✗ ${data.detail || '模型验证失败'}`;
            statusEl.className = 'validation-status invalid';
        }
    } catch (error) {
        statusEl.textContent = `✗ 验证失败: ${error.message}`;
        statusEl.className = 'validation-status invalid';
    }
}

// 防抖验证模型
function debounceValidateModel() {
    if (modelValidationTimeout) {
        clearTimeout(modelValidationTimeout);
    }
    modelValidationTimeout = setTimeout(validateModel, 800);
}

// 显示Toast消息
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');

    const icons = {
        success: '✅',
        error: '❌',
        info: 'ℹ️'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type]}</span>
        <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// 加载配置
async function loadConfig() {
    try {
        const response = await fetch(`${API_BASE}/config`);
        const data = await response.json();

        if (data.success && data.config) {
            const config = data.config;

            // 填充表单(只填充非空值)
            if (config.llm_api_key) {
                document.getElementById('llm_api_key').value = config.llm_api_key;
                // 如果是脱敏值,设置占位符提示
                if (config.llm_api_key.includes('*')) {
                    document.getElementById('llm_api_key').placeholder = '已配置(留空不修改)';
                }
            }

            if (config.openai_base_url) {
                document.getElementById('openai_base_url').value = config.openai_base_url;
            }

            if (config.default_model) {
                document.getElementById('default_model').value = config.default_model;
            }

            if (config.jina_api_key) {
                document.getElementById('jina_api_key').value = config.jina_api_key;
                if (config.jina_api_key.includes('*')) {
                    document.getElementById('jina_api_key').placeholder = '已配置(留空不修改)';
                }
            }

            if (config.tavily_api_key) {
                document.getElementById('tavily_api_key').value = config.tavily_api_key;
                if (config.tavily_api_key.includes('*')) {
                    document.getElementById('tavily_api_key').placeholder = '已配置(留空不修改)';
                }
            }

            if (config.xhs_mcp_url) {
                document.getElementById('xhs_mcp_url').value = config.xhs_mcp_url;
            }
        }
    } catch (error) {
        console.error('加载配置失败:', error);
    }
}

// 保存配置
async function saveConfig() {
    const config = {};

    // 只收集非空且非脱敏占位符的值
    const llmApiKey = document.getElementById('llm_api_key').value.trim();
    const openaiBaseUrl = document.getElementById('openai_base_url').value.trim();
    const defaultModel = document.getElementById('default_model').value.trim();
    const jinaApiKey = document.getElementById('jina_api_key').value.trim();
    const tavilyApiKey = document.getElementById('tavily_api_key').value.trim();
    const xhsMcpUrl = document.getElementById('xhs_mcp_url').value.trim();

    // 只添加非空且不包含*的字段(排除脱敏占位符)
    if (llmApiKey && !llmApiKey.includes('*')) config.llm_api_key = llmApiKey;
    if (openaiBaseUrl) config.openai_base_url = openaiBaseUrl;
    if (defaultModel) config.default_model = defaultModel;
    if (jinaApiKey && !jinaApiKey.includes('*')) config.jina_api_key = jinaApiKey;
    if (tavilyApiKey && !tavilyApiKey.includes('*')) config.tavily_api_key = tavilyApiKey;
    if (xhsMcpUrl) config.xhs_mcp_url = xhsMcpUrl;

    // 检查是否有要保存的配置
    if (Object.keys(config).length === 0) {
        showToast('没有需要保存的配置', 'info');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });

        const data = await response.json();

        if (data.success) {
            showToast(data.message || '配置保存成功', 'success');
            // 重新加载配置以获取最新的脱敏值
            await loadConfig();
        } else {
            showToast(data.error || '保存失败', 'error');
        }
    } catch (error) {
        showToast(`保存失败：${error.message}`, 'error');
    }
}

// 测试连接
async function testConnection() {
    const xhsMcpUrl = document.getElementById('xhs_mcp_url').value.trim();

    if (!xhsMcpUrl) {
        showToast('请先填写小红书MCP服务地址', 'error');
        return;
    }

    showToast('正在测试连接...', 'info');

    try {
        const response = await fetch(`${API_BASE}/test-login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ xhs_mcp_url: xhsMcpUrl })
        });

        const data = await response.json();

        if (data.success) {
            showToast('连接成功！', 'success');
        } else {
            showToast(data.error || '连接失败', 'error');
        }
    } catch (error) {
        showToast(`测试失败：${error.message}`, 'error');
    }
}

// 更新进度 - 支持任务ID参数
function updateProgress(taskIdOrPercent, percentOrText, textOrUndefined) {
    let taskId, percent, text;

    // 兼容旧的调用方式 updateProgress(percent, text)
    if (typeof taskIdOrPercent === 'number' && typeof percentOrText === 'string') {
        // 旧方式：updateProgress(10, '开始...')
        taskId = null;
        percent = taskIdOrPercent;
        text = percentOrText;
    } else {
        // 新方式：updateProgress(taskId, 10, '开始...')
        taskId = taskIdOrPercent;
        percent = percentOrText;
        text = textOrUndefined;
    }

    // 如果没有taskId，检查当前任务的taskId
    if (!taskId) {
        const currentTopicEl = document.getElementById('current-topic');
        taskId = currentTopicEl ? currentTopicEl.dataset.taskId : null;
    }

    // 更新当前任务显示（如果是当前任务）
    const currentTopicEl = document.getElementById('current-topic');
    if (currentTopicEl && currentTopicEl.dataset.taskId === taskId) {
        document.getElementById('progress-value').style.width = `${percent}%`;
        document.getElementById('progress-text').textContent = text;
    }

    // 更新历史卡片（如果任务在历史中）
    if (taskId && taskCardMap[taskId]) {
        const cardId = taskCardMap[taskId];
        const card = document.getElementById(cardId);
        if (card) {
            // 更新进度条
            const progressBar = card.querySelector('.task-card-progress-value');
            if (progressBar) {
                progressBar.style.width = `${percent}%`;
            }

            // 更新进度文字
            const progressText = card.querySelector('.task-card-progress-text');
            if (progressText) {
                progressText.textContent = text;
            }

            // 更新状态
            let status = 'running';
            let statusIcon = '⏳';
            if (percent === 100) {
                status = 'success';
                statusIcon = '✅';
            } else if (text.includes('失败') || text.includes('错误')) {
                status = 'error';
                statusIcon = '❌';
            }

            card.className = `task-card ${status}`;
            const statusEl = card.querySelector('.task-card-status');
            if (statusEl) {
                statusEl.textContent = statusIcon;
            }

            // 如果变成错误状态，确保重试按钮显示
            if (status === 'error') {
                const retryDiv = card.querySelector('.task-card-retry');
                if (retryDiv) {
                    retryDiv.style.display = 'block';
                }
            }
        }
    }
}

// 将当前任务添加到历史
function moveCurrentToHistory() {
    const currentTopicEl = document.getElementById('current-topic');
    const currentTopic = currentTopicEl.textContent;
    const currentTaskId = currentTopicEl.dataset.taskId;
    const currentProgress = parseInt(document.getElementById('progress-value').style.width) || 0;
    const currentText = document.getElementById('progress-text').textContent;

    // 如果当前任务不是初始状态，才添加到历史
    if (currentTopic !== '等待任务开始...' && currentTaskId) {
        const historyPanel = document.getElementById('history-panel');
        const historyContainer = document.getElementById('task-history');

        // 显示历史面板
        historyPanel.style.display = 'block';

        // 判断状态
        let status = 'running';
        let statusIcon = '⏳';
        if (currentProgress === 100) {
            status = 'success';
            statusIcon = '✅';
        } else if (currentText.includes('失败') || currentText.includes('错误')) {
            status = 'error';
            statusIcon = '❌';
        }

        // 创建历史卡片，使用唯一ID
        const cardId = 'task-card-' + Date.now();
        const card = document.createElement('div');
        card.id = cardId;
        card.className = `task-card ${status}`;
        card.dataset.topic = currentTopic; // 保存主题用于重试

        // 调试日志
        console.log('创建任务卡片:', {
            cardId,
            topic: currentTopic,
            status,
            className: card.className,
            progress: currentProgress,
            text: currentText
        });

        card.innerHTML = `
            <div class="task-card-header">
                <div class="task-card-topic" title="${currentTopic}">${currentTopic}</div>
                <div class="task-card-status">${statusIcon}</div>
                <div class="task-card-delete" onclick="deleteTask('${cardId}')" title="删除任务">×</div>
            </div>
            <div class="task-card-progress">
                <div class="task-card-progress-bar">
                    <div class="task-card-progress-value" style="width: ${currentProgress}%"></div>
                </div>
                <div class="task-card-progress-text">${currentText}</div>
            </div>
            <div class="task-card-retry">
                <button class="btn-retry" onclick="retryTask('${cardId}')">🔄 重试</button>
            </div>
        `;

        // 插入到最前面
        historyContainer.insertBefore(card, historyContainer.firstChild);

        // 如果是错误状态，确保重试按钮显示
        if (status === 'error') {
            const retryDiv = card.querySelector('.task-card-retry');
            if (retryDiv) {
                retryDiv.style.display = 'block';
            }
        }

        // 建立任务ID到卡片ID的映射
        taskCardMap[currentTaskId] = cardId;

        // 自动滚动到历史面板
        setTimeout(() => {
            historyPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
    }
}

// 开始生成 - 带任务ID追踪
async function startGenerate() {
    const topic = document.getElementById('topic').value.trim();

    if (!topic) {
        showToast('请输入主题', 'error');
        return;
    }

    // 执行生成任务
    await executeGenerate(topic);
}

// 删除任务
function deleteTask(cardId) {
    const card = document.getElementById(cardId);
    if (!card) {
        showToast('任务卡片不存在', 'error');
        return;
    }

    // 添加淡出动画
    card.style.opacity = '0';
    card.style.transform = 'translateX(-20px)';

    // 延迟删除以显示动画
    setTimeout(() => {
        card.remove();

        // 从映射中删除
        for (let taskId in taskCardMap) {
            if (taskCardMap[taskId] === cardId) {
                delete taskCardMap[taskId];
                break;
            }
        }

        // 如果没有历史卡片了，隐藏历史面板
        const historyContainer = document.getElementById('task-history');
        if (historyContainer && historyContainer.children.length === 0) {
            const historyPanel = document.getElementById('history-panel');
            if (historyPanel) {
                historyPanel.style.display = 'none';
            }
        }

        showToast('任务已删除', 'info');
    }, 300);
}

// 重试任务
async function retryTask(cardId) {
    const card = document.getElementById(cardId);
    if (!card) {
        showToast('任务卡片不存在', 'error');
        return;
    }

    // 获取保存的主题
    const topic = card.dataset.topic;
    if (!topic) {
        showToast('未找到任务主题', 'error');
        return;
    }

    // 将当前任务移到历史（如果有的话）
    moveCurrentToHistory();

    // 移除旧的卡片
    card.remove();

    // 执行生成任务
    await executeGenerate(topic);
}

// 执行生成任务的核心逻辑
async function executeGenerate(topic) {
    // 创建新任务ID
    const taskId = 'task-' + Date.now();

    // 将当前任务移到历史
    moveCurrentToHistory();

    // 更新当前任务，保存任务ID
    const currentTopicEl = document.getElementById('current-topic');
    currentTopicEl.textContent = topic;
    currentTopicEl.dataset.taskId = taskId;

    // 清空输入框
    document.getElementById('topic').value = '';

    // 隐藏结果面板
    document.getElementById('result-panel').style.display = 'none';

    // 开始进度
    updateProgress(taskId, 10, '开始生成内容...');

    try {
        const response = await fetch(`${API_BASE}/generate-and-publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic })
        });

        // 模拟进度更新
        updateProgress(taskId, 30, '正在检索相关信息...');
        await sleep(800);

        updateProgress(taskId, 50, '正在生成文章内容...');
        await sleep(800);

        updateProgress(taskId, 70, '正在优化内容...');
        await sleep(800);

        updateProgress(taskId, 90, '正在发布到小红书...');

        const data = await response.json();

        if (data.success) {
            updateProgress(taskId, 100, '发布成功！');
            await sleep(500);
            showResult(data.data);
            showToast('内容生成并发布成功', 'success');
        } else {
            updateProgress(taskId, 0, data.error || '生成失败');
            showToast(data.error || '生成失败', 'error');
        }
    } catch (error) {
        updateProgress(taskId, 0, `操作失败: ${error.message}`);
        showToast(`操作失败：${error.message}`, 'error');
    }
}

// 显示结果
function showResult(data) {
    const resultPanel = document.getElementById('result-panel');
    resultPanel.style.display = 'block';

    // 滚动到结果面板
    resultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // 填充数据
    document.getElementById('result-title').textContent = data.title || '无标题';
    document.getElementById('result-content').textContent = data.content || '无内容';
    document.getElementById('result-time').textContent = data.publish_time || new Date().toLocaleString('zh-CN');

    // 标签
    const tagsEl = document.getElementById('result-tags');
    tagsEl.innerHTML = '';
    if (data.tags && data.tags.length > 0) {
        data.tags.forEach(tag => {
            const tagEl = document.createElement('span');
            tagEl.className = 'tag-item';
            tagEl.textContent = tag;
            tagsEl.appendChild(tagEl);
        });
    } else {
        tagsEl.textContent = '无标签';
    }

    // 图片
    const imagesEl = document.getElementById('result-images');
    imagesEl.innerHTML = '';
    if (data.images && data.images.length > 0) {
        data.images.forEach(url => {
            const imgEl = document.createElement('div');
            imgEl.className = 'img-item';
            imgEl.innerHTML = `
                <img src="${url}" alt="配图" onerror="this.style.display='none'">
                <a href="${url}" target="_blank" class="img-link">${url}</a>
            `;
            imagesEl.appendChild(imgEl);
        });
    } else {
        imagesEl.textContent = '无配图';
    }
}

// 辅助函数：延迟
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 快捷键：Ctrl/Cmd + Enter
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const topicInput = document.getElementById('topic');
        if (document.activeElement === topicInput) {
            startGenerate();
        }
    }
});

// 从服务器加载历史记录
async function loadTaskHistory(startDate = null, endDate = null, status = null) {
    try {
        let url = `${API_BASE}/history?limit=50`;
        if (startDate) url += `&start_date=${startDate}`;
        if (endDate) url += `&end_date=${endDate}`;
        if (status) url += `&status=${status}`;

        const response = await fetch(url);
        const data = await response.json();

        const historyPanel = document.getElementById('history-panel');
        const historyContainer = document.getElementById('task-history');

        // 清空现有历史
        historyContainer.innerHTML = '';

        if (data.success && data.data && data.data.length > 0) {
            // 显示历史面板
            historyPanel.style.display = 'block';

            // 按日期分组
            const tasksByDate = groupTasksByDate(data.data);

            // 渲染分组后的历史记录
            renderGroupedTasks(tasksByDate);

            console.log(`加载了 ${data.data.length} 条历史记录`);
        } else if (data.success && (!data.data || data.data.length === 0)) {
            // 没有数据，显示提示信息
            historyPanel.style.display = 'block';
            historyContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #909399;">暂无任务记录</div>';
        } else {
            // 请求失败
            showToast('加载历史记录失败', 'error');
        }
    } catch (error) {
        console.error('加载历史记录失败:', error);
        showToast('加载历史记录失败: ' + error.message, 'error');
    }
}

// 按日期分组任务
function groupTasksByDate(tasks) {
    const groups = {};

    tasks.forEach(task => {
        // 提取日期部分（格式：2025/11/5）
        let dateKey = '未知日期';
        if (task.created_at) {
            const date = new Date(task.created_at);
            dateKey = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
        }

        if (!groups[dateKey]) {
            groups[dateKey] = [];
        }
        groups[dateKey].push(task);
    });

    // 按日期排序（最新的在前）
    const sortedDates = Object.keys(groups).sort((a, b) => {
        if (a === '未知日期') return 1;
        if (b === '未知日期') return -1;
        return new Date(b) - new Date(a);
    });

    return sortedDates.map(date => ({
        date: date,
        tasks: groups[date]
    }));
}

// 渲染分组后的任务
function renderGroupedTasks(groupedTasks) {
    const historyContainer = document.getElementById('task-history');

    groupedTasks.forEach((group, index) => {
        // 创建日期分组容器
        const dateGroup = document.createElement('div');
        dateGroup.className = 'date-group collapsed'; // 默认折叠
        const groupId = `date-group-${index}`;
        dateGroup.id = groupId;

        // 创建日期标题
        const dateHeader = document.createElement('div');
        dateHeader.className = 'date-header';

        // 格式化日期显示
        const dateTitle = formatDateTitle(group.date);
        dateHeader.innerHTML = `
            <div class="date-header-left">
                <span class="date-toggle">▶</span>
                <span class="date-label">${dateTitle}</span>
                <span class="date-count">${group.tasks.length} 个任务</span>
            </div>
        `;

        // 添加点击事件来折叠/展开
        dateHeader.addEventListener('click', () => {
            toggleDateGroup(groupId);
        });

        dateGroup.appendChild(dateHeader);

        // 创建任务列表容器
        const tasksContainer = document.createElement('div');
        tasksContainer.className = 'date-tasks';
        tasksContainer.style.maxHeight = '0'; // 初始高度为0（折叠状态）

        // 添加每个任务卡片
        group.tasks.forEach(task => {
            const card = createTaskCardElement(task);
            tasksContainer.appendChild(card);
        });

        dateGroup.appendChild(tasksContainer);
        historyContainer.appendChild(dateGroup);
    });
}

// 折叠/展开日期分组
function toggleDateGroup(groupId) {
    const dateGroup = document.getElementById(groupId);
    if (!dateGroup) return;

    const tasksContainer = dateGroup.querySelector('.date-tasks');
    const toggleIcon = dateGroup.querySelector('.date-toggle');

    if (dateGroup.classList.contains('collapsed')) {
        // 展开
        dateGroup.classList.remove('collapsed');
        tasksContainer.style.maxHeight = tasksContainer.scrollHeight + 'px';
        toggleIcon.textContent = '▼';

        // 动画完成后移除 max-height，以便内容能动态调整
        setTimeout(() => {
            if (!dateGroup.classList.contains('collapsed')) {
                tasksContainer.style.maxHeight = 'none';
            }
        }, 300);
    } else {
        // 折叠
        tasksContainer.style.maxHeight = tasksContainer.scrollHeight + 'px';
        // 强制浏览器重绘
        tasksContainer.offsetHeight;
        tasksContainer.style.maxHeight = '0';
        toggleIcon.textContent = '▶';
        dateGroup.classList.add('collapsed');
    }
}

// 格式化日期标题
function formatDateTitle(dateStr) {
    if (dateStr === '未知日期') return dateStr;

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const date = new Date(dateStr);
    const dateKey = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
    const todayKey = `${today.getFullYear()}/${today.getMonth() + 1}/${today.getDate()}`;
    const yesterdayKey = `${yesterday.getFullYear()}/${yesterday.getMonth() + 1}/${yesterday.getDate()}`;

    if (dateKey === todayKey) {
        return `今天 (${dateStr})`;
    } else if (dateKey === yesterdayKey) {
        return `昨天 (${dateStr})`;
    } else {
        return dateStr;
    }
}

// 创建任务卡片元素（返回DOM元素）
function createTaskCardElement(task) {
    const cardId = task.id || 'task-card-' + Date.now();

    // 判断状态
    let status = task.status || 'running';
    let statusIcon = '⏳';
    if (status === 'success') {
        statusIcon = '✅';
    } else if (status === 'error') {
        statusIcon = '❌';
    }

    const card = document.createElement('div');
    card.id = cardId;
    card.className = `task-card ${status}`;
    card.dataset.topic = task.topic;
    card.dataset.taskId = task.id;

    // 格式化时间（仅显示时:分）
    let displayTime = '';
    if (task.created_at) {
        const date = new Date(task.created_at);
        displayTime = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }

    // 转义HTML特殊字符
    const escapeTopic = task.topic.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    card.innerHTML = `
        <div class="task-card-header">
            <div class="task-card-topic" title="${escapeTopic}">${escapeTopic}</div>
            <div class="task-card-status">${statusIcon}</div>
            <div class="task-card-delete" onclick="deleteTaskFromServer('${task.id}')" title="删除任务">×</div>
        </div>
        <div class="task-card-progress">
            <div class="task-card-progress-bar">
                <div class="task-card-progress-value" style="width: ${task.progress || 0}%"></div>
            </div>
            <div class="task-card-progress-text">${task.message || ''}</div>
            ${displayTime ? `<div class="task-card-time">${displayTime}</div>` : ''}
        </div>
        <div class="task-card-retry">
            <button class="btn-retry">🔄 重试</button>
        </div>
    `;

    // 添加重试按钮事件监听器（避免onclick中的字符串转义问题）
    const retryBtn = card.querySelector('.btn-retry');
    if (retryBtn) {
        retryBtn.addEventListener('click', () => {
            retryTaskFromHistory(task.id, task.topic);
        });
    }

    // 如果是错误状态，确保重试按钮显示
    if (status === 'error') {
        const retryDiv = card.querySelector('.task-card-retry');
        if (retryDiv) {
            retryDiv.style.display = 'block';
        }
    }

    return card;
}

// 从服务器删除任务
async function deleteTaskFromServer(taskId) {
    try {
        const response = await fetch(`${API_BASE}/history/${taskId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            // 从DOM中移除
            const card = document.querySelector(`[data-task-id="${taskId}"]`);
            if (card) {
                card.style.opacity = '0';
                card.style.transform = 'translateX(-20px)';

                setTimeout(() => {
                    card.remove();

                    // 如果没有历史卡片了，隐藏历史面板
                    const historyContainer = document.getElementById('task-history');
                    if (historyContainer && historyContainer.children.length === 0) {
                        const historyPanel = document.getElementById('history-panel');
                        if (historyPanel) {
                            historyPanel.style.display = 'none';
                        }
                    }
                }, 300);
            }

            showToast('任务已删除', 'info');
        } else {
            showToast('删除失败', 'error');
        }
    } catch (error) {
        console.error('删除任务失败:', error);
        showToast('删除失败: ' + error.message, 'error');
    }
}

// 从历史记录重试任务
async function retryTaskFromHistory(taskId, topic) {
    // 将当前任务移到历史
    moveCurrentToHistory();

    // 删除旧的失败记录（从服务器和DOM）
    try {
        const response = await fetch(`${API_BASE}/history/${taskId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            // 从DOM中移除（静默删除，不显示toast）
            const card = document.querySelector(`[data-task-id="${taskId}"]`);
            if (card) {
                card.remove();
            }
        }
    } catch (error) {
        console.error('删除旧任务记录失败:', error);
        // 即使删除失败，也继续执行重试
    }

    // 执行生成任务
    await executeGenerate(topic);
}

// 应用筛选器
function applyFilter() {
    const startDate = document.getElementById('filter-start-date').value;
    const endDate = document.getElementById('filter-end-date').value;
    const status = document.getElementById('filter-status').value;

    loadTaskHistory(startDate, endDate, status);
}

// 重置筛选器
function resetFilter() {
    document.getElementById('filter-start-date').value = '';
    document.getElementById('filter-end-date').value = '';
    document.getElementById('filter-status').value = '';

    loadTaskHistory();
}

// 存储热点主题数据
let trendingTopics = [];
let selectedTopics = new Set();

// 按领域获取热点主题
async function fetchTrendingTopicsByDomain(domain) {
    const container = document.getElementById('trending-topics-container');
    const actionsDiv = document.getElementById('trending-actions');

    // 更新按钮状态
    document.querySelectorAll('.domain-tag').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    // 显示加载状态
    container.innerHTML = '<p class="trending-hint">正在获取 ' + domain + ' 领域热点主题...</p>';
    actionsDiv.style.display = 'none';

    showToast(`正在获取 ${domain} 领域热点主题，请稍候...`, 'info');

    try {
        const response = await fetch(`${API_BASE}/fetch-trending-topics`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain: domain })
        });

        const data = await response.json();

        if (data.success && data.topics && data.topics.length > 0) {
            trendingTopics = data.topics;
            renderTrendingTopics(data.topics);
            showToast(`成功获取 ${data.topics.length} 个${domain}领域热点主题`, 'success');
        } else {
            container.innerHTML = `<p class="trending-hint">未能获取${domain}领域热点主题，请稍后重试</p>`;
            showToast(`未能获取${domain}领域热点主题`, 'error');
        }
    } catch (error) {
        container.innerHTML = '<p class="trending-hint">获取失败，请检查网络连接</p>';
        showToast(`获取失败：${error.message}`, 'error');
    }
}

// 从URL提取主题
async function fetchTopicsFromUrl() {
    const urlInput = document.getElementById('url-input');
    const url = urlInput.value.trim();

    if (!url) {
        showToast('请输入网页链接', 'error');
        return;
    }

    // 简单验证URL格式
    try {
        new URL(url);
    } catch (e) {
        showToast('请输入有效的网页链接', 'error');
        return;
    }

    const container = document.getElementById('trending-topics-container');
    const actionsDiv = document.getElementById('trending-actions');

    // 清除领域标签的选中状态
    document.querySelectorAll('.domain-tag').forEach(btn => {
        btn.classList.remove('active');
    });

    // 显示加载状态
    container.innerHTML = '<p class="trending-hint">正在爬取网页内容并提取主题...</p>';
    actionsDiv.style.display = 'none';

    showToast('正在爬取网页内容，请稍候...', 'info');

    try {
        const response = await fetch(`${API_BASE}/fetch-topics-from-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url })
        });

        const data = await response.json();

        if (data.success && data.topics && data.topics.length > 0) {
            trendingTopics = data.topics;
            renderTrendingTopics(data.topics);
            showToast(`成功从网页提取 ${data.topics.length} 个主题`, 'success');
            // 清空输入框
            urlInput.value = '';
        } else {
            container.innerHTML = '<p class="trending-hint">未能从该网页提取主题，请检查链接是否正确</p>';
            showToast(data.error || '未能提取主题', 'error');
        }
    } catch (error) {
        container.innerHTML = '<p class="trending-hint">提取失败，请检查网络连接或链接是否正确</p>';
        showToast(`提取失败：${error.message}`, 'error');
    }
}

// 渲染热点主题列表
function renderTrendingTopics(topics) {
    const container = document.getElementById('trending-topics-container');
    const actionsDiv = document.getElementById('trending-actions');

    container.innerHTML = '';
    selectedTopics.clear();

    topics.forEach((topic, index) => {
        const topicItem = document.createElement('div');
        topicItem.className = 'topic-item';
        topicItem.dataset.index = index;

        topicItem.innerHTML = `
            <div class="topic-item-header">
                <input type="checkbox" class="topic-checkbox" id="topic-${index}">
                <label class="topic-title" for="topic-${index}">${topic.title}</label>
            </div>
            <div class="topic-summary">${topic.summary}</div>
        `;

        // 添加点击事件
        const checkbox = topicItem.querySelector('.topic-checkbox');
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                selectedTopics.add(index);
                topicItem.classList.add('selected');
            } else {
                selectedTopics.delete(index);
                topicItem.classList.remove('selected');
            }
            updateSelectedCount();
        });

        // 点击整个卡片也能选择
        topicItem.addEventListener('click', (e) => {
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change'));
            }
        });

        container.appendChild(topicItem);
    });

    actionsDiv.style.display = 'flex';
    updateSelectedCount();
}

// 更新选中数量显示
function updateSelectedCount() {
    const countEl = document.getElementById('selected-count');
    countEl.textContent = `已选择 ${selectedTopics.size} 个主题`;

    // 更新全选按钮状态
    const selectAllBtn = document.querySelector('.btn-select-all');
    if (selectAllBtn) {
        if (selectedTopics.size === trendingTopics.length && trendingTopics.length > 0) {
            selectAllBtn.classList.add('all-selected');
            selectAllBtn.textContent = '✓ 已全选';
        } else {
            selectAllBtn.classList.remove('all-selected');
            selectAllBtn.textContent = '✓ 全选';
        }
    }

    // 同步更新到当前任务区域
    updateCurrentTaskDisplay();
}

// 更新当前任务显示区域
function updateCurrentTaskDisplay() {
    const currentTopicEl = document.getElementById('current-topic');
    const progressTextEl = document.getElementById('progress-text');
    const progressValueEl = document.getElementById('progress-value');

    if (selectedTopics.size === 0) {
        currentTopicEl.textContent = '等待任务开始...';
        progressTextEl.textContent = '等待任务开始...';
        progressValueEl.style.width = '0%';
    } else {
        const selectedTopicTitles = Array.from(selectedTopics).map(index => trendingTopics[index].title);

        if (selectedTopics.size === 1) {
            currentTopicEl.textContent = selectedTopicTitles[0];
            progressTextEl.textContent = '已选择 1 个主题，点击「批量生成选中主题」开始创作';
        } else {
            currentTopicEl.textContent = `已选择 ${selectedTopics.size} 个主题`;
            progressTextEl.textContent = `主题：${selectedTopicTitles.slice(0, 2).join('、')}${selectedTopics.size > 2 ? '...' : ''}`;
        }
        progressValueEl.style.width = '0%';
    }
}

// 全选/取消全选
function toggleSelectAll() {
    const allSelected = selectedTopics.size === trendingTopics.length && trendingTopics.length > 0;

    if (allSelected) {
        // 取消全选
        selectedTopics.clear();
        document.querySelectorAll('.topic-checkbox').forEach(checkbox => {
            checkbox.checked = false;
        });
        document.querySelectorAll('.topic-item').forEach(item => {
            item.classList.remove('selected');
        });
    } else {
        // 全选
        selectedTopics.clear();
        trendingTopics.forEach((topic, index) => {
            selectedTopics.add(index);
        });
        document.querySelectorAll('.topic-checkbox').forEach(checkbox => {
            checkbox.checked = true;
        });
        document.querySelectorAll('.topic-item').forEach(item => {
            item.classList.add('selected');
        });
    }

    updateSelectedCount();
}

// 批量生成选中的主题
async function batchGenerate() {
    if (selectedTopics.size === 0) {
        showToast('请先选择至少一个主题', 'error');
        return;
    }

    // 获取选中的主题标题
    const selectedTopicTitles = Array.from(selectedTopics).map(index => trendingTopics[index].title);

    // 确认对话框
    if (!confirm(`确定要批量生成并发布 ${selectedTopicTitles.length} 个主题吗？`)) {
        return;
    }

    // 更新当前任务区域显示批量处理状态
    const currentTopicEl = document.getElementById('current-topic');
    const progressTextEl = document.getElementById('progress-text');
    currentTopicEl.textContent = `批量生成 ${selectedTopicTitles.length} 个主题`;
    progressTextEl.textContent = '准备开始批量处理...';
    document.getElementById('progress-value').style.width = '0%';

    // 显示批量进度区域
    const container = document.getElementById('trending-topics-container');
    const progressHtml = `
        <div class="batch-progress">
            <div class="batch-progress-title">批量生成进度</div>
            <div class="batch-progress-bar">
                <div class="batch-progress-value" id="batch-progress-value" style="width: 0%"></div>
            </div>
            <div class="batch-progress-text" id="batch-progress-text">准备开始...</div>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', progressHtml);

    showToast(`开始批量处理 ${selectedTopicTitles.length} 个主题...`, 'info');

    try {
        const response = await fetch(`${API_BASE}/batch-generate-and-publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topics: selectedTopicTitles })
        });

        // 模拟进度更新
        updateBatchProgress(30, '正在处理中...');
        await sleep(1000);

        updateBatchProgress(60, '继续处理中...');
        await sleep(1000);

        updateBatchProgress(90, '即将完成...');

        const data = await response.json();

        if (data.success) {
            updateBatchProgress(100, '批量处理完成！');

            const summary = data.summary;
            const message = `批量处理完成！成功 ${summary.success} 个，失败 ${summary.failed} 个`;
            showToast(message, summary.failed === 0 ? 'success' : 'info');

            // 显示详细结果
            setTimeout(() => {
                displayBatchResults(data.results);
            }, 1000);

            // 刷新历史记录
            loadTaskHistory();
        } else {
            updateBatchProgress(0, '批量处理失败');
            showToast('批量处理失败', 'error');
        }
    } catch (error) {
        updateBatchProgress(0, `批量处理失败: ${error.message}`);
        showToast(`批量处理失败：${error.message}`, 'error');
    }
}

// 更新批量进度
function updateBatchProgress(percent, text) {
    const progressValue = document.getElementById('batch-progress-value');
    const progressText = document.getElementById('batch-progress-text');

    if (progressValue) {
        progressValue.style.width = `${percent}%`;
    }
    if (progressText) {
        progressText.textContent = text;
    }

    // 同步更新"当前任务"面板
    document.getElementById('progress-value').style.width = `${percent}%`;
    document.getElementById('progress-text').textContent = text;
}

// 显示批量处理结果
function displayBatchResults(results) {
    const container = document.getElementById('trending-topics-container');

    let resultsHtml = '<div style="margin-top: 16px;"><h4 style="margin-bottom: 12px; color: #2c3e50;">处理结果：</h4>';

    results.forEach(result => {
        const statusIcon = result.status === 'success' ? '✅' : '❌';
        const statusClass = result.status === 'success' ? 'success' : 'error';

        resultsHtml += `
            <div class="topic-item ${statusClass}" style="cursor: default;">
                <div class="topic-item-header">
                    <span style="font-size: 18px;">${statusIcon}</span>
                    <div class="topic-title">${result.topic}</div>
                </div>
                ${result.status === 'error' ? `<div class="topic-summary" style="color: #f56c6c;">${result.error || '未知错误'}</div>` : ''}
            </div>
        `;
    });

    resultsHtml += '</div>';
    container.insertAdjacentHTML('beforeend', resultsHtml);
}

// 监听模型输入框的变化
document.addEventListener('DOMContentLoaded', () => {
    const modelInput = document.getElementById('default_model');
    const apiKeyInput = document.getElementById('llm_api_key');
    const baseUrlInput = document.getElementById('openai_base_url');

    if (modelInput) {
        modelInput.addEventListener('input', debounceValidateModel);
        apiKeyInput.addEventListener('input', debounceValidateModel);
        baseUrlInput.addEventListener('input', debounceValidateModel);
    }

    // 页面加载时加载配置和历史记录
    loadConfig();
    loadTaskHistory();
});