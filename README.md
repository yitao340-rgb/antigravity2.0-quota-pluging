# Antigravity 2.0 - Quota Progress Bar Plugin

额度进度条与 AI Credits 余额监控专用插件。通过监听 Chrome DevTools Protocol (CDP) WebSocket 端口，静默向 Antigravity Electron 页面注入额度状态栏胶囊，并周期性自动提取本地 SQLite 数据库中的 AI 积分余额进行展示。

---

## 💻 系统限定与运行要求 (System Constraints)

该插件的设计和部署包含以下特定系统限制：
1. **操作系统限定**：仅支持 **macOS** 系统（依赖 macOS 的 `launchd` 守护进程服务、`plist` 配置文件及 `sqlite3`）。
2. **目标应用限定**：专为 **Antigravity 2.0** 客户端（基于 Electron 开发的 IDE/对话应用）设计。
3. **调试端口要求**：应用启动时必须在运行目录下生成有效的 `DevToolsActivePort` 文件，以供注入器读取 CDP 调试端口进行 WebSocket 通信。
4. **数据存储路径**：
   - 调试端口路径：`~/Library/Application Support/Antigravity/DevToolsActivePort`
   - 本地 SQLite 积分数据源：`~/Library/Application Support/Antigravity/User/globalStorage/state.vscdb`（解析 `antigravityUnifiedStateSync.modelCredits` Protobuf 结构）

---

## 🤖 智能 AI 一键安装提示词 (Universal AI Install Prompt)

如果你正在使用 AI 编程助手（如 Antigravity 助手、Cursor、Windsurf 等），可以直接将以下提示词复制并发送给它，AI 将会自动为您在本地环境中安装、调试并启动该额度监控插件：

```text
你是一个专业的 macOS 自动化和 Chrome 插件专家。请为我自动部署 “Antigravity 2.0 额度监控插件”。
请按照以下步骤执行：

1. 自动检测并获取当前操作系统的用户名及用户 Home 目录绝对路径（用于下文路径的替换）。
2. 确认已创建或定位到额度插件专用目录：
   <YOUR_HOME_DIR>/.gemini/antigravity/scratch/antigravity2.0-quota-pluging

3. 检查该目录下是否已存在核心代码文件：
   - quota.js (前端视图、gRPC 抓取与参数配置面板)
   - injector.py (基于 CDP 协议的注入与 SQLite 积分提取器)
   - reload_quota.py (用于热加载和调试插件的脚本)
   - com.yitao.antigravity.quota.plist (launchd 配置文件)

4. 自动配置 launchd 守护服务：
   - 更新 com.yitao.antigravity.quota.plist 文件中所有的绝对路径，将其中的 /Users/yitao 动态替换为当前用户的实际 Home 目录路径。
   - 将 com.yitao.antigravity.quota.plist 复制到当前用户的 LaunchAgents 目录：
     cp <YOUR_HOME_DIR>/.gemini/antigravity/scratch/antigravity2.0-quota-pluging/com.yitao.antigravity.quota.plist ~/Library/LaunchAgents/com.yitao.antigravity.quota.plist
   - 加载此 launchd 服务以实现开机自启和端口变动自动注入：
     launchctl load ~/Library/LaunchAgents/com.yitao.antigravity.quota.plist

5. 自动触发首次调试与注入测试：
   - 执行热重载脚本，检查在当前已打开的 Antigravity 窗口中是否成功挂载额度胶囊：
     python3 <YOUR_HOME_DIR>/.gemini/antigravity/scratch/antigravity2.0-quota-pluging/reload_quota.py

请一步步自动运行这些命令，并在完成后向我汇报当前的可用 AI Credits 余额，以及在页面中额度胶囊的加载状态！
```

---

## 🛠️ 手动安装与运行指南 (Manual Deployment)

如果你希望手动进行部署，请依次在终端执行以下指令（注意：请将指令中的 `~` 保持不变，或者在需要绝对路径时替换为您的实际用户名）：

### 1. 将 launchd 服务注册至 macOS 代理
```bash
# 复制 plist 配置文件
cp ~/.gemini/antigravity/scratch/antigravity2.0-quota-pluging/com.yitao.antigravity.quota.plist ~/Library/LaunchAgents/com.yitao.antigravity.quota.plist

# 加载 launchd 守护进程
launchctl load ~/Library/LaunchAgents/com.yitao.antigravity.quota.plist
```

### 2. 调试或强制热重载插件
在更新了 `quota.js` 前端界面或 `injector.py` 脚本时，无需重启应用，只需运行热重载脚本即可：
```bash
python3 ~/.gemini/antigravity/scratch/antigravity2.0-quota-pluging/reload_quota.py
```

### 3. 查看运行日志
```bash
# 查看注入器标准输出
tail -f ~/.gemini/antigravity/scratch/antigravity2.0-quota-pluging/launchd_output.log

# 查看运行报错信息
tail -f ~/.gemini/antigravity/scratch/antigravity2.0-quota-pluging/launchd_error.log
```

---

## 🎨 插件功能特性

1. **顶栏毛玻璃胶囊悬浮窗**：在页面正上方居中悬浮，采用高阶 HSL 亮色指示灯，且已强制覆盖 `-webkit-app-region: no-drag !important;` 保证鼠标 hover 和点击事件的灵敏度。
2. **Gemini & Claude 精确配额监控**：鼠标悬停在对应位置，会以渐入渐显动画弹出模型明细额度卡片（显示重置剩余时间）。
3. **AI Credits 实时读取**：读取后台 SQLite 数据库，并转换为 `K` 单位（例如 `1.0k`）显示在右侧钻石徽章。
4. **自适应极简配置面板**：鼠标点击胶囊任意非详情区，即会弹出精美的参数修改窗口，支持自定义设置轮询间隔，默认 30s。
