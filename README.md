# 分班志愿填报系统

一个面向高校专业分流场景的志愿填报与统计管理系统。学生在线完成方向偏好排序并提交志愿，管理员实时掌握填报进度、导出结果，并提供公开的实时数据大屏。

> 本项目由石家庄职业技术学院微专业分方向志愿填报系统演进而来，现以 MIT 协议开源。

---

## 目录

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [目录结构](#目录结构)
- [快速开始](#快速开始)
- [演示账号](#演示账号)
- [系统截图与页面入口](#系统截图与页面入口)
- [部署到服务器](#部署到服务器)
- [数据库说明](#数据库说明)
- [二次开发指南](#二次开发指南)
- [常见问题](#常见问题)
- [安全须知](#安全须知)
- [参与贡献](#参与贡献)
- [许可证](#许可证)

---

## 功能特性

### 学生端
- 学号 + 密码登录，首次登录强制修改密码
- **拖拽排序** 完成 5 个方向的偏好排序，交互直观
- 志愿提交后可查看/修改已提交记录
- 实时查看本专业的填报数据统计（柱状图 + 饼图）
- 登录失败 5 次自动锁定账户

### 管理员端
- 首页 5 张统计卡片：学生总数 / 已填报 / 未填报 / 大数据 / 云计算
- 分组图表：分专业展示各方向第一志愿分布与占比
- **各方向各志愿详细统计表**：逐方向展示第 1~4 志愿人数与填报率
- 学生管理：搜索、查看、编辑、删除、状态管理
- **批量导入**：上传 Excel 花名册一键建号
- **数据导出**：导出志愿结果为 Excel
- 填报时间控制：设置开始/截止时间，到点自动关闭
- 管理员账号分级（super / normal）与操作日志

### 公开端
- 实时数据大屏，无需登录即可查看整体填报进度
- 分专业图表 + 分方向占比，自动刷新

### 系统特性
- 专业数据隔离：大数据与云计算学生互不可见对方数据
- 业务规则校验：禁止跨方向选择、截止后禁止提交
- 全程离线运行，不依赖任何 CDN 或外部服务

---

## 技术栈

| 层次 | 技术 | 说明 |
|------|------|------|
| 后端 | Node.js (>= 18) + Express 4 | RESTful API，约 20 个接口 |
| 数据库 | SQLite 3 (better-sqlite3) | 嵌入式，零配置，单文件 |
| 前端 | 原生 HTML / CSS / JavaScript | 无构建步骤，改完刷新即生效 |
| 图表 | Chart.js 4 (本地打包) | 柱状图 + 饼图，含自定义数据标签插件 |
| 文件处理 | multer + xlsx | Excel 导入导出 |

---

## 目录结构

```
志愿填报系统/
├── backend/                        # 后端服务
│   ├── server.js                   # 主程序（约 1200 行，全部 API 与页面路由）
│   ├── package.json                # 后端依赖清单
│   └── init_db.py                  # 数据库初始化 / Excel 花名册导入
├── frontend/                       # 前端页面（纯静态，无构建）
│   ├── login.html                  # 登录页（学生 / 管理员双 Tab）
│   ├── student.html                # 学生端（填报 + 数据）
│   ├── admin.html                  # 管理员端（统计 + 管理）
│   ├── public-data.html            # 实时数据大屏（免登录）
│   ├── logo.png
│   ├── css/
│   │   └── login.css               # 登录页样式
│   ├── js/
│   │   └── login.js                # 登录交互逻辑
│   └── assets/
│       ├── chart.umd.min.js        # Chart.js 本地库
│       ├── logo.png
│       └── icons/                  # 方向图标、性别图标、功能图标
├── data/
│   └── class_assignment.db         # SQLite 数据库（含 266 条脱敏演示数据）
├── docs/
│   ├── 使用说明.md               # 操作使用手册（学生/管理员/大屏，含截图）
│   ├── DEPLOY.md                   # 详细部署文档
│   ├── 数据库结构.md                # 表结构说明
│   └── images/                     # 使用说明配套截图
├── package.json                    # 根目录便捷脚本
├── start.bat                       # Windows 一键启动
├── start.sh                        # Linux / macOS 一键启动
├── .gitignore
├── LICENSE                         # MIT
└── README.md
```

---

## 快速开始

### 环境要求

- **Node.js** >= 18（推荐 22 LTS）— [下载地址](https://nodejs.org/)
- 无需安装数据库，SQLite 已内置
- 磁盘空间 < 100 MB

### 三步启动

```bash
# 1. 安装依赖（根目录执行，会自动为 backend 安装）
npm install

# 2. 启动服务
npm start
```

Windows 用户也可以直接双击 **`start.bat`**，Linux / macOS 用户执行 `bash start.sh`。

### 访问

服务启动后控制台会打印访问地址：

| 页面 | 地址 |
|------|------|
| 登录页 | http://localhost:3000/login.html |
| 实时数据大屏 | http://localhost:3000/public-data.html |
| 学生端 | http://localhost:3000/student.html |
| 管理员端 | http://localhost:3000/admin.html |

> 📖 详细的操作步骤、界面截图与常见问题见 **[docs/使用说明.md](docs/使用说明.md)**

局域网内其他设备访问时，把 `localhost` 换成服务器的**内网 IP**（如 `http://192.168.1.100:3000/login.html`）。

---

## 演示账号

仓库自带的 `data/class_assignment.db` 已包含 **266 条脱敏学生数据**（姓名、学号全部为随机生成，不含任何真实个人信息）。

### 学生账号

| 学号 | 密码 |
|------|------|
| `2026000001` | `123456` |
| `2026000002` | `123456` |
| ... | `123456` |
| `2026000266` | `123456` |

> 学号规律：`2026` + 6 位序号。全部学生初始密码均为 `123456`。
> 其中约 265 人已提交志愿，可直接看到图表与统计效果。

### 管理员账号

| 用户名 | 密码 | 角色 |
|--------|------|------|
| `admin` | `admin123` | super（超级管理员） |
| `teacher01` | `teacher123` | normal（普通管理员） |

> **正式部署请务必第一时间修改这些默认密码。**

---

## 系统截图与页面入口

| 页面 | 说明 |
|------|------|
| `login.html` | 角色切换 Tab、密码显隐、记住我、实时数据入口 |
| `student.html` | 5 个方向卡片拖拽排序、提交志愿、本专业数据图表 |
| `admin.html` | 统计卡片、分组图表、详细统计表、学生管理、导入导出、时间设置 |
| `public-data.html` | 免登录实时大屏，分专业展示填报进度 |

五个分流方向：

- 大数据专业：大数据VR方向、大数据分析运维、大数据应用开发
- 云计算专业：云计算运维与安全、新媒体技术方向

---

## 部署到服务器

详细内容见 [docs/DEPLOY.md](docs/DEPLOY.md)，这里给出要点：

### Windows Server

```powershell
# 1. 安装 Node.js（nodejs.org 下载 LTS）
# 2. 复制项目文件夹到服务器
# 3. 安装依赖并启动
cd C:\path\to\backend
npm install
node server.js

# 4. 开放防火墙 3000 端口（管理员权限）
netsh advfirewall firewall add rule name="ClassSystem-3000" dir=in action=allow protocol=TCP localport=3000
```

### Linux（Ubuntu / CentOS）

```bash
# 安装 Node.js
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt install -y nodejs

# 安装依赖
cd /path/to/project/backend
npm install

# 后台常驻运行
nohup node server.js > server.log 2>&1 &

# 开放端口
sudo ufw allow 3000/tcp
```

> ⚠️ `better-sqlite3` 是原生模块，在部分 Linux 上需要编译工具：
> `sudo apt install -y build-essential python3`

### 修改端口

编辑 `backend/server.js` 第 9 行：`const PORT = 3000;`

---

## 数据库说明

数据库文件：`data/class_assignment.db`（SQLite 单文件，可直接复制备份）

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| `students` | 学生账号与班级 | student_id, name, password, major, class_name, gender, status |
| `preferences` | 志愿记录 | student_id, choice1~choice4, updated_at |
| `admins` | 管理员账号 | username, password, display_name, role, status |
| `settings` | 系统设置 | key, value（start_time / end_time / registration_open） |
| `sessions` | 登录会话 | token, user_type, expires_at |
| `operation_logs` | 操作日志 | admin_id, action, detail |

详细字段定义见 [docs/数据库结构.md](docs/数据库结构.md)。

### 从零重建数据库

```bash
cd backend
python init_db.py                  # 只建表 + 演示管理员
python init_db.py roster.xlsx      # 建表并导入花名册
```

花名册 Excel 要求：第 1 行表头，第 1 列为班级名，第 2 列学号，第 3 列姓名；学号第 5-6 位 `10` = 大数据，`09` = 云计算。

### 备份

**直接复制 `data/class_assignment.db` 文件即可。** 填报高峰期建议每天备份一次。

---

## 二次开发指南

### 修改分流方向

方向名称分散在以下几处，改的时候要同步：

| 位置 | 说明 |
|------|------|
| `backend/server.js` 第 332 / 385 / 519 / 555 / 589 / 712 行 | 后端方向数组与统计逻辑 |
| `frontend/student.html` 第 625 行起 | 学生端方向卡片定义（`BIG_DATA_DIRS` 等） |
| `frontend/admin.html` 第 2229 行起 | 管理员端方向配色映射 |

### 修改专业分组

`students.major` 字段取值（`大数据` / `云计算`）决定分组逻辑，涉及：
- `backend/server.js` 中的 `major` 判断分支
- `frontend/student.html` 的专业隔离显示逻辑

### 前端改动

前端是纯静态文件，**无构建步骤**。改完 HTML/CSS/JS 刷新浏览器即可看到效果。

---

## 常见问题

**Q：启动报 `Cannot find module 'better-sqlite3'`？**
A：依赖没装全。在 `backend` 目录重新执行 `npm install`。

**Q：Linux 上 `npm install` 报编译错误？**
A：缺少编译工具链，执行 `sudo apt install -y build-essential python3` 后重试。

**Q：局域网其他设备访问不了？**
A：① 服务监听的是 `0.0.0.0:3000`，确认服务已启动；② 服务器防火墙需放行 3000 端口；③ 云服务器还需在**安全组**放行 3000 端口；④ 确认访问的是服务器内网/公网 IP 而非 `localhost`。

**Q：填报提交按钮点不了 / 提示已截止？**
A：管理员端「时间设置」中的截止时间已过。修改 `settings` 表的 `end_time`，或在管理员端重新设置。

**Q：图表不显示？**
A：`frontend/assets/chart.umd.min.js` 缺失会导致图表无法渲染。确认该文件存在，且 `frontend` 目录结构完整。

**Q：学生登录后看不到数据？**
A：检查该学生的 `major` 字段是否有值。专业为空时数据隔离逻辑无法匹配分组。

**Q：提交志愿时报「禁止跨方向选择」？**
A：业务规则要求同一志愿组合不得跨专业大类，检查所选方向是否都属于该学生本专业。

---

## 安全须知

> 本项目定位为**教学实践 / 校内局域网**场景，开源版本在安全性上做了取舍。用于生产环境前请务必完成以下加固：

1. **修改所有默认密码**（管理员 `admin123` / `teacher123`，学生 `123456`）
2. **密码加盐哈希存储** —— 当前 `students.password` 与 `admins.password` 为明文存储，生产环境应改为 bcrypt / argon2
3. **启用 HTTPS** —— 建议用 Nginx 反向代理并配置 SSL 证书
4. **限制访问来源** —— 通过防火墙或 Nginx 限制 IP 段，避免暴露到公网
5. **定期备份数据库** —— 复制 `data/class_assignment.db` 即可
6. **会话过期** —— 检查 `sessions` 表的 `expires_at` 策略，避免长期有效令牌

---

## 参与贡献

欢迎提交 Issue 和 Pull Request。

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/your-feature`
3. 提交改动：`git commit -m "feat: 描述你的改动"`
4. 推送分支：`git push origin feature/your-feature`
5. 发起 Pull Request

提交前请确保：服务能正常启动、学生端与管理员端核心流程可跑通。

---

## 许可证

本项目基于 [MIT License](LICENSE) 开源。

数据库中包含的 266 条学生数据**全部为随机生成的虚构数据**，不含任何真实个人信息。
