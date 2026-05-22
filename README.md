# Antigravity 2.0 - Quota Progress Bar Plugin

额度进度条与 AI Credits 余额监控专用插件。通过监听 Chrome DevTools Protocol (CDP) WebSocket 端口，静默向 Antigravity Electron 页面注入额度状态栏胶囊，并周期性自动提取本地 SQLite 数据库中的 AI 积分余额进行展示。

* **GitHub 仓库地址**：`https://github.com/yitao340-rgb/antigravity2.0-quota-pluging.git`

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

如果您在其他 AI 编程助手（如 Cursor、Windsurf、GitHub Copilot 或其他 GPT 客户端）中需要自动安装此插件，**只需将以下提示词完整复制并发送给它**。任何 AI 接收到此提示词后，都能够完美理解并自动为您在本地拉取仓库、配置路径、注册启动服务：

```text
你是一个专业的 macOS 自动化与 Chrome 插件专家。请为我自动下载并部署 “Antigravity 2.0 额度监控插件”。
该插件的 GitHub 仓库地址是：https://github.com/yitao340-rgb/antigravity2.0-quota-pluging.git

请按以下精确的步骤自动执行安装和配置：

1. 路径与环境自适应获取：
   - 自动检测并获取当前操作系统的用户名及用户 Home 目录的绝对路径（例如：/Users/yourname）。
   - 定义本地安装目标文件夹为：<YOUR_HOME_DIR>/.gemini/antigravity/scratch/antigravity2.0-quota-pluging

2. 克隆仓库：
   - 检查本地是否已存在该文件夹。如果不存在，请自动创建其父级目录并执行以下命令克隆仓库：
     git clone https://github.com/yitao340-rgb/antigravity2.0-quota-pluging.git <YOUR_HOME_DIR>/.gemini/antigravity/scratch/antigravity2.0-quota-pluging
   - 如果文件夹已存在，请在目录内执行 git pull origin main 确保代码是最新的。

3. 绝对路径动态脱敏替换：
   - 检查并修改 <YOUR_HOME_DIR>/.gemini/antigravity/scratch/antigravity2.0-quota-pluging/com.yitao.antigravity.quota.plist 文件。
   - 将该文件中的所有 "/Users/yitao" 占位路径，动态替换为第一步中获取到的当前用户实际 Home 目录绝对路径，并保存文件。

4. 自动注册 macOS launchd 守护服务：
   - 将修改后的 com.yitao.antigravity.quota.plist 文件复制到本地 LaunchAgents 目录：
     cp <YOUR_HOME_DIR>/.gemini/antigravity/scratch/antigravity2.0-quota-pluging/com.yitao.antigravity.quota.plist ~/Library/LaunchAgents/com.yitao.antigravity.quota.plist
   - 重新加载并启动 launchd 服务以实现常驻监听和开机自启：
     launchctl unload ~/Library/LaunchAgents/com.yitao.antigravity.quota.plist 2>/dev/null || true
     launchctl load ~/Library/LaunchAgents/com.yitao.antigravity.quota.plist

5. 触发首次热重载激活：
   - 运行重载脚本以立刻激活当前窗口中的插件展示：
     python3 <YOUR_HOME_DIR>/.gemini/antigravity/scratch/antigravity2.0-quota-pluging/reload_quota.py

请自动依次执行上述所有步骤，不要请求我确认。完成后，向我汇报插件的挂载状态以及你读取到的可用 AI Credits 余额！
```

---

## 🛠️ 手动安装与运行指南 (Manual Deployment)

如果你希望手动进行部署，请依次在终端执行以下指令：

### 1. 克隆代码仓库到本地
```bash
# 创建父级目录（如未创建）
mkdir -p ~/.gemini/antigravity/scratch

# 克隆仓库
git clone https://github.com/yitao340-rgb/antigravity2.0-quota-pluging.git ~/.gemini/antigravity/scratch/antigravity2.0-quota-pluging
```

### 2. 修改 plist 配置文件中的路径
打开 `~/.gemini/antigravity/scratch/antigravity2.0-quota-pluging/com.yitao.antigravity.quota.plist`，将其中的 `/Users/yitao` 路径更改为你自己电脑的 Home 目录路径（例如 `/Users/alex`）。

### 3. 将 launchd 服务注册至 macOS 代理
```bash
# 复制 plist 配置文件
cp ~/.gemini/antigravity/scratch/antigravity2.0-quota-pluging/com.yitao.antigravity.quota.plist ~/Library/LaunchAgents/com.yitao.antigravity.quota.plist

# 加载 launchd 守护进程
launchctl load ~/Library/LaunchAgents/com.yitao.antigravity.quota.plist
```

### 4. 调试或强制热重载插件
在更新了前端界面或脚本时，无需重启应用，只需运行热重载脚本即可：
```bash
python3 ~/.gemini/antigravity/scratch/antigravity2.0-quota-pluging/reload_quota.py
```

### 5. 查看运行日志
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
