/**
 * Antigravity 2.0 - Quota Progress Bar Plugin
 * 
 * 额度进度条与 AI Credits 监控专用插件（已与自动点击器插件完全隔离）
 */
(function antigravityQuota() {
    // ==========================================
    // 1. 全局清理（防冲突，保障热重启干净）
    // ==========================================
    if (window.__antigravityStopQuota) {
        window.__antigravityStopQuota();
    }

    // ==========================================
    // 1.2 拦截 fetch 以静默捕获 CSRF 令牌
    // ==========================================
    if (!window.__fetchHooked) {
        window.__fetchHooked = true;
        window.__capturedCSRF = null;
        const originalFetch = window.fetch;
        window.fetch = function(url, options) {
            try {
                if (options && options.headers) {
                    const headersObj = {};
                    if (options.headers instanceof Headers) {
                        options.headers.forEach((v, k) => { headersObj[k] = v; });
                    } else if (typeof options.headers === 'object') {
                        Object.assign(headersObj, options.headers);
                    }
                    for (const k of Object.keys(headersObj)) {
                        if (k.toLowerCase() === 'x-codeium-csrf-token') {
                            window.__capturedCSRF = {
                                key: k,
                                value: headersObj[k]
                            };
                        }
                    }
                }
            } catch(e) {}
            return originalFetch.apply(this, arguments);
        };
    }

    // ==========================================
    // 2. 初始化配置参数 (读取本地存储或默认值)
    // ==========================================
    let settings = {
        quotaInterval: 30000 // 默认额度获取间隔为 30 秒 (30000ms)
    };

    try {
        const saved = localStorage.getItem('antigravity_quota_settings');
        if (saved) {
            settings = Object.assign(settings, JSON.parse(saved));
        }
    } catch (e) {
        console.error("加载额度监控配置失败:", e);
    }

    console.log(
        `%c🟢 Antigravity Quota Monitor Active!\n` +
        `%c当前配置 - 轮询更新间隔: ${settings.quotaInterval / 1000}s\n` +
        `💡 提示：鼠标 Hover 进度条可查看各项模型详细额度；点击整个进度条胶囊即可修改更新间隔！`,
        "color: #5856d6; font-weight: bold; font-size: 14px;",
        "color: #b0bec5; font-size: 12px;"
    );

    // ==========================================
    // 3. 动态加载 Premium CSS 样式与动画
    // ==========================================
    const styleSheet = document.createElement("style");
    styleSheet.id = 'antigravity-quota-styles';
    styleSheet.innerText = `
        /* 弹窗遮罩层淡入 */
        @keyframes quotaFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        /* 弹窗卡片缩放弹出 */
        @keyframes quotaScaleUp {
            from { transform: scale(0.9) translateY(20px); opacity: 0; }
            to { transform: scale(1) translateY(0); opacity: 1; }
        }

        /* 悬浮章按钮样式（在弹窗内复用） */
        .quota-btn {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #f5f5f7;
            padding: 8px 16px;
            border-radius: 10px;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
            outline: none;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .quota-btn:hover {
            background: rgba(255, 255, 255, 0.1);
            transform: translateY(-1px);
        }

        .quota-btn:active {
            transform: translateY(0) scale(0.97);
        }

        .quota-btn-save {
            background: linear-gradient(135deg, #007aff, #5856d6);
            border: none;
            color: #fff;
            padding: 8px 20px;
            border-radius: 10px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
            outline: none;
            box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3);
        }

        .quota-btn-save:hover {
            transform: translateY(-1px);
            box-shadow: 0 6px 16px rgba(0, 122, 255, 0.45);
        }

        .quota-btn-save:active {
            transform: translateY(0) scale(0.97);
        }

        .quota-btn-reset {
            background: rgba(255, 59, 48, 0.08);
            border: 1px solid rgba(255, 59, 48, 0.2);
            color: #ff453a;
            padding: 8px 16px;
            border-radius: 10px;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
            outline: none;
        }

        .quota-btn-reset:hover {
            background: rgba(255, 59, 48, 0.15);
            border-color: rgba(255, 59, 48, 0.35);
            transform: translateY(-1px);
        }

        .quota-btn-reset:active {
            transform: translateY(0) scale(0.97);
        }

        /* ========================================== */
        /* PREMIUM QUOTA PROGRESS PILL STYLES        */
        /* ========================================== */
        #antigravity-quota-pill {
            position: fixed;
            top: 12px;
            left: 50%;
            transform: translateX(-50%) scale(1);
            height: 36px;
            z-index: 999998;
            display: flex;
            align-items: center;
            gap: 20px;
            padding: 0 18px;
            background: rgba(18, 18, 20, 0.76);
            backdrop-filter: blur(24px) saturate(220%);
            -webkit-backdrop-filter: blur(24px) saturate(220%);
            border: 1px solid rgba(255, 255, 255, 0.09);
            border-radius: 99px;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
            font-size: 11px;
            font-weight: 600;
            color: #f5f5f7;
            user-select: none;
            box-shadow: 0 4px 16px rgba(0,0,0,0.25), 0 12px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.15);
            transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            opacity: 0;
            pointer-events: none;
            -webkit-app-region: no-drag !important;
            cursor: pointer;
        }

        #antigravity-quota-pill.visible {
            opacity: 1;
            pointer-events: auto;
            -webkit-app-region: no-drag !important;
        }

        #antigravity-quota-pill:hover {
            transform: translateX(-50%) scale(1.02);
            border-color: rgba(255, 255, 255, 0.18);
            box-shadow: 0 8px 24px rgba(0,0,0,0.3), 0 16px 48px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.2);
            background: rgba(24, 24, 28, 0.84);
        }

        .quota-series {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            position: relative;
            height: 100%;
            padding: 0 10px !important;
            -webkit-app-region: no-drag !important;
        }

        .quota-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 17px;
            height: 17px;
            border-radius: 50%;
            font-size: 10px;
            transition: transform 0.2s ease;
        }

        .quota-series:hover .quota-icon {
            transform: scale(1.12);
        }

        .quota-icon.gemini {
            background: linear-gradient(135deg, #4285f4, #9b51e0);
            color: #fff;
            box-shadow: 0 0 8px rgba(66, 133, 244, 0.45);
        }

        .quota-icon.claude {
            background: linear-gradient(135deg, #d97706, #ea580c);
            color: #fff;
            box-shadow: 0 0 8px rgba(234, 88, 12, 0.45);
        }

        .quota-track {
            width: 95px;
            height: 6px;
            background: rgba(255, 255, 255, 0.08);
            border-radius: 99px;
            overflow: hidden;
            position: relative;
            box-shadow: inset 0 1px 2px rgba(0,0,0,0.4);
        }

        .quota-fill {
            height: 100%;
            border-radius: 99px;
            width: 0%;
            transition: width 0.8s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.8s ease;
            box-shadow: 0 0 6px rgba(255, 255, 255, 0.2);
        }

        .quota-percent {
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
            font-size: 10.5px;
            font-weight: 700;
            min-width: 32px;
            text-align: right;
            transition: color 0.4s ease;
            font-feature-settings: "tnum";
            -webkit-font-feature-settings: "tnum";
        }

        /* 让所有子元素让 pointer-events 穿透，避免 hover 卡顿 */
        .quota-icon,
        .quota-track,
        .quota-fill,
        .quota-percent {
            pointer-events: none !important;
        }

        .quota-series {
            background: rgba(0, 0, 0, 0) !important;
            pointer-events: auto !important;
        }

        /* 详情卡片样式 */
        .quota-tooltip-card {
            position: absolute;
            top: 40px;
            background-color: rgba(20, 20, 22, 0.94);
            backdrop-filter: blur(28px) saturate(220%);
            -webkit-backdrop-filter: blur(28px) saturate(220%);
            border: 1px solid rgba(255, 255, 255, 0.14);
            border-radius: 16px;
            padding: 14px 16px;
            width: 260px;
            box-shadow: 0 24px 64px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.15);
            opacity: 0;
            pointer-events: none;
            transform: translateY(6px) scale(0.98);
            transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            transition-delay: 0.12s; /* 增加轻微的关闭延迟 */
            z-index: 999999;
            color: #f5f5f7;
            font-size: 11px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            -webkit-app-region: no-drag !important;
        }

        /* 增加桥接器避免对角移动闪烁 */
        .quota-tooltip-card::before {
            content: '';
            position: absolute;
            top: -20px;
            left: 0;
            right: 0;
            height: 24px;
            background: transparent;
        }

        .quota-series:hover .quota-tooltip-card {
            opacity: 1;
            pointer-events: auto;
            transform: translateY(0) scale(1);
            transition-delay: 0s;
        }

        .quota-tooltip-card.left-align {
            left: -12px;
        }

        .quota-tooltip-card.right-align {
            right: -12px;
        }

        .tooltip-header {
            font-weight: 700;
            font-size: 12px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.09);
            padding-bottom: 8px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .tooltip-model-row {
            display: flex;
            flex-direction: column;
            gap: 4px;
            padding: 4px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        
        .tooltip-model-row:last-child {
            border-bottom: none;
        }

        .tooltip-model-meta {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 10px;
        }

        .tooltip-model-name {
            color: rgba(255, 255, 255, 0.9);
            font-weight: 600;
        }

        .tooltip-model-refresh {
            color: rgba(255, 255, 255, 0.45);
            font-size: 9px;
            margin-bottom: 2px;
        }

        .tooltip-segments {
            display: flex;
            gap: 3px;
            height: 4px;
            margin-top: 2px;
        }

        .tooltip-segment {
            flex: 1;
            border-radius: 99px;
            background: rgba(255, 255, 255, 0.08);
            overflow: hidden;
            height: 100%;
        }

        .tooltip-segment-fill {
            height: 100%;
            border-radius: 99px;
        }

        .quota-credits-badge {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 3px 10px;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.09);
            border-radius: 99px;
            font-size: 11px;
            font-weight: 600;
            color: rgba(255, 255, 255, 0.9);
            box-shadow: 0 2px 6px rgba(0,0,0,0.15);
            transition: all 0.2s ease;
        }

        .quota-credits-badge:hover {
            background: rgba(255, 255, 255, 0.1);
            border-color: rgba(255, 255, 255, 0.15);
        }

        .quota-credits-icon {
            color: #ffd60a;
            text-shadow: 0 0 8px rgba(255, 214, 10, 0.55);
        }
    `;
    document.head.appendChild(styleSheet);

    // ==========================================
    // 4. 创建与渲染状态悬浮胶囊 DOM
    // ==========================================
    function initQuotaPill() {
        if (document.getElementById('antigravity-quota-pill')) return;

        const pill = document.createElement('div');
        pill.id = 'antigravity-quota-pill';

        // 1. Gemini Series Container
        const geminiContainer = document.createElement('div');
        geminiContainer.className = 'quota-series';
        
        const geminiIcon = document.createElement('div');
        geminiIcon.className = 'quota-icon gemini';
        geminiIcon.innerText = '♊';
        
        const geminiTrack = document.createElement('div');
        geminiTrack.className = 'quota-track';
        const geminiFill = document.createElement('div');
        geminiFill.id = 'gemini-quota-fill';
        geminiFill.className = 'quota-fill';
        geminiTrack.appendChild(geminiFill);

        const geminiPercent = document.createElement('span');
        geminiPercent.id = 'gemini-quota-percent';
        geminiPercent.className = 'quota-percent';
        geminiPercent.innerText = '--%';

        const geminiTooltip = document.createElement('div');
        geminiTooltip.id = 'gemini-quota-tooltip';
        geminiTooltip.className = 'quota-tooltip-card left-align';
        geminiTooltip.innerHTML = `<div class="tooltip-header">♊ Gemini 系列额度</div><div style="color:rgba(255,255,255,0.4); text-align:center; padding:10px 0;">正在加载数据...</div>`;

        geminiContainer.appendChild(geminiIcon);
        geminiContainer.appendChild(geminiTrack);
        geminiContainer.appendChild(geminiPercent);
        geminiContainer.appendChild(geminiTooltip);

        // 2. Claude Series Container
        const claudeContainer = document.createElement('div');
        claudeContainer.className = 'quota-series';
        
        const claudeIcon = document.createElement('div');
        claudeIcon.className = 'quota-icon claude';
        claudeIcon.innerText = '🍊';
        
        const claudeTrack = document.createElement('div');
        claudeTrack.className = 'quota-track';
        const claudeFill = document.createElement('div');
        claudeFill.id = 'claude-quota-fill';
        claudeFill.className = 'quota-fill';
        claudeTrack.appendChild(claudeFill);

        const claudePercent = document.createElement('span');
        claudePercent.id = 'claude-quota-percent';
        claudePercent.className = 'quota-percent';
        claudePercent.innerText = '--%';

        const claudeTooltip = document.createElement('div');
        claudeTooltip.id = 'claude-quota-tooltip';
        claudeTooltip.className = 'quota-tooltip-card right-align';
        claudeTooltip.innerHTML = `<div class="tooltip-header">🍊 Claude 系列额度</div><div style="color:rgba(255,255,255,0.4); text-align:center; padding:10px 0;">正在加载数据...</div>`;

        claudeContainer.appendChild(claudeIcon);
        claudeContainer.appendChild(claudeTrack);
        claudeContainer.appendChild(claudePercent);
        claudeContainer.appendChild(claudeTooltip);

        // 3. Credits Badge
        const creditsBadge = document.createElement('div');
        creditsBadge.id = 'quota-credits-badge';
        creditsBadge.className = 'quota-credits-badge';
        creditsBadge.innerHTML = `<span class="quota-credits-icon">💎</span><span id="quota-credits-val">--</span>`;

        pill.appendChild(geminiContainer);
        pill.appendChild(claudeContainer);
        pill.appendChild(creditsBadge);
        
        // 绑定点击整个胶囊（排除详情卡片本身）拉起额度设置面板
        pill.addEventListener('click', (e) => {
            if (e.target.closest('.quota-tooltip-card')) return;
            e.preventDefault();
            e.stopPropagation();
            showQuotaSettingsModal();
        });

        document.body.appendChild(pill);
    }

    // ==========================================
    // 5. iOS/macOS Premium 毛玻璃额度设置弹窗
    // ==========================================
    function showQuotaSettingsModal() {
        if (document.getElementById('antigravity-quota-overlay')) return;

        // 遮罩层
        const overlay = document.createElement('div');
        overlay.id = 'antigravity-quota-overlay';
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.45)',
            backdropFilter: 'blur(8px) saturate(140%)',
            webkitBackdropFilter: 'blur(8px) saturate(140%)',
            zIndex: '9999999',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
            animation: 'quotaFadeIn 0.3s cubic-bezier(0.25, 0.8, 0.25, 1) forwards'
        });

        // 弹窗本体
        const modal = document.createElement('div');
        Object.assign(modal.style, {
            backgroundColor: 'rgba(28, 28, 30, 0.82)',
            backdropFilter: 'blur(25px) saturate(190%)',
            webkitBackdropFilter: 'blur(25px) saturate(190%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '20px',
            padding: '24px',
            width: '320px',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.45)',
            color: '#f5f5f7',
            animation: 'quotaScaleUp 0.35s cubic-bezier(0.25, 0.8, 0.25, 1.1) forwards',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
        });

        modal.innerHTML = `
            <!-- 头部 -->
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                <h3 style="margin: 0; font-size: 15px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                    ⚙️ 额度插件参数配置
                </h3>
            </div>
            
            <!-- 额度获取间隔 -->
            <div>
                <label style="display: block; font-size: 11px; color: rgba(255,255,255,0.45); margin-bottom: 6px; font-weight: 500;">
                    额度更新间隔 (秒)
                </label>
                <input type="number" id="quota-input-interval" value="${Math.round(settings.quotaInterval / 1000)}" min="5" max="3600" step="1" 
                    style="width: 100%; padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.08); background: rgba(0,0,0,0.3); color: #fff; box-sizing: border-box; font-size: 13px; outline: none; transition: all 0.2s;" />
                <div style="font-size: 10px; color: rgba(255, 255, 255, 0.3); margin-top: 4px;">
                    * 静默后台获取及更新额度数据的轮询间隔时间。默认 30 秒。
                </div>
            </div>
            
            <!-- 按钮组 -->
            <div style="display: flex; gap: 10px; justify-content: space-between; margin-top: 6px;">
                <button id="quota-btn-reset" class="quota-btn-reset">
                    恢复默认
                </button>
                <div style="display: flex; gap: 8px;">
                    <button id="quota-btn-cancel" class="quota-btn">
                        取消
                    </button>
                    <button id="quota-btn-save" class="quota-btn-save">
                        保存并重启
                    </button>
                </div>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // 取消动作
        document.getElementById('quota-btn-cancel').addEventListener('click', () => {
            closeModalWithAnimation(overlay);
        });

        // 遮罩层点击取消
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeModalWithAnimation(overlay);
            }
        });

        // 输入框 focus 特效
        const intervalInput = document.getElementById('quota-input-interval');
        intervalInput.addEventListener('focus', () => {
            intervalInput.style.borderColor = 'rgba(0, 122, 255, 0.45)';
            intervalInput.style.boxShadow = '0 0 8px rgba(0, 122, 255, 0.2)';
            intervalInput.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';
        });
        intervalInput.addEventListener('blur', () => {
            intervalInput.style.borderColor = 'rgba(255, 255, 255, 0.08)';
            intervalInput.style.boxShadow = 'none';
            intervalInput.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
        });

        // 恢复默认配置
        document.getElementById('quota-btn-reset').addEventListener('click', () => {
            try {
                localStorage.removeItem('antigravity_quota_settings');
                closeModalWithAnimation(overlay);
                showToast("🔄 已恢复默认 (30s) 配置！正在重启...");

                setTimeout(() => {
                    if (window.__antigravityStopQuota) {
                        window.__antigravityStopQuota();
                    }
                    if (typeof window.__antigravityQuotaLauncher === 'function') {
                        window.__antigravityQuotaLauncher();
                    }
                }, 600);
            } catch (e) {
                alert("恢复默认配置失败: " + e);
            }
        });

        // 保存并热重启
        document.getElementById('quota-btn-save').addEventListener('click', () => {
            const intervalVal = parseInt(intervalInput.value) || 30;
            const newSettings = {
                quotaInterval: Math.max(5, intervalVal) * 1000
            };

            try {
                localStorage.setItem('antigravity_quota_settings', JSON.stringify(newSettings));
                closeModalWithAnimation(overlay);
                showToast("✨ 参数保存成功！正在重启监视器...");

                setTimeout(() => {
                    if (window.__antigravityStopQuota) {
                        window.__antigravityStopQuota();
                    }
                    if (typeof window.__antigravityQuotaLauncher === 'function') {
                        window.__antigravityQuotaLauncher();
                    }
                }, 600);

            } catch (e) {
                alert("保存失败: " + e);
            }
        });
    }

    // 优雅的弹窗退出动画
    function closeModalWithAnimation(overlay) {
        overlay.style.transition = 'opacity 0.25s cubic-bezier(0.25, 0.8, 0.25, 1)';
        overlay.style.opacity = '0';
        const modal = overlay.firstElementChild;
        if (modal) {
            modal.style.transition = 'transform 0.25s cubic-bezier(0.25, 0.8, 0.25, 1), opacity 0.25s cubic-bezier(0.25, 0.8, 0.25, 1)';
            modal.style.transform = 'scale(0.92) translateY(12px)';
            modal.style.opacity = '0';
        }
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, 250);
    }

    // 优雅的 Toast 提示
    function showToast(message) {
        const toast = document.createElement('div');
        Object.assign(toast.style, {
            position: 'fixed',
            top: '24px',
            left: '50%',
            transform: 'translateX(-50%) translateY(-24px)',
            backgroundColor: 'rgba(28, 28, 30, 0.9)',
            backdropFilter: 'blur(15px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '14px',
            padding: '12px 24px',
            color: '#fff',
            fontSize: '12px',
            fontWeight: '600',
            zIndex: '99999999',
            boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
            opacity: '0',
            transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
        });
        toast.innerText = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.transform = 'translateX(-50%) translateY(0)';
            toast.style.opacity = '1';
        }, 40);

        setTimeout(() => {
            toast.style.transform = 'translateX(-50%) translateY(-20px)';
            toast.style.opacity = '0';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 350);
        }, 2200);
    }

    // ==========================================
    // 6. PREMIUM QUOTA DISPLAYS CORE LOGIC
    // ==========================================

    // 执行静默额度抓取 (gRPC-web 静默后台接口 fetch 模式)
    function runSilentQuotaScrape() {
        return new Promise(async (resolve) => {
            try {
                // A. 检测是否捕获到 CSRF 令牌
                const csrfToken = window.__capturedCSRF ? window.__capturedCSRF.value : '';
                if (!csrfToken) {
                    resolve({ error: "x-codeium-csrf-token not available yet" });
                    return;
                }

                // B. 构建 5-byte 前缀帧的 gRPC payload for '{}' JSON
                const jsonStr = '{}';
                const jsonBytes = new TextEncoder().encode(jsonStr);
                const framedBytes = new Uint8Array(5 + jsonBytes.length);
                framedBytes[0] = 0x00; // Data flag
                const len = jsonBytes.length;
                framedBytes[1] = (len >> 24) & 0xff;
                framedBytes[2] = (len >> 16) & 0xff;
                framedBytes[3] = (len >> 8) & 0xff;
                framedBytes[4] = len & 0xff;
                framedBytes.set(jsonBytes, 5);

                // C. 向 GetAvailableModels 接口发起异步请求
                const res = await fetch('/exa.language_server_pb.LanguageServerService/GetAvailableModels', {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/grpc-web+json',
                        'x-codeium-csrf-token': csrfToken,
                        'x-grpc-web': '1',
                        'x-user-agent': 'CONNECT_ES_USER_AGENT'
                    },
                    body: framedBytes
                });

                if (res.status !== 200) {
                    resolve({ error: `gRPC fetch failed with status ${res.status}` });
                    return;
                }

                const ab = await res.arrayBuffer();
                const respBytes = new Uint8Array(ab);
                
                // D. 解析 gRPC-web frames 提取 JSON payload
                let offset = 0;
                let fullText = '';
                while (offset < respBytes.length) {
                    const flag = respBytes[offset];
                    const length = (respBytes[offset+1] << 24) | (respBytes[offset+2] << 16) | (respBytes[offset+3] << 8) | respBytes[offset+4];
                    if (flag === 0) {
                        const msgBytes = respBytes.slice(offset + 5, offset + 5 + length);
                        fullText = new TextDecoder().decode(msgBytes);
                        break;
                    }
                    offset += 5 + length;
                }

                if (!fullText) {
                    resolve({ error: "Empty gRPC response payload" });
                    return;
                }

                const obj = JSON.parse(fullText);
                const models = obj.response?.models || {};
                const parsedModels = [];

                // E. 格式化重置倒计时文本的辅助函数
                const formatResetTime = (resetTimeStr) => {
                    if (!resetTimeStr) return '';
                    try {
                        const resetDate = new Date(resetTimeStr);
                        const diffMs = resetDate - new Date();
                        if (diffMs <= 0) return 'Quota resets soon';
                        const diffMins = Math.round(diffMs / 60000);
                        if (diffMins < 60) return `Resets in ${diffMins}m`;
                        const diffHours = Math.floor(diffMins / 60);
                        const remMins = diffMins % 60;
                        return `Resets in ${diffHours}h ${remMins}m`;
                    } catch(e) {
                        return '';
                    }
                };

                // F. 遍历映射所有相关的 Gemini、Claude 模型配额
                for (const key of Object.keys(models)) {
                    const m = models[key];
                    const name = m.displayName || key;
                    if (name.includes('Gemini') || name.includes('Claude') || key.includes('gemini') || key.includes('claude') || name.includes('GPT-OSS')) {
                        const remainingFraction = m.quotaInfo?.remainingFraction ?? 1.0;
                        const resetTimeStr = m.quotaInfo?.resetTime || '';
                        parsedModels.push({
                            name: name,
                            percent: remainingFraction * 100,
                            filledSegments: Math.round(remainingFraction * 5),
                            totalSegments: 5,
                            refreshText: formatResetTime(resetTimeStr)
                        });
                    }
                }

                // G. 读取本地 SQLite daemon 周期注入的 AI Credits 余额
                const availableCredits = window.__antigravityCredits || 0;

                resolve({
                    success: true,
                    credits: availableCredits,
                    models: parsedModels
                });
            } catch (e) {
                resolve({ error: e.message });
            }
        });
    }

    // 格式化时间前缀
    function getUpdateTimeStr() {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    // 更新 Quota Pill 视图
    function updateQuotaPill(data) {
        if (!data || !data.success) return;

        const pill = document.getElementById('antigravity-quota-pill');
        if (!pill) return;

        // 1. 计算 Gemini 和 Claude 平均额度百分比
        const geminiModels = data.models.filter(m => m.name.includes('Gemini') || m.name.includes('GPT-OSS'));
        const claudeModels = data.models.filter(m => m.name.includes('Claude'));

        const geminiAvg = geminiModels.length > 0 
            ? (geminiModels.reduce((acc, curr) => acc + curr.percent, 0) / geminiModels.length) 
            : 100;
        
        const claudeAvg = claudeModels.length > 0 
            ? (claudeModels.reduce((acc, curr) => acc + curr.percent, 0) / claudeModels.length) 
            : 100;

        // 2. 更新 Gemini 进度条、状态颜色及百分比文字
        const geminiFill = document.getElementById('gemini-quota-fill');
        const geminiPercent = document.getElementById('gemini-quota-percent');
        if (geminiFill) {
            geminiFill.style.width = `${geminiAvg}%`;
            if (geminiAvg >= 60) {
                geminiFill.style.backgroundColor = 'hsl(142, 70%, 45%)';
                if (geminiPercent) geminiPercent.style.color = '#30d158'; // vibrant neon green
            } else if (geminiAvg >= 30) {
                geminiFill.style.backgroundColor = 'hsl(45, 90%, 48%)';
                if (geminiPercent) geminiPercent.style.color = '#ff9f0a'; // amber gold
            } else {
                geminiFill.style.backgroundColor = 'hsl(354, 70%, 48%)';
                if (geminiPercent) geminiPercent.style.color = '#ff453a'; // crimson danger
            }
        }
        if (geminiPercent) {
            geminiPercent.innerText = `${Math.round(geminiAvg)}%`;
        }

        // 3. 更新 Claude 进度条、状态颜色及百分比文字
        const claudeFill = document.getElementById('claude-quota-fill');
        const claudePercent = document.getElementById('claude-quota-percent');
        if (claudeFill) {
            claudeFill.style.width = `${claudeAvg}%`;
            if (claudeAvg >= 60) {
                claudeFill.style.backgroundColor = 'hsl(142, 70%, 45%)';
                if (claudePercent) claudePercent.style.color = '#30d158'; // vibrant neon green
            } else if (claudeAvg >= 30) {
                claudeFill.style.backgroundColor = 'hsl(45, 90%, 48%)';
                if (claudePercent) claudePercent.style.color = '#ff9f0a'; // amber gold
            } else {
                claudeFill.style.backgroundColor = 'hsl(354, 70%, 48%)';
                if (claudePercent) claudePercent.style.color = '#ff453a'; // crimson danger
            }
        }
        if (claudePercent) {
            claudePercent.innerText = `${Math.round(claudeAvg)}%`;
        }

        // 4. 更新 AI 余额
        const creditsVal = document.getElementById('quota-credits-val');
        if (creditsVal) {
            creditsVal.innerText = data.credits >= 1000 
                ? `${(data.credits / 1000).toFixed(1)}k` 
                : data.credits;
            creditsVal.title = `可用 AI Credits 余额: ${data.credits}`;
        }

        // 5. 更新 Tooltips 卡片
        const timeStr = getUpdateTimeStr();
        const geminiTooltip = document.getElementById('gemini-quota-tooltip');
        if (geminiTooltip) {
            let html = `<div class="tooltip-header">
                <span>♊ Gemini 系列额度</span>
                <span style="font-size:9px;color:rgba(255,255,255,0.4);">${timeStr} 更新</span>
            </div>`;
            
            geminiModels.forEach(m => {
                let segmentsHtml = '';
                for (let i = 0; i < m.totalSegments; i++) {
                    const filled = i < m.filledSegments;
                    let colorClass = 'background: rgba(255, 255, 255, 0.1);';
                    if (filled) {
                        if (m.percent >= 60) colorClass = 'background: hsl(142, 70%, 45%); box-shadow: 0 0 4px rgba(48, 209, 88, 0.35);';
                        else if (m.percent >= 30) colorClass = 'background: hsl(45, 90%, 48%); box-shadow: 0 0 4px rgba(255, 159, 10, 0.35);';
                        else colorClass = 'background: hsl(354, 70%, 48%); box-shadow: 0 0 4px rgba(255, 69, 58, 0.35);';
                    }
                    segmentsHtml += `<div class="tooltip-segment"><div class="tooltip-segment-fill" style="width:100%; ${colorClass}"></div></div>`;
                }
                
                html += `
                <div class="tooltip-model-row">
                    <div class="tooltip-model-meta">
                        <span class="tooltip-model-name">${m.name}</span>
                        <span style="font-weight:600; color:${m.percent >= 60 ? '#30d158' : (m.percent >= 30 ? '#ff9f0a' : '#ff453a')}">${m.filledSegments}/${m.totalSegments}</span>
                    </div>
                    <div class="tooltip-segments">${segmentsHtml}</div>
                    ${m.refreshText ? `<div class="tooltip-model-refresh">${m.refreshText}</div>` : ''}
                </div>
                `;
            });
            geminiTooltip.innerHTML = html;
        }

        const claudeTooltip = document.getElementById('claude-quota-tooltip');
        if (claudeTooltip) {
            let html = `<div class="tooltip-header">
                <span>🍊 Claude 系列额度</span>
                <span style="font-size:9px;color:rgba(255,255,255,0.4);">${timeStr} 更新</span>
            </div>`;
            
            claudeModels.forEach(m => {
                let segmentsHtml = '';
                for (let i = 0; i < m.totalSegments; i++) {
                    const filled = i < m.filledSegments;
                    let colorClass = 'background: rgba(255, 255, 255, 0.1);';
                    if (filled) {
                        if (m.percent >= 60) colorClass = 'background: hsl(142, 70%, 45%); box-shadow: 0 0 4px rgba(48, 209, 88, 0.35);';
                        else if (m.percent >= 30) colorClass = 'background: hsl(45, 90%, 48%); box-shadow: 0 0 4px rgba(255, 159, 10, 0.35);';
                        else colorClass = 'background: hsl(354, 70%, 48%); box-shadow: 0 0 4px rgba(255, 69, 58, 0.35);';
                    }
                    segmentsHtml += `<div class="tooltip-segment"><div class="tooltip-segment-fill" style="width:100%; ${colorClass}"></div></div>`;
                }
                
                html += `
                <div class="tooltip-model-row">
                    <div class="tooltip-model-meta">
                        <span class="tooltip-model-name">${m.name}</span>
                        <span style="font-weight:600; color:${m.percent >= 60 ? '#30d158' : (m.percent >= 30 ? '#ff9f0a' : '#ff453a')}">${m.filledSegments}/${m.totalSegments}</span>
                    </div>
                    <div class="tooltip-segments">${segmentsHtml}</div>
                    ${m.refreshText ? `<div class="tooltip-model-refresh">${m.refreshText}</div>` : ''}
                </div>
                `;
            });
            claudeTooltip.innerHTML = html;
        }

        // 让 Pill 浮现
        pill.classList.add('visible');
    }

    // 触发静默更新逻辑（带防抖）
    let isScraping = false;
    function updateQuotasSilent() {
        if (isScraping) return;
        isScraping = true;
        
        runSilentQuotaScrape().then(data => {
            isScraping = false;
            if (data && data.success) {
                updateQuotaPill(data);
            }
        }).catch(err => {
            isScraping = false;
            console.error("Antigravity Quota Scrape Failed:", err);
        });
    }

    // 防抖与节流更新（在观察到 DOM 变化时触发）
    let lastScrapeTime = 0;
    function throttleQuotaScrape() {
        const now = Date.now();
        if (now - lastScrapeTime > settings.quotaInterval) {
            lastScrapeTime = now;
            updateQuotasSilent();
        }
    }

    // 初始化 Pill DOM 并执行首次抓取
    initQuotaPill();
    
    // 首次抓取在 3 秒后延迟触发，确保页面稳定加载
    window.__antigravityQuotaTimeout = setTimeout(() => {
        updateQuotasSilent();
    }, 3000);

    // 启动定时轮询器
    window.__antigravityQuotaInterval = setInterval(() => {
        updateQuotasSilent();
    }, settings.quotaInterval);

    // 监听 DOM 变化以实现自适应低功耗更新
    const observer = new MutationObserver(() => {
        throttleQuotaScrape();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // ==========================================
    // 7. 全局挂载与优雅停止接口
    // ==========================================
    window.__antigravityQuotaObserver = observer;
    window.__antigravityStopQuota = function() {
        if (window.__antigravityQuotaObserver) {
            window.__antigravityQuotaObserver.disconnect();
            
            // 清理定时器
            if (window.__antigravityQuotaTimeout) clearTimeout(window.__antigravityQuotaTimeout);
            if (window.__antigravityQuotaInterval) clearInterval(window.__antigravityQuotaInterval);
            
            // 移除非必要 DOM 节点与样式
            const existingPill = document.getElementById('antigravity-quota-pill');
            if (existingPill && existingPill.parentNode) {
                existingPill.parentNode.removeChild(existingPill);
            }
            const existingStyles = document.getElementById('antigravity-quota-styles');
            if (existingStyles && existingStyles.parentNode) {
                existingStyles.parentNode.removeChild(existingStyles);
            }
            const existingOverlay = document.getElementById('antigravity-quota-overlay');
            if (existingOverlay && existingOverlay.parentNode) {
                existingOverlay.parentNode.removeChild(existingOverlay);
            }
            
            console.log("%c🔴 Antigravity Quota Monitor 已优雅停止，运行资源已完全释放。", "color: #ff453a; font-weight: bold;");
        }
    };

    // 挂载用于动态重载的 Launcher
    window.__antigravityQuotaLauncher = antigravityQuota;
})();
