// ==UserScript==
// @name         Simple Auto Read
// @namespace    http://tampermonkey.net/
// @version      1.0.4
// @description  简化版自动阅读脚本
// @match        https://www.nodeloc.com/*
// @match        https://linux.do/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    // 站点独立存储
    const host = location.hostname;
    const siteMap = { 'www.nodeloc.com': 'nodeloc', 'linux.do': 'linuxdo' };
    const siteKey = siteMap[host] || 'nodeloc';
    const prefix = k => `${siteKey}_${k}`;

    // 配置
    const config = {
        commentLimit: 1000,
        topicListLimit: 50,
        likeLimit: 50,
        defaultScrollSpeed: 40,
        minScrollSpeed: 1,
        maxScrollSpeed: 200,
        scrollStep: 1,
        scrollDelay: 30,
        checkDelay: 800,
        retryDelay: 3000,
        maxRetries: 3,
        defaultLikeInterval: 2500,
        minLikeInterval: 1000,
        maxLikeInterval: 600000, // 10分钟
        likeIntervalStep: 5000   // 调整步长为5秒，方便用户调整
    };
    
    // 获取当前BASE_URL
    const possibleBaseURLs = ["https://www.nodeloc.com", "https://linux.do", "https://mjjbox.com"];
    const currentURL = window.location.href;
    let BASE_URL = possibleBaseURLs.find(url => currentURL.startsWith(url)) || possibleBaseURLs[0];

    // 存储初始化
    function initStorage() {
        if (GM_getValue(prefix("isFirstRun")) === undefined) {
            GM_setValue(prefix("read"), false);
            GM_setValue(prefix("autoLikeEnabled"), false);
            GM_setValue(prefix("clickCounter"), 0);
            GM_setValue(prefix("clickCounterTimestamp"), Date.now());
            GM_setValue(prefix("scrollSpeed"), config.defaultScrollSpeed);
            GM_setValue(prefix("likeInterval"), config.defaultLikeInterval);
            GM_setValue(prefix("isFirstRun"), false);
            GM_setValue(prefix("topicList"), JSON.stringify([]));
            GM_setValue(prefix("latestPage"), 0);
            GM_setValue(prefix("readHistory"), JSON.stringify([]));
        }
        const now = Date.now();
        const last = GM_getValue(prefix("clickCounterTimestamp")) || 0;
        if (now - last > 24 * 60 * 60 * 1000) {
            GM_setValue(prefix("clickCounter"), 0);
            GM_setValue(prefix("clickCounterTimestamp"), now);
        }
    }

    // 防重复：记录 & 检查
    function markAsRead(id) {
        let h = JSON.parse(GM_getValue(prefix("readHistory")) || "[]");
        if (!h.includes(id)) {
            h.unshift(id);
            if (h.length > 100) h.pop();
            GM_setValue(prefix("readHistory"), JSON.stringify(h));
        }
    }
    function isAlreadyRead(id) {
        return JSON.parse(GM_getValue(prefix("readHistory")) || "[]").includes(id);
    }

    // 面板创建
    function createUIPanel() {
        // 移除已存在的元素
        ['#autoReadPanel'].forEach(s => document.querySelector(s)?.remove());
        
        // 添加基础样式
        GM_addStyle(`
            /* 主面板样式 */
            #autoReadPanel {
                display: block !important;
                position: fixed !important;
                bottom: 10px !important;
                right: 10px !important;
                z-index: 2147483647 !important;
                background: rgba(255, 255, 255, 0.95) !important;
                border-radius: 10px !important;
                box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1) !important;
                width: 320px !important;
                font-family: Arial, sans-serif !important;
                border: 1px solid #ddd !important;
                transition: all 0.3s ease !important;
                overflow: hidden !important;
            }
            
            /* 面板头部 */
            .panel-header {
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
                padding: 10px 15px !important;
                background: #667eea !important;
                color: white !important;
                border-radius: 10px 10px 0 0 !important;
                margin: 0 !important;
            }
            
            /* 面板标题 */
            .panel-header h3 {
                margin: 0 !important;
                font-size: 16px !important;
                font-weight: 600 !important;
            }
            
            /* 最小化按钮 */
            .minimize-btn {
                background: transparent !important;
                color: white !important;
                border: none !important;
                font-size: 20px !important;
                cursor: pointer !important;
                width: 25px !important;
                height: 25px !important;
                border-radius: 50% !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                padding: 0 !important;
                transition: all 0.2s ease !important;
            }
            
            .minimize-btn:hover {
                background: rgba(255, 255, 255, 0.2) !important;
            }
            
            /* 面板主体 */
            .panel-body {
                padding: 15px !important;
                transition: all 0.3s ease !important;
            }
            
            /* 按钮样式 */
            #autoReadPanel button {
                border: none !important;
                border-radius: 5px !important;
                padding: 8px 12px !important;
                font-size: 14px !important;
                cursor: pointer !important;
                margin: 5px 0 !important;
                width: 100% !important;
            }
            
            /* 主要按钮 */
            #toggleReadBtn {
                background: #667eea !important;
                color: white !important;
            }
            
            /* 次要按钮 */
            #toggleLikeBtn {
                background: #f1f5f9 !important;
                color: #475569 !important;
            }
            
            /* 状态信息 */
            #pageStatus {
                margin-top: 10px !important;
                font-size: 12px !important;
                color: #666 !important;
            }
            
            /* 控制组 */
            .control-group {
                margin: 15px 0 !important;
            }
            
            /* 滑块容器 */
            .slider-container {
                margin: 10px 0 !important;
            }
            
            /* 滑块标签 */
            .slider-label {
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
                margin-bottom: 5px !important;
                font-size: 14px !important;
                color: #333 !important;
            }
            
            /* 滑块值显示 */
            .slider-value {
                font-weight: bold !important;
                color: #667eea !important;
            }
            
            /* 滑块样式 */
            input[type="range"] {
                width: 100% !important;
                height: 6px !important;
                background: #e2e8f0 !important;
                border-radius: 3px !important;
                outline: none !important;
                -webkit-appearance: none !important;
            }
            
            /* 滑块拇指样式 */
            input[type="range"]::-webkit-slider-thumb {
                -webkit-appearance: none !important;
                appearance: none !important;
                width: 18px !important;
                height: 18px !important;
                background: #667eea !important;
                border-radius: 50% !important;
                cursor: pointer !important;
                box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2) !important;
            }
            
            /* 进度条容器 */
            .progress-container {
                margin: 15px 0 !important;
            }
            
            /* 进度条标签 */
            .progress-label {
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
                margin-bottom: 5px !important;
                font-size: 14px !important;
                color: #333 !important;
            }
            
            /* 进度条 */
            .progress-bar {
                width: 100% !important;
                height: 8px !important;
                background: #e2e8f0 !important;
                border-radius: 4px !important;
                overflow: hidden !important;
            }
            
            /* 进度条填充 */
            .progress-fill {
                height: 100% !important;
                background: #667eea !important;
                border-radius: 4px !important;
                transition: width 0.3s ease !important;
            }
            
            /* 最小化状态 */
            #autoReadPanel.minimized {
                width: 120px !important;
                padding: 0 !important;
            }
            
            /* 最小化时隐藏面板主体 */
            #autoReadPanel.minimized .panel-body {
                display: none !important;
            }
            
            /* 最小化时隐藏面板头部 */
            #autoReadPanel.minimized .panel-header {
                display: none !important;
            }
            
            /* 最小化状态显示 */
            .panel-minimized {
                display: none !important;
                padding: 10px !important;
                text-align: center !important;
            }
            
            /* 最小化时显示最小化状态 */
            #autoReadPanel.minimized .panel-minimized {
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                gap: 8px !important;
                padding: 15px !important;
            }
            
            /* 状态指示器 */
            .status-indicator {
                width: 10px !important;
                height: 10px !important;
                border-radius: 50% !important;
                transition: all 0.3s ease !important;
            }
            
            /* 阅读中状态 */
            .status-indicator.status-active {
                background: #4ade80 !important;
                box-shadow: 0 0 10px rgba(74, 222, 128, 0.5) !important;
            }
            
            /* 已停止状态 */
            .status-indicator.status-inactive {
                background: #cbd5e1 !important;
            }
            
            /* 最小化文本 */
            .minimized-text {
                font-size: 14px !important;
                color: #333 !important;
                font-weight: 500 !important;
            }
        `);

        // 获取当前值
        const currentScrollSpeed = GM_getValue(prefix("scrollSpeed")) || config.defaultScrollSpeed;
        const currentLikeInterval = GM_getValue(prefix("likeInterval")) || config.defaultLikeInterval;
        const currentLikeCount = GM_getValue(prefix("clickCounter")) || 0;
        
        // 创建面板
        const panel = document.createElement('div');
        panel.id = 'autoReadPanel';
        panel.innerHTML = `
            <div class="panel-header">
                <h3>自动阅读控制</h3>
                <button class="minimize-btn" id="minimizeBtn" title="最小化">−</button>
            </div>
            <div class="panel-body">
                <button id="toggleReadBtn">
                    ${GM_getValue(prefix("read")) ? '停止阅读' : '开始阅读'}
                </button>
                
                <button id="toggleLikeBtn">
                    ${GM_getValue(prefix("autoLikeEnabled")) ? '禁用自动点赞' : '启用自动点赞'}
                </button>
                
                <div class="control-group">
                    <div class="slider-label">
                        <span>滚动速率</span>
                        <span class="slider-value" id="scrollSpeedValue">${currentScrollSpeed}</span>
                    </div>
                    <div class="slider-container">
                        <input type="range" id="scrollSpeedSlider" 
                               min="${config.minScrollSpeed}" 
                               max="${config.maxScrollSpeed}" 
                               step="${config.scrollStep}" 
                               value="${currentScrollSpeed}">
                    </div>
                </div>
                
                <div class="control-group">
                    <div class="slider-label">
                        <span>点赞速度</span>
                        <span class="slider-value" id="likeIntervalValue">${formatTime(currentLikeInterval)}</span>
                    </div>
                    <div class="slider-container">
                        <input type="range" id="likeIntervalSlider" 
                               min="${config.minLikeInterval}" 
                               max="${config.maxLikeInterval}" 
                               step="${config.likeIntervalStep}" 
                               value="${currentLikeInterval}">
                    </div>
                </div>
                
                <div class="control-group">
                    <div class="progress-label">
                        <span>今日点赞</span>
                        <span class="slider-value">${currentLikeCount}/${config.likeLimit}</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" id="likeProgress" 
                             style="width: ${(currentLikeCount / config.likeLimit) * 100}%"></div>
                    </div>
                </div>
                
                <div id="pageStatus">准备就绪</div>
            </div>
            <div class="panel-minimized" style="display: none;">
                <div class="status-indicator ${GM_getValue(prefix("read")) ? 'status-active' : 'status-inactive'}"></div>
                <span class="minimized-text">${GM_getValue(prefix("read")) ? '阅读中' : '已停止'}</span>
            </div>
        `;

        // 插入面板
        document.body.appendChild(panel);

        // 事件绑定
        document.getElementById('toggleReadBtn').addEventListener('click', toggleRead);
        document.getElementById('toggleLikeBtn').addEventListener('click', toggleAutoLike);
        
        // 最小化按钮事件
        const minimizeBtn = document.getElementById('minimizeBtn');
        minimizeBtn.addEventListener('click', () => {
            panel.classList.toggle('minimized');
        });
        
        // 点击最小化面板恢复
        panel.addEventListener('click', (e) => {
            if (panel.classList.contains('minimized') && e.target.closest('.panel-minimized')) {
                panel.classList.remove('minimized');
            }
        });
        
        // 滚动速率滑块事件
        const scrollSpeedSlider = document.getElementById('scrollSpeedSlider');
        const scrollSpeedValue = document.getElementById('scrollSpeedValue');
        scrollSpeedSlider.addEventListener('input', () => {
            const speed = parseInt(scrollSpeedSlider.value);
            scrollSpeedValue.textContent = speed;
            GM_setValue(prefix("scrollSpeed"), speed);
            updateStatus(`滚动速率已设置为: ${speed}`);
        });
        
        // 点赞速度滑块事件
        const likeIntervalSlider = document.getElementById('likeIntervalSlider');
        const likeIntervalValue = document.getElementById('likeIntervalValue');
        likeIntervalSlider.addEventListener('input', () => {
            const interval = parseInt(likeIntervalSlider.value);
            const formattedTime = formatTime(interval);
            likeIntervalValue.textContent = formattedTime;
            GM_setValue(prefix("likeInterval"), interval);
            updateStatus(`点赞速度已设置为: ${formattedTime}`);
        });
    }

    // 格式化时间显示
    function formatTime(ms) {
        if (ms < 1000) {
            return `${ms}ms`;
        } else if (ms < 60000) {
            return `${(ms / 1000).toFixed(0)}秒`;
        } else {
            const minutes = Math.floor(ms / 60000);
            const seconds = Math.floor((ms % 60000) / 1000);
            return `${minutes}分${seconds}秒`;
        }
    }

    // 更新状态
    function updateStatus(msg) {
        const el = document.getElementById('pageStatus');
        if(el) el.textContent = msg;
    }

    // 滚动相关变量
    let scrollInterval = null, checkScrollTimeout = null, mouseMoveInterval = null;

    // 模拟鼠标移动
    function simulateMouseMove() {
        try {
            // 在可视区域内随机生成鼠标位置
            const x = Math.floor(Math.random() * window.innerWidth);
            const y = Math.floor(Math.random() * window.innerHeight);
            
            // 创建鼠标移动事件
            const mouseEvent = new MouseEvent('mousemove', {
                bubbles: true,
                cancelable: true,
                clientX: x,
                clientY: y
            });
            
            // 分发事件
            document.dispatchEvent(mouseEvent);
        } catch (error) {
            console.error('模拟鼠标移动失败:', error);
        }
    }

    // 真实滚动模拟
    function startScrolling() {
        stopScrolling();
        const speed = GM_getValue(prefix("scrollSpeed")) || config.defaultScrollSpeed;
        
        // 模拟真实滚动：随机调整滚动速度
        scrollInterval = setInterval(() => {
            // 随机调整滚动速度，模拟人工阅读的不均匀滚动
            const randomSpeed = speed + Math.floor(Math.random() * 20) - 10;
            window.scrollBy(0, Math.max(1, randomSpeed));
        }, 30);
        
        // 模拟鼠标移动
        mouseMoveInterval = setInterval(simulateMouseMove, 2000);
        
        checkScroll();
    }

    // 停止滚动
    function stopScrolling() {
        clearInterval(scrollInterval);
        clearTimeout(checkScrollTimeout);
        clearInterval(mouseMoveInterval);
        scrollInterval = checkScrollTimeout = mouseMoveInterval = null;
    }

    // 检查滚动位置
    function checkScroll() {
        if (!GM_getValue(prefix("read"))) return;
        const atBottom = (window.innerHeight + window.scrollY) >= document.body.scrollHeight - 100;
        if (atBottom) {
            updateStatus('准备下一篇...');
            stopScrolling();
            setTimeout(() => openNewTopic().then(s => !s && setTimeout(checkScroll, config.retryDelay)), 800);
        } else {
            checkScrollTimeout = setTimeout(checkScroll, config.checkDelay);
        }
    }

    // 打开新话题
    async function openNewTopic() {
        try {
            let topicList = JSON.parse(GM_getValue(prefix("topicList")) || "[]");
            
            if (topicList.length === 0) {
                updateStatus('正在获取最新文章列表...');
                // 重置latestPage为0，确保每次都从最新页面开始拉取
                GM_setValue(prefix("latestPage"), 0);
                await getLatestTopic();
                topicList = JSON.parse(GM_getValue(prefix("topicList")) || "[]");
                
                if (topicList.length === 0) {
                    updateStatus('正在拉取最新文章...');
                    // 直接跳转到最新文章页面
                    window.location.href = `${BASE_URL}/new`;
                    return true;
                }
            }
            
            const topic = topicList.shift();
            GM_setValue(prefix("topicList"), JSON.stringify(topicList));
            
            const topicUrl = topic.last_read_post_number
                ? `${BASE_URL}/t/${topic.slug || 'topic'}/${topic.id}/${topic.last_read_post_number}`
                : `${BASE_URL}/t/${topic.slug || 'topic'}/${topic.id}`;
            
            window.location.href = topicUrl;
            return true;
        } catch (e) {
            updateStatus(`跳转失败: ${e.message}`);
            console.error('跳转失败:', e);
            return false;
        }
    }

    // 获取最新话题
    function getLatestTopic() {
        return new Promise(resolve => {
            let page = 0; // 每次都从第1页开始获取，确保获取最新内容
            let list = [], done = false, retry = 0;
            const MAX_PAGES = 10;
            const readHistory = JSON.parse(GM_getValue(prefix("readHistory")) || "[]");
            
            const fetchTopicPage = () => {
                page++;
                
                if (page > MAX_PAGES) {
                    GM_setValue(prefix("topicList"), JSON.stringify(list));
                    resolve();
                    return;
                }
                
                const url = `${BASE_URL}/new.json?no_definitions=true&page=${page}`;
                
                // 检查jQuery是否可用
                if (typeof $ === 'undefined') {
                    // 使用fetch API
                    fetch(url)
                        .then(response => response.json())
                        .then(r => {
                            if (r && typeof r === 'object') {
                                const topics = r.topic_list?.topics || r.topics || [];
                                
                                if (topics.length) {
                                    topics.forEach(t => {
                                        if (t.id && config.commentLimit > (t.posts_count || 0) && !readHistory.includes(t.id)) {
                                            list.push(t);
                                        }
                                    });
                                    if (list.length >= config.topicListLimit) done = true;
                                }
                                
                                if (done || topics.length === 0) {
                                    GM_setValue(prefix("topicList"), JSON.stringify(list));
                                    resolve();
                                } else {
                                    fetchTopicPage();
                                }
                            } else {
                                resolve();
                            }
                        })
                        .catch(error => {
                            console.error('获取话题列表失败:', error);
                            if (retry++ < config.maxRetries) {
                                setTimeout(fetchTopicPage, config.retryDelay);
                            } else {
                                GM_setValue(prefix("topicList"), JSON.stringify(list));
                                resolve();
                            }
                        });
                } else {
                    // 使用jQuery
                    $.ajax({
                        url,
                        success: r => {
                            if (r && typeof r === 'object') {
                                const topics = r.topic_list?.topics || r.topics || [];
                                
                                if (topics.length) {
                                    topics.forEach(t => {
                                        if (t.id && config.commentLimit > (t.posts_count || 0) && !readHistory.includes(t.id)) {
                                            list.push(t);
                                        }
                                    });
                                    if (list.length >= config.topicListLimit) done = true;
                                }
                                
                                if (done || topics.length === 0) {
                                    GM_setValue(prefix("topicList"), JSON.stringify(list));
                                    resolve();
                                } else {
                                    fetchTopicPage();
                                }
                            } else {
                                resolve();
                            }
                        },
                        error: (xhr, status, error) => {
                            console.error('获取话题列表失败:', status, error);
                            if (retry++ < config.maxRetries) {
                                setTimeout(fetchTopicPage, config.retryDelay);
                            } else {
                                GM_setValue(prefix("topicList"), JSON.stringify(list));
                                resolve();
                            }
                        }
                    });
                }
            };
            
            fetchTopicPage();
        });
    }

    // 自动点赞
    let autoLikeInterval = null;
    
    function autoLike() {
        if (autoLikeInterval) clearTimeout(autoLikeInterval);
        
        // 获取当前点赞数量
        const currentCount = parseInt(GM_getValue(prefix("clickCounter")) || 0);
        
        // 检查是否达到点赞上限
        if (currentCount >= config.likeLimit) {
            updateStatus(`今日点赞已达上限 (${config.likeLimit})`);
            // 更新UI
            updateLikeProgress();
            return;
        }
        
        // 查找点赞按钮
        const likeButtonSelectors = [
            '.like-btn:not(.liked):not(.active)',
            '.post-like-btn:not(.liked):not(.active)',
            '.btn-like:not(.liked):not(.active)',
            'button[class*="like"]:not([class*="unlike"]):not(.liked):not(.active)',
            '#topic-likes button:not(.liked):not(.active)',
            '.topic-actions .btn-primary.like:not(.liked):not(.active)',
            '.post-likes button:not(.liked):not(.active)',
            '.reaction-button.like:not(.liked):not(.active)',
            '.js-like-button:not(.liked):not(.active)',
            '.btn-icon.like:not(.liked):not(.active)',
            '.heart-button:not(.liked):not(.active)',
            'button[data-type="like"]:not(.liked):not(.active)'
        ];
        
        let likeButton = null;
        for (const selector of likeButtonSelectors) {
            const buttons = document.querySelectorAll(selector);
            if (buttons.length > 0) {
                likeButton = buttons[0];
                break;
            }
        }
        
        if (likeButton) {
            try {
                // 模拟真实点击
                likeButton.click();
                
                // 更新点赞数量
                const newCount = currentCount + 1;
                GM_setValue(prefix("clickCounter"), newCount);
                
                // 更新状态
                updateStatus(`点赞成功，今日已赞: ${newCount}`);
                
                // 更新UI
                updateLikeProgress();
            } catch (error) {
                console.error('点赞失败:', error);
            }
        }
        
        // 使用存储的点赞速度
        const likeInterval = GM_getValue(prefix("likeInterval")) || config.defaultLikeInterval;
        autoLikeInterval = setTimeout(autoLike, likeInterval);
    }
    
    function stopAutoLike() {
        clearTimeout(autoLikeInterval);
        autoLikeInterval = null;
    }
    
    // 更新点赞进度显示
    function updateLikeProgress() {
        const currentCount = parseInt(GM_getValue(prefix("clickCounter")) || 0);
        const progressElement = document.getElementById('likeProgress');
        const panel = document.getElementById('autoReadPanel');
        
        if (progressElement) {
            progressElement.style.width = `${(currentCount / config.likeLimit) * 100}%`;
        }
        
        // 更新点赞数量显示
        const progressLabels = panel.querySelectorAll('.progress-label span:last-child');
        if (progressLabels.length > 0) {
            progressLabels[0].textContent = `${currentCount}/${config.likeLimit}`;
        }
    }
    
    // 更新状态指示器
    function updateStatusIndicator() {
        const isReading = GM_getValue(prefix("read"));
        const statusIndicators = document.querySelectorAll('.status-indicator');
        const minimizedTexts = document.querySelectorAll('.minimized-text');
        
        statusIndicators.forEach(indicator => {
            indicator.className = `status-indicator ${isReading ? 'status-active' : 'status-inactive'}`;
        });
        
        minimizedTexts.forEach(text => {
            text.textContent = isReading ? '阅读中' : '已停止';
        });
    }

    // 切换阅读状态
    function toggleRead() {
        const willRead = !GM_getValue(prefix("read"));
        GM_setValue(prefix("read"), willRead);
        const btn = document.getElementById('toggleReadBtn');
        btn.textContent = willRead ? '停止阅读' : '开始阅读';
        updateStatus(willRead ? '自动阅读已启动' : '自动阅读已停止');
        
        // 更新状态指示器
        updateStatusIndicator();
        
        if (!willRead) {
            stopScrolling();
        } else {
            if (!window.location.pathname.includes('/t/')) {
                window.location.href = `${BASE_URL}/new`;
            }
            startScrolling();
        }
    }

    // 切换自动点赞
    function toggleAutoLike() {
        const e = !GM_getValue(prefix("autoLikeEnabled"));
        GM_setValue(prefix("autoLikeEnabled"), e);
        const btn = document.getElementById('toggleLikeBtn');
        btn.textContent = e ? '禁用自动点赞' : '启用自动点赞';
        if (e) {
            // 启用自动点赞时，等待设定的时间后再执行第一次点赞
            const likeInterval = GM_getValue(prefix("likeInterval")) || config.defaultLikeInterval;
            autoLikeInterval = setTimeout(autoLike, likeInterval);
            updateStatus(`自动点赞已启用，将在${formatTime(likeInterval)}后开始点赞`);
        } else {
            stopAutoLike();
        }
    }

    // 初始化
    function init() {
        initStorage();
        createUIPanel();
        
        const isReadEnabled = GM_getValue(prefix("read"));
        if (isReadEnabled) {
            startScrolling();
        }
        
        if (GM_getValue(prefix("autoLikeEnabled"))) {
            // 初始化时启用自动点赞，等待设定的时间后再执行第一次点赞
            const likeInterval = GM_getValue(prefix("likeInterval")) || config.defaultLikeInterval;
            autoLikeInterval = setTimeout(autoLike, likeInterval);
            updateStatus(`自动点赞已启用，将在${formatTime(likeInterval)}后开始点赞`);
        }
    }

    // 确保脚本在页面完全加载后运行
    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
        // 双重保险
        setTimeout(init, 2000);
    }
    
    // 额外检查：5秒后如果面板仍未显示，强制显示
    setTimeout(() => {
        if (!document.getElementById('autoReadPanel')) {
            console.warn('面板未正常加载，正在强制创建...');
            createUIPanel();
        }
    }, 5000);

    // 菜单命令
    GM_registerMenuCommand('打开控制面板', () => {
        const p = document.getElementById('autoReadPanel');
        if(p) p.style.display='block';
    });
    
    GM_registerMenuCommand('清空已读记录', () => {
        GM_setValue(prefix("readHistory"), "[]");
        updateStatus('已清空');
    });

})();
