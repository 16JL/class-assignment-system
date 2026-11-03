# 部署文档

本文档面向需要在**全新机器**上部署本系统的运维人员。按本文档操作，可在任意 Windows / Linux / macOS 设备上完整复现运行环境。

---

## 一、环境要求

| 项目 | 要求 | 说明 |
|------|------|------|
| Node.js | >= 18（推荐 22 LTS） | 后端运行时 |
| npm | 随 Node.js 自带 | 包管理器 |
| Python | >= 3.7（可选） | 仅在使用 `init_db.py` 导入花名册时需要 |
| 磁盘 | >= 100 MB | 项目本体约 60 MB（不含依赖） |
| 内存 | >= 512 MB | 260 人并发建议 2 GB |
| 数据库 | 无需安装 | SQLite 嵌入式，随项目自带 |

### 后端依赖（npm 自动安装）

| 包名 | 版本 | 用途 |
|------|------|------|
| express | ^4.18.2 | Web 框架 |
| better-sqlite3 | ^11.0.0 | SQLite 驱动（原生模块） |
| cors | ^2.8.5 | 跨域支持 |
| multer | ^2.1.1 | 文件上传（Excel 导入） |
| xlsx | ^0.18.5 | Excel 读写 |

---

## 二、部署步骤

### 2.1 安装 Node.js

- **Windows**：访问 https://nodejs.org/ 下载 LTS 版 `.msi`，一路 Next 安装（保持 "Add to PATH" 勾选）
- **Linux (Ubuntu/Debian)**：
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
  sudo apt install -y nodejs
  ```
- **macOS**：`brew install node`

验证：
```bash
node --version   # 应输出 v18.x 或更高
npm --version
```

### 2.2 获取项目

```bash
git clone <你的仓库地址>.git
cd 志愿填报系统
```

或直接复制整个项目文件夹到目标机器。

### 2.3 安装依赖

```bash
# 方式一：根目录一键（推荐）
npm install          # 会自动为 backend 安装依赖

# 方式二：手动
cd backend
npm install
```

> **Linux 注意事项**：`better-sqlite3` 是原生模块，若报编译错误，先装编译工具链：
> ```bash
> sudo apt install -y build-essential python3
> ```

### 2.4 启动服务

```bash
# 方式一
npm start

# 方式二
cd backend && node server.js

# 方式三：Windows 双击 start.bat / Linux 执行 bash start.sh
```

看到如下输出即启动成功：
```
Server running on port 3000
入口页面: http://localhost:3000/login.html
学生端: http://localhost:3000/student.html
管理员端: http://localhost:3000/admin.html
```

### 2.5 开放端口

**Windows（管理员权限 PowerShell）：**
```powershell
netsh advfirewall firewall add rule name="ClassSystem-3000" dir=in action=allow protocol=TCP localport=3000
```

**Linux：**
```bash
sudo ufw allow 3000/tcp          # Ubuntu
sudo firewall-cmd --add-port=3000/tcp --permanent && sudo firewall-cmd --reload   # CentOS
```

**云服务器**：还需在控制台的**安全组**入方向放行 3000 端口（授权对象 `0.0.0.0/0`）。

### 2.6 验证

浏览器访问 `http://<服务器IP>:3000/login.html`，用演示账号登录：

| 角色 | 账号 | 密码 |
|------|------|------|
| 学生 | `2026000001` | `123456` |
| 管理员 | `admin` | `admin123` |

---

## 三、生产环境常驻运行

### Linux：systemd 服务

创建 `/etc/systemd/system/class-system.service`：

```ini
[Unit]
Description=Class Assignment System
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/志愿填报系统/backend
ExecStart=/usr/bin/node /path/to/志愿填报系统/backend/server.js
Restart=always
RestartSec=10
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable class-system
sudo systemctl start class-system
sudo systemctl status class-system
```

### 简易后台运行

```bash
nohup node server.js > server.log 2>&1 &
```

### Windows：开机自启

用「任务计划程序」创建基本任务：
- 触发器：计算机启动时
- 操作：启动程序 `node.exe`，参数 `server.js`，起始位置设为 `backend` 目录

### 生产建议：Nginx 反向代理

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

配置 SSL 后即可通过 HTTPS 访问，同时隐藏 3000 端口。

---

## 四、环境变量

当前版本**不需要配置任何环境变量**即可运行。如需自定义，可直接修改：

| 配置项 | 位置 | 默认值 |
|--------|------|--------|
| 服务端口 | `backend/server.js` 第 9 行 `const PORT` | `3000` |
| 数据库路径 | `backend/server.js` 第 12 行 `DB_PATH` | `../data/class_assignment.db` |
| 静态资源目录 | `backend/server.js` 第 100 行 | `../frontend` |
| 填报开始/截止时间 | 管理员端「时间设置」或 `settings` 表 | 见 `init_db.py` |

---

## 五、数据管理

### 备份

```bash
# 直接复制数据库文件
cp data/class_assignment.db data/class_assignment.db.bak.$(date +%Y%m%d)
```

建议频率：填报高峰期每日一次，平稳期每 2-3 天一次。

### 恢复

把备份的 `.db` 文件覆盖回 `data/` 目录，重启服务即可。

### 从零初始化（清空所有数据）

```bash
rm data/class_assignment.db
cd backend && python init_db.py
```

### 导入真实花名册

```bash
cd backend
pip install pandas openpyxl
python init_db.py /path/to/roster.xlsx
```

---

## 六、故障排查

| 现象 | 原因 | 解决 |
|------|------|------|
| `Cannot find module 'xxx'` | 依赖未安装 | `backend` 目录执行 `npm install` |
| `EADDRINUSE :3000` | 端口被占用 | 换端口或结束占用进程（`lsof -i:3000` / `netstat -ano \| findstr :3000`） |
| Linux 上 npm install 报 gyp 错误 | 缺编译工具 | `apt install build-essential python3` |
| 局域网访问不通 | 防火墙未放行 | 按 2.5 节开放 3000 端口 |
| 云服务器访问不通 | 安全组未放行 | 控制台安全组入方向添加 3000 |
| 页面样式丢失 | `frontend` 目录结构不完整 | 确认 `css/`、`js/`、`assets/` 齐全 |
| 图表空白 | 缺 `chart.umd.min.js` | 确认 `frontend/assets/chart.umd.min.js` 存在 |
| 提交志愿失败 | 已过截止时间 | 管理员端重设时间或改 `settings.end_time` |
| 数据库只读报错 | 文件权限不足 | `chmod 644 data/class_assignment.db`，目录需可写 |

---

## 七、并发性能参考

| 场景 | 表现 |
|------|------|
| 260 人同时在线浏览 | 2核2G 服务器可轻松支撑 |
| 提交志愿瞬时高峰 | SQLite 串行写入会排队，建议分专业错开截止时间 |
| 优化建议 | 分专业错峰截止（如大数据 16:00、云计算 16:30） |
