# 随想便签 · 手机同步隔离测试沙箱 (Mobile Sync Sandbox)

本目录为**完全独立隔绝的测试环境**，绝不触碰现有的 `backend/` 与 `frontend/` 主代码。所有接收到的数据均保存在本地目录 `mobile_sync_sandbox/inbox_data/` 中。

---

## 快速上手测试（30 秒验证）

### 第一步：启动测试服务
双击运行根目录下的脚本：
```bash
mobile_sync_sandbox\start_sandbox.bat
```
或者在终端中运行：
```bash
python mobile_sync_sandbox/server.py
```
终端将输出：
* 🖥️ **电脑测试看板**：`http://localhost:8088/`
* 📱 **手机端页面**：`http://<你的局域网IP>:8088/mobile`
* 📂 **文件落盘路径**：`mobile_sync_sandbox/inbox_data/`

---

## 核心功能测试体验

### 1. 电脑端无缝拖拽体验
1. 浏览器打开 `http://localhost:8088/`。
2. 点击顶部 **“⚡ 模拟手机发送”**（或直接在手机上发送/把任何图片文件拖进 `mobile_sync_sandbox/inbox_data/` 文件夹）。
3. 右下角 **“📥 手机暂存抽屉”** 会立刻弹出红色数字徽标并刷新。
4. 打开抽屉，按住里面的卡片，**直接用鼠标拖出抽屉，松手放在画布任意位置**！
5. 卡片随即落位并支持自由拖动排版。

### 2. 手机真实端同步测试（同一 Wi-Fi）
1. 在电脑看板点击 **“📱 手机扫码配对”**。
2. 手机用相机或微信扫描屏幕上的二维码，即可打开手机端同步页面：
   * **截屏上传**：点击选择手机最新截图，一键上传。
   * **文字与链接**：长按粘贴文章段落或 B 站/知乎链接，点击发送。
3. 发送瞬间，电脑屏幕右下角暂存箱立刻弹出该内容！

### 3. 手机“系统分享菜单”打通说明
* **安卓 (Android)**：
  1. 在手机 Chrome 中打开 `http://<电脑IP>:8088/mobile`。
  2. 点击右上角菜单 `⋮` -> 选择 **“添加到主屏幕”**（利用了已配置的 W3C `share_target` PWA 标准）。
  3. 以后在相册截屏、或者复制文字后点击系统的“分享”，直接选择“便签同步”即可秒传！
  4. 也可参考 `android_companion/` 目录下的原生 Android `ACTION_SEND` 源码。
* **苹果 (iOS)**：
  1. 使用 iOS 自带的“快捷指令（Shortcuts）”。
  2. 新建一个在共享表单显示的指令，添加动作“获取 URL 内容 (POST)”，地址填 `http://<电脑IP>:8088/api/share` 即可！

---

## 隔离测试目录说明

* `server.py`：独立的 FastAPI 极简服务（端口 8088，不干扰现有 8000 与 5173 端口）。
* `inbox_data/`：同步文件落地目录。只要往这里放图片或文本，前端看板就能自动检索并出现。
* `static/index.html`：电脑端无限画布与右下角“暂存抽屉”拖拽原型。
* `static/mobile.html`：手机端界面。
* `static/manifest.json`：安卓系统分享 Target 配置文件。
* `android_companion/`：原生安卓 App 核心源码与 Manifest 配置。
