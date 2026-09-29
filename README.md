# 驾校科目一模拟考试系统

从零构建的移动端驾校科目一模拟考试系统，支持学员章节练习、错题重做、全真模拟，教练后台查看学员易错法规和预约考试建议。

## 功能特性

### 学员端
- **章节练习**：按章节顺序刷题，实时显示答案和通俗解释
- **错题重做**：自动收录错题，支持重做模式，做对可移出错题本
- **全真模拟**：100题随机抽题，45分钟计时，90分合格，真实考试体验
- **错题解释**：每道题都有"讲人话"的通俗解释，通俗易懂
- **移动端优先**：响应式设计，底部导航，适合碎片时间刷题

### 教练端
- **学员管理**：查看所有学员的练习情况、正确率、错题数
- **易错法规分析**：按章节统计错误率，找出每个学员的薄弱环节
- **预约考试建议**：根据学员表现智能生成预约建议和推荐日期
- **数据仪表盘**：全局统计，了解整体教学情况

### 系统特性
- **题库版本管理**：题目更新后自动保存历史版本，旧错题仍可回看（快照机制）
- **数据持久化**：SQLite 数据库，数据安全可靠
- **JWT 认证**：安全的用户认证和授权

## 技术栈

- **后端**：Node.js + Express + better-sqlite3
- **前端**：原生 JavaScript + 移动端优先 CSS
- **认证**：JWT + bcryptjs

## 快速开始

### 安装依赖
```bash
npm install
```

### 启动服务
```bash
npm start
```

服务将在 http://localhost:3000 启动。

### 演示账号

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 教练 | coach | coach123 |
| 学员 | zhangsan | student123 |
| 学员 | lisi | student123 |
| 学员 | wangwu | student123 |
| 学员 | zhaoliu | student123 |

## 题库结构

系统内置 100 道题目，覆盖 5 个章节：
1. 道路交通安全法律、法规和规章（20题）
2. 交通信号（20题）
3. 安全行车、文明驾驶基础知识（20题）
4. 机动车驾驶操作相关基础知识（20题）
5. 交通事故处理与法律责任（20题）

题目类型包括单选题和判断题，每道题都配有详细解释和通俗解释。

## 题库版本管理

当题目更新时：
1. 系统自动保存旧版本到 `question_versions` 表
2. 错题本中的题目使用快照数据，不受题库更新影响
3. 学员可以查看题目的历史版本

这确保了"题库更新后旧错题仍然能回看"的需求。

## API 接口

### 认证
- `POST /api/auth/register` - 注册
- `POST /api/auth/login` - 登录
- `GET /api/auth/me` - 获取当前用户信息

### 章节
- `GET /api/chapters` - 获取章节列表
- `GET /api/chapters/:id` - 获取章节详情

### 题目
- `GET /api/questions` - 获取题目列表
- `GET /api/questions/:id` - 获取单道题目
- `POST /api/questions` - 创建题目（教练）
- `PUT /api/questions/:id` - 更新题目（教练，创建新版本）
- `DELETE /api/questions/:id` - 删除题目（教练）
- `GET /api/questions/:id/versions` - 获取版本历史

### 练习
- `GET /api/practice/chapter/:chapterId` - 获取章节练习题目
- `POST /api/practice/answer` - 记录答题结果
- `GET /api/practice/stats` - 获取练习统计

### 错题本
- `GET /api/wrong` - 获取错题列表
- `POST /api/wrong/:id/redo` - 重做错题
- `POST /api/wrong/:id/master` - 标记为掌握
- `POST /api/wrong/:id/unmaster` - 取消掌握
- `DELETE /api/wrong/:id` - 移除错题

### 模拟考试
- `POST /api/exam/start` - 开始模拟考试
- `POST /api/exam/:id/submit` - 提交考试
- `GET /api/exam/records` - 获取考试记录
- `GET /api/exam/:id` - 获取考试详情

### 教练
- `GET /api/coach/students` - 获取学员列表
- `GET /api/coach/students/:id` - 获取学员详情（含易错法规分析）
- `GET /api/coach/students/:id/wrong-questions` - 获取学员错题详情
- `POST /api/coach/students/:id/appointment` - 创建/更新预约建议
- `GET /api/coach/appointments` - 获取预约列表
- `PUT /api/coach/appointments/:id` - 更新预约状态
- `GET /api/coach/stats/overview` - 获取全局统计

## 项目结构

```
/workspace
├── server/
│   ├── index.js          # 服务器入口
│   ├── db.js             # 数据库连接和 schema
│   ├── seed.js           # 种子数据
│   ├── migrate_add_questions.js  # 题库迁移脚本
│   ├── middleware/
│   │   └── auth.js       # 认证中间件
│   └── routes/
│       ├── auth.js       # 认证路由
│       ├── chapters.js   # 章节路由
│       ├── questions.js  # 题目路由
│       ├── practice.js   # 练习路由
│       ├── exam.js       # 考试路由
│       ├── wrong.js      # 错题路由
│       └── coach.js      # 教练路由
├── public/
│   ├── index.html        # 主页面
│   ├── css/
│   │   └── style.css     # 样式文件
│   └── js/
│       ├── api.js        # API 辅助模块
│       └── app.js        # 应用逻辑
├── data/                 # 数据库文件目录
└── package.json
```
