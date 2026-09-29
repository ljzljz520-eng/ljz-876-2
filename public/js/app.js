// 主应用
class App {
  constructor() {
    this.user = null;
    this.chapters = [];
    this.currentPage = null;
    this.init();
  }

  async init() {
    const token = localStorage.getItem('token');
    if (token) {
      API.setToken(token);
      try {
        const res = await API.get('/auth/me');
        this.user = res.user;
        await this.loadChapters();
        this.route();
      } catch (err) {
        API.setToken(null);
        this.route();
      }
    } else {
      this.route();
    }
  }

  async loadChapters() {
    try {
      const res = await API.get('/chapters');
      this.chapters = res.chapters;
    } catch (err) {
      console.error('加载章节失败', err);
    }
  }

  onAuthExpired() {
    this.user = null;
    this.route();
  }

  route() {
    const hash = window.location.hash.slice(1) || '/';
    const app = document.getElementById('app');

    if (!this.user) {
      app.innerHTML = this.renderLogin();
      this.bindLogin();
      return;
    }

    if (this.user.role === 'coach') {
      this.routeCoach(hash, app);
    } else {
      this.routeStudent(hash, app);
    }
  }

  // ==================== 登录页 ====================
  renderLogin() {
    return `
      <div class="login-page">
        <div class="login-logo">
          <div class="login-logo-icon">🚗</div>
          <h1>科目一模拟考试</h1>
          <p>驾校理论考试备考系统</p>
        </div>
        <div class="login-card">
          <div class="login-tabs">
            <div class="login-tab active" data-tab="login">登录</div>
            <div class="login-tab" data-tab="register">注册</div>
          </div>
          <div id="login-error"></div>
          <form id="login-form">
            <div class="form-group">
              <label class="form-label">用户名</label>
              <input type="text" class="form-input" id="login-username" placeholder="请输入用户名" required>
            </div>
            <div class="form-group">
              <label class="form-label">密码</label>
              <input type="password" class="form-input" id="login-password" placeholder="请输入密码" required>
            </div>
            <button type="submit" class="btn btn-primary btn-block">登录</button>
          </form>
          <form id="register-form" style="display:none;">
            <div class="form-group">
              <label class="form-label">用户名</label>
              <input type="text" class="form-input" id="reg-username" placeholder="请设置用户名" required>
            </div>
            <div class="form-group">
              <label class="form-label">姓名</label>
              <input type="text" class="form-input" id="reg-name" placeholder="请输入真实姓名" required>
            </div>
            <div class="form-group">
              <label class="form-label">手机号</label>
              <input type="tel" class="form-input" id="reg-phone" placeholder="请输入手机号（选填）">
            </div>
            <div class="form-group">
              <label class="form-label">密码</label>
              <input type="password" class="form-input" id="reg-password" placeholder="请设置密码（至少6位）" required>
            </div>
            <button type="submit" class="btn btn-primary btn-block">注册</button>
          </form>
          <div style="margin-top:16px; padding-top:16px; border-top:1px solid var(--border); font-size:12px; color:var(--text-hint);">
            <div>演示账号：</div>
            <div>学员：zhangsan / student123</div>
            <div>教练：coach / coach123</div>
          </div>
        </div>
      </div>
    `;
  }

  bindLogin() {
    const tabs = document.querySelectorAll('.login-tab');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const errorBox = document.getElementById('login-error');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        if (tab.dataset.tab === 'login') {
          loginForm.style.display = 'block';
          registerForm.style.display = 'none';
        } else {
          loginForm.style.display = 'none';
          registerForm.style.display = 'block';
        }
        errorBox.innerHTML = '';
      });
    });

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('login-username').value;
      const password = document.getElementById('login-password').value;
      try {
        const res = await API.post('/auth/login', { username, password });
        API.setToken(res.token);
        this.user = res.user;
        await this.loadChapters();
        this.route();
      } catch (err) {
        errorBox.innerHTML = `<div class="login-error">${err.message}</div>`;
      }
    });

    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('reg-username').value;
      const name = document.getElementById('reg-name').value;
      const phone = document.getElementById('reg-phone').value;
      const password = document.getElementById('reg-password').value;
      try {
        const res = await API.post('/auth/register', { username, name, phone, password });
        API.setToken(res.token);
        this.user = res.user;
        await this.loadChapters();
        this.route();
      } catch (err) {
        errorBox.innerHTML = `<div class="login-error">${err.message}</div>`;
      }
    });
  }

  // ==================== 学员端路由 ====================
  routeStudent(hash, app) {
    const [path, ...args] = hash.split('/').filter(Boolean);
    switch (path) {
      case '':
      case 'home':
        app.innerHTML = this.renderStudentHome();
        this.bindStudentHome();
        break;
      case 'chapters':
        app.innerHTML = this.renderChapters();
        this.bindChapters();
        break;
      case 'practice':
        app.innerHTML = this.renderPractice(args[0], args[1]);
        this.bindPractice(args[0], args[1]);
        break;
      case 'wrong':
        app.innerHTML = this.renderWrong();
        this.bindWrong();
        break;
      case 'redo':
        app.innerHTML = this.renderRedo();
        this.bindRedo();
        break;
      case 'exam':
        app.innerHTML = this.renderExam();
        this.bindExam();
        break;
      case 'exam-result':
        app.innerHTML = this.renderExamResult(args[0]);
        this.bindExamResult(args[0]);
        break;
      case 'profile':
        app.innerHTML = this.renderProfile();
        this.bindProfile();
        break;
      default:
        app.innerHTML = this.renderStudentHome();
        this.bindStudentHome();
    }
  }

  renderBottomNav(active) {
    const navs = [
      { key: 'home', icon: '🏠', label: '首页', hash: '#/home' },
      { key: 'chapters', icon: '📚', label: '章节练习', hash: '#/chapters' },
      { key: 'wrong', icon: '📝', label: '错题本', hash: '#/wrong' },
      { key: 'exam', icon: '🎯', label: '模拟考试', hash: '#/exam' },
      { key: 'profile', icon: '👤', label: '我的', hash: '#/profile' },
    ];
    return `
      <div class="bottom-nav">
        ${navs.map(n => `
          <div class="nav-item-wrapper">
            <a class="nav-item ${active === n.key ? 'active' : ''}" href="${n.hash}">
              <span class="nav-icon">${n.icon}</span>
              <span>${n.label}</span>
            </a>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ==================== 学员首页 ====================
  renderStudentHome() {
    return `
      <div class="page">
        <div class="app-header" style="margin:-16px -16px 16px;">
          <h1>🚗 科目一模拟考试</h1>
          <span style="font-size:13px;opacity:0.9;">你好，${this.user.name}</span>
        </div>
        <div id="home-stats"></div>
        <div class="card" style="background:linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%); color:#fff;">
          <div style="font-size:18px;font-weight:600;margin-bottom:8px;">开始备考</div>
          <div style="font-size:13px;opacity:0.9;margin-bottom:16px;">章节练习 · 错题重做 · 全真模拟</div>
          <div style="display:flex;gap:10px;">
            <a href="#/chapters" class="btn" style="background:#fff;color:var(--primary);flex:1;">章节练习</a>
            <a href="#/exam" class="btn" style="background:rgba(255,255,255,0.2);color:#fff;flex:1;">模拟考试</a>
          </div>
        </div>
        <div class="card">
          <div class="card-title">📋 考试须知</div>
          <div style="font-size:13px;color:var(--text-secondary);line-height:1.8;">
            <div>• 考试时间：45分钟</div>
            <div>• 题目数量：100题（单选+判断）</div>
            <div>• 合格标准：90分合格</div>
            <div>• 备考建议：先章节练习，再错题重做，最后模拟考试</div>
          </div>
        </div>
        <div id="home-chapters"></div>
      </div>
      ${this.renderBottomNav('home')}
    `;
  }

  async bindStudentHome() {
    try {
      const [statsRes, chaptersRes] = await Promise.all([
        API.get('/practice/stats'),
        API.get('/chapters'),
      ]);
      this.chapters = chaptersRes.chapters;
      const stats = statsRes;
      document.getElementById('home-stats').innerHTML = `
        <div class="stats-grid">
          <div class="stat-item">
            <div class="stat-value">${stats.totalPracticed}</div>
            <div class="stat-label">已练习题数</div>
          </div>
          <div class="stat-item">
            <div class="stat-value success">${stats.accuracy}%</div>
            <div class="stat-label">正确率</div>
          </div>
          <div class="stat-item">
            <div class="stat-value danger">${stats.wrongCount}</div>
            <div class="stat-label">错题数</div>
          </div>
        </div>
      `;
      const chaptersHtml = this.chapters.slice(0, 3).map(c => `
        <div class="chapter-item" onclick="location.hash='#/practice/${c.id}/0'">
          <div class="chapter-item-header">
            <div class="chapter-name">${c.name}</div>
            <div class="chapter-arrow">›</div>
          </div>
          <div class="chapter-meta">
            <span>共 ${c.question_count} 题</span>
            <span>已练 ${c.practiced_count} 题</span>
            ${c.wrong_count > 0 ? `<span class="meta-wrong">错题 ${c.wrong_count}</span>` : ''}
          </div>
        </div>
      `).join('');
      document.getElementById('home-chapters').innerHTML = `
        <div class="card-title" style="margin-top:8px;">📚 章节练习</div>
        <div class="chapter-list">${chaptersHtml}</div>
        <a href="#/chapters" style="display:block;text-align:center;padding:12px;color:var(--primary);font-size:14px;">查看全部章节 →</a>
      `;
    } catch (err) {
      Utils.toast(err.message);
    }
  }

  // ==================== 章节列表 ====================
  renderChapters() {
    return `
      <div class="page">
        <div class="app-header" style="margin:-16px -16px 16px;">
          <h1>📚 章节练习</h1>
        </div>
        <div class="chapter-list" id="chapter-list">
          <div class="loading"><div class="loading-spinner"></div>加载中...</div>
        </div>
      </div>
      ${this.renderBottomNav('chapters')}
    `;
  }

  async bindChapters() {
    try {
      const res = await API.get('/chapters');
      this.chapters = res.chapters;
      const html = this.chapters.map(c => {
        const progress = c.question_count > 0 ? Math.round((c.practiced_count / c.question_count) * 100) : 0;
        return `
          <div class="chapter-item" onclick="location.hash='#/practice/${c.id}/0'">
            <div class="chapter-item-header">
              <div class="chapter-name">${c.name}</div>
              <div class="chapter-arrow">›</div>
            </div>
            <div class="chapter-desc">${c.description || ''}</div>
            <div class="chapter-meta">
              <span>共 ${c.question_count} 题</span>
              <span>已练 ${c.practiced_count} 题</span>
              ${c.wrong_count > 0 ? `<span class="meta-wrong">错题 ${c.wrong_count}</span>` : ''}
            </div>
            <div class="progress-bar">
              <div class="progress-fill ${progress === 100 ? 'success' : ''}" style="width:${progress}%"></div>
            </div>
          </div>
        `;
      }).join('');
      document.getElementById('chapter-list').innerHTML = html;
    } catch (err) {
      document.getElementById('chapter-list').innerHTML = `<div class="empty-state"><div class="empty-state-icon">😕</div><div class="empty-state-text">${err.message}</div></div>`;
    }
  }

  // ==================== 答题界面 ====================
  renderPractice(chapterId, mode) {
    return `
      <div class="quiz-container" id="quiz-container">
        <div class="loading"><div class="loading-spinner"></div>加载题目中...</div>
      </div>
    `;
  }

  async bindPractice(chapterId, mode) {
    const container = document.getElementById('quiz-container');
    let questions = [];
    let currentIndex = 0;
    let selectedAnswer = null;
    let showExplanation = false;
    let isRedo = mode === 'redo';

    try {
      if (isRedo) {
        // 错题重做模式
        const res = await API.get('/wrong?mastered=false');
        questions = res.wrongQuestions.map(w => ({
          ...w.question,
          wrongId: w.id,
          wrongCount: w.wrong_count,
        }));
      } else {
        // 章节练习模式
        const res = await API.get(`/practice/chapter/${chapterId}?limit=100`);
        questions = res.questions;
      }

      if (questions.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">🎉</div>
            <div class="empty-state-text">${isRedo ? '太棒了，没有错题！' : '该章节暂无题目'}</div>
            <a href="#/chapters" class="btn btn-primary" style="margin-top:16px;">返回章节</a>
          </div>
        `;
        return;
      }

      renderQuestion();
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">😕</div><div class="empty-state-text">${err.message}</div></div>`;
    }

    function renderQuestion() {
      const q = questions[currentIndex];
      const chapterName = Utils.getChapterName(q.chapter_id);
      const typeLabel = q.type === 'judge' ? '判断题' : '单选题';
      const options = q.options;

      container.innerHTML = `
        <div class="quiz-progress">
          <span>${currentIndex + 1}/${questions.length}</span>
          <div class="quiz-progress-bar"><div class="quiz-progress-fill" style="width:${((currentIndex + 1) / questions.length) * 100}%"></div></div>
          <span>${chapterName.substring(0, 4)}</span>
        </div>
        ${isRedo ? `<div class="redo-mode-banner"><span>🔄 错题重做 · 已错 ${q.wrongCount || 1} 次</span><span style="font-size:12px;">做对可移出错题本</span></div>` : ''}
        <div class="question-card">
          <span class="question-type-tag">${typeLabel}</span>
          <div class="question-content">${q.content}</div>
          <div class="options-list" id="options-list">
            ${options.map((opt, i) => {
              const letter = String.fromCharCode(65 + i);
              return `
                <div class="option-item" data-letter="${letter}">
                  <div class="option-letter">${letter}</div>
                  <div class="option-text">${opt}</div>
                </div>
              `;
            }).join('')}
          </div>
          <div id="explanation-area"></div>
        </div>
        <div class="quiz-actions">
          <button class="btn btn-secondary" id="prev-btn" ${currentIndex === 0 ? 'disabled' : ''}>上一题</button>
          <button class="btn btn-primary" id="submit-btn" disabled>确认答案</button>
        </div>
      `;

      selectedAnswer = null;
      showExplanation = false;

      const optionItems = container.querySelectorAll('.option-item');
      const submitBtn = document.getElementById('submit-btn');
      const prevBtn = document.getElementById('prev-btn');

      optionItems.forEach(item => {
        item.addEventListener('click', () => {
          if (showExplanation) return;
          optionItems.forEach(o => o.classList.remove('selected'));
          item.classList.add('selected');
          selectedAnswer = item.dataset.letter;
          submitBtn.disabled = false;
        });
      });

      submitBtn.addEventListener('click', () => {
        if (!selectedAnswer || showExplanation) return;
        submitAnswer();
      });

      prevBtn.addEventListener('click', () => {
        if (currentIndex > 0) {
          currentIndex--;
          renderQuestion();
        }
      });
    }

    async function submitAnswer() {
      const q = questions[currentIndex];
      const isCorrect = selectedAnswer === q.answer;
      showExplanation = true;

      // 显示正确/错误
      const optionItems = container.querySelectorAll('.option-item');
      optionItems.forEach(item => {
        item.style.pointerEvents = 'none';
        if (item.dataset.letter === q.answer) {
          item.classList.add('correct');
        } else if (item.dataset.letter === selectedAnswer && !isCorrect) {
          item.classList.add('wrong');
        }
      });

      // 显示解释
      const explanationArea = document.getElementById('explanation-area');
      explanationArea.innerHTML = `
        <div class="explanation-box ${isCorrect ? 'correct' : 'wrong'}">
          <div class="explanation-title">${isCorrect ? '✅ 回答正确' : '❌ 回答错误'}</div>
          <div class="explanation-text">正确答案：${q.answer}</div>
          ${q.explanation ? `<div class="explanation-text" style="margin-top:6px;">${q.explanation}</div>` : ''}
          ${q.explanation_plain ? `<div class="explanation-plain">${q.explanation_plain}</div>` : ''}
        </div>
      `;

      // 记录答题结果
      try {
        if (isRedo) {
          await API.post(`/wrong/${q.wrongId}/redo`, { is_correct: isCorrect });
        } else {
          await API.post('/practice/answer', {
            question_id: q.id,
            chapter_id: q.chapter_id,
            is_correct: isCorrect,
          });
        }
      } catch (err) {
        console.error('记录答题失败', err);
      }

      // 更新按钮
      const submitBtn = document.getElementById('submit-btn');
      submitBtn.textContent = currentIndex === questions.length - 1 ? '完成练习' : '下一题';
      submitBtn.disabled = false;
      submitBtn.onclick = () => {
        if (currentIndex === questions.length - 1) {
          if (isRedo) {
            location.hash = '#/wrong';
          } else {
            location.hash = '#/chapters';
          }
        } else {
          currentIndex++;
          renderQuestion();
        }
      };
    }
  }

  // ==================== 错题本 ====================
  renderWrong() {
    return `
      <div class="page">
        <div class="app-header" style="margin:-16px -16px 16px;">
          <h1>📝 错题本</h1>
          <button class="header-action" onclick="location.hash='#/redo'">重做错题</button>
        </div>
        <div class="wrong-filter" id="wrong-filter">
          <div class="filter-chip active" data-filter="active">未掌握</div>
          <div class="filter-chip" data-filter="mastered">已掌握</div>
          <div class="filter-chip" data-filter="all">全部</div>
        </div>
        <div id="wrong-list"></div>
      </div>
      ${this.renderBottomNav('wrong')}
    `;
  }

  async bindWrong() {
    const listEl = document.getElementById('wrong-list');
    const filterEl = document.getElementById('wrong-filter');
    let currentFilter = 'active';

    filterEl.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        filterEl.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentFilter = chip.dataset.filter;
        loadWrong();
      });
    });

    async function loadWrong() {
      listEl.innerHTML = '<div class="loading"><div class="loading-spinner"></div>加载中...</div>';
      try {
        let url = '/wrong';
        if (currentFilter === 'active') url += '?mastered=false';
        else if (currentFilter === 'mastered') url += '?mastered=true';
        const res = await API.get(url);
        renderWrongList(res.wrongQuestions);
      } catch (err) {
        listEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">😕</div><div class="empty-state-text">${err.message}</div></div>`;
      }
    }

    function renderWrongList(wrongQuestions) {
      if (wrongQuestions.length === 0) {
        listEl.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">🎉</div>
            <div class="empty-state-text">${currentFilter === 'active' ? '太棒了，没有错题！' : '暂无记录'}</div>
          </div>
        `;
        return;
      }
      listEl.innerHTML = wrongQuestions.map(w => {
        const q = w.question;
        const chapterName = Utils.getChapterName(q.chapter_id);
        return `
          <div class="wrong-item">
            <div class="wrong-item-content">${q.content}</div>
            <div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px;">
              正确答案：<span style="color:var(--success);font-weight:600;">${q.answer}</span>
              ${q.explanation_plain ? `<div style="margin-top:4px;font-style:italic;">💡 ${q.explanation_plain}</div>` : ''}
            </div>
            <div class="wrong-item-meta">
              <span>${chapterName} · 错 ${w.wrong_count} 次</span>
              <span class="wrong-count-badge">${w.mastered ? '已掌握' : '未掌握'}</span>
            </div>
          </div>
        `;
      }).join('');
    }

    loadWrong();
  }

  // ==================== 错题重做 ====================
  renderRedo() {
    return `<div class="quiz-container" id="redo-container"><div class="loading"><div class="loading-spinner"></div>加载中...</div></div>`;
  }

  async bindRedo() {
    // 复用答题逻辑，使用 redo 模式
    const container = document.getElementById('redo-container');
    let questions = [];
    let currentIndex = 0;
    let selectedAnswer = null;
    let showExplanation = false;

    try {
      const res = await API.get('/wrong?mastered=false');
      questions = res.wrongQuestions.map(w => ({
        ...w.question,
        wrongId: w.id,
        wrongCount: w.wrong_count,
      }));

      if (questions.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">🎉</div>
            <div class="empty-state-text">太棒了，没有错题！</div>
            <a href="#/wrong" class="btn btn-primary" style="margin-top:16px;">返回错题本</a>
          </div>
        `;
        return;
      }
      renderQuestion();
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">😕</div><div class="empty-state-text">${err.message}</div></div>`;
    }

    function renderQuestion() {
      const q = questions[currentIndex];
      const options = q.options;
      container.innerHTML = `
        <div class="quiz-progress">
          <span>${currentIndex + 1}/${questions.length}</span>
          <div class="quiz-progress-bar"><div class="quiz-progress-fill" style="width:${((currentIndex + 1) / questions.length) * 100}%"></div></div>
          <span>错题重做</span>
        </div>
        <div class="redo-mode-banner"><span>🔄 已错 ${q.wrongCount || 1} 次</span><span style="font-size:12px;">做对可移出错题本</span></div>
        <div class="question-card">
          <span class="question-type-tag">${q.type === 'judge' ? '判断题' : '单选题'}</span>
          <div class="question-content">${q.content}</div>
          <div class="options-list" id="options-list">
            ${options.map((opt, i) => {
              const letter = String.fromCharCode(65 + i);
              return `<div class="option-item" data-letter="${letter}"><div class="option-letter">${letter}</div><div class="option-text">${opt}</div></div>`;
            }).join('')}
          </div>
          <div id="explanation-area"></div>
        </div>
        <div class="quiz-actions">
          <button class="btn btn-secondary" id="prev-btn" ${currentIndex === 0 ? 'disabled' : ''}>上一题</button>
          <button class="btn btn-primary" id="submit-btn" disabled>确认答案</button>
        </div>
      `;

      selectedAnswer = null;
      showExplanation = false;
      const optionItems = container.querySelectorAll('.option-item');
      const submitBtn = document.getElementById('submit-btn');
      const prevBtn = document.getElementById('prev-btn');

      optionItems.forEach(item => {
        item.addEventListener('click', () => {
          if (showExplanation) return;
          optionItems.forEach(o => o.classList.remove('selected'));
          item.classList.add('selected');
          selectedAnswer = item.dataset.letter;
          submitBtn.disabled = false;
        });
      });

      submitBtn.addEventListener('click', () => {
        if (!selectedAnswer || showExplanation) return;
        submitAnswer();
      });

      prevBtn.addEventListener('click', () => {
        if (currentIndex > 0) {
          currentIndex--;
          renderQuestion();
        }
      });
    }

    async function submitAnswer() {
      const q = questions[currentIndex];
      const isCorrect = selectedAnswer === q.answer;
      showExplanation = true;
      const optionItems = container.querySelectorAll('.option-item');
      optionItems.forEach(item => {
        item.style.pointerEvents = 'none';
        if (item.dataset.letter === q.answer) item.classList.add('correct');
        else if (item.dataset.letter === selectedAnswer && !isCorrect) item.classList.add('wrong');
      });
      const explanationArea = document.getElementById('explanation-area');
      explanationArea.innerHTML = `
        <div class="explanation-box ${isCorrect ? 'correct' : 'wrong'}">
          <div class="explanation-title">${isCorrect ? '✅ 回答正确' : '❌ 回答错误'}</div>
          <div class="explanation-text">正确答案：${q.answer}</div>
          ${q.explanation ? `<div class="explanation-text" style="margin-top:6px;">${q.explanation}</div>` : ''}
          ${q.explanation_plain ? `<div class="explanation-plain">${q.explanation_plain}</div>` : ''}
        </div>
      `;
      try {
        await API.post(`/wrong/${q.wrongId}/redo`, { is_correct: isCorrect });
      } catch (err) {
        console.error('记录失败', err);
      }
      const submitBtn = document.getElementById('submit-btn');
      submitBtn.textContent = currentIndex === questions.length - 1 ? '完成' : '下一题';
      submitBtn.disabled = false;
      submitBtn.onclick = () => {
        if (currentIndex === questions.length - 1) {
          location.hash = '#/wrong';
        } else {
          currentIndex++;
          renderQuestion();
        }
      };
    }
  }

  // ==================== 模拟考试 ====================
  renderExam() {
    return `
      <div class="page">
        <div class="app-header" style="margin:-16px -16px 16px;">
          <h1>🎯 全真模拟</h1>
        </div>
        <div class="exam-intro">
          <div class="exam-intro-icon">📝</div>
          <h2>科目一模拟考试</h2>
          <p>全真模拟真实考试环境</p>
          <div class="exam-rules">
            <h3>📋 考试规则</h3>
            <ul>
              <li>考试时间：45分钟</li>
              <li>题目数量：100题</li>
              <li>题目类型：单选题 + 判断题</li>
              <li>合格标准：90分合格</li>
              <li>系统自动计时，超时自动交卷</li>
            </ul>
          </div>
          <button class="btn btn-primary btn-block" id="start-exam-btn" style="font-size:16px;padding:14px;">开始考试</button>
        </div>
        <div id="exam-records" style="margin-top:24px;"></div>
      </div>
      ${this.renderBottomNav('exam')}
    `;
  }

  async bindExam() {
    const startBtn = document.getElementById('start-exam-btn');
    const recordsEl = document.getElementById('exam-records');

    startBtn.addEventListener('click', async () => {
      startBtn.disabled = true;
      startBtn.textContent = '正在准备...';
      try {
        const res = await API.post('/exam/start', {});
        this.startExam(res);
      } catch (err) {
        Utils.toast(err.message);
        startBtn.disabled = false;
        startBtn.textContent = '开始考试';
      }
    });

    // 加载考试记录
    try {
      const res = await API.get('/exam/records');
      if (res.records.length > 0) {
        recordsEl.innerHTML = `
          <div class="card-title">📊 历史成绩</div>
          ${res.records.map(r => `
            <div class="exam-record-item" onclick="location.hash='#/exam-result/${r.id}'">
              <div class="exam-record-info">
                <div class="exam-record-date">${Utils.formatDate(r.started_at)}</div>
                <div style="font-size:12px;color:var(--text-hint);">用时 ${Utils.formatDuration(r.duration_seconds)}</div>
              </div>
              <div style="text-align:right;">
                <div class="exam-record-score ${r.passed ? 'pass' : 'fail'}">${r.score}分</div>
                <span class="exam-record-status ${r.passed ? 'pass' : 'fail'}">${r.passed ? '合格' : '不合格'}</span>
              </div>
            </div>
          `).join('')}
        `;
      }
    } catch (err) {
      console.error('加载考试记录失败', err);
    }
  }

  startExam(examData) {
    const { examId, questions, duration } = examData;
    let currentIndex = 0;
    const answers = {};
    let timeLeft = duration;
    let timer = null;

    const container = document.getElementById('app');
    container.innerHTML = `
      <div class="quiz-container">
        <div class="quiz-progress">
          <span>${currentIndex + 1}/${questions.length}</span>
          <div class="quiz-progress-bar"><div class="quiz-progress-fill" style="width:${((currentIndex + 1) / questions.length) * 100}%"></div></div>
          <div class="exam-timer" id="exam-timer">${Utils.formatDuration(timeLeft)}</div>
        </div>
        <div id="exam-question-area"></div>
        <div class="quiz-actions">
          <button class="btn btn-secondary" id="exam-prev-btn" ${currentIndex === 0 ? 'disabled' : ''}>上一题</button>
          <button class="btn btn-primary" id="exam-next-btn">下一题</button>
        </div>
      </div>
    `;

    const questionArea = document.getElementById('exam-question-area');
    const timerEl = document.getElementById('exam-timer');

    function startTimer() {
      timer = setInterval(() => {
        timeLeft--;
        timerEl.textContent = Utils.formatDuration(timeLeft);
        if (timeLeft <= 300) {
          timerEl.classList.add('warning');
        }
        if (timeLeft <= 0) {
          clearInterval(timer);
          submitExam();
        }
      }, 1000);
    }

    function renderQuestion() {
      const q = questions[currentIndex];
      const options = q.options;
      questionArea.innerHTML = `
        <div class="question-card">
          <span class="question-type-tag">${q.type === 'judge' ? '判断题' : '单选题'}</span>
          <div class="question-content">${q.content}</div>
          <div class="options-list" id="exam-options">
            ${options.map((opt, i) => {
              const letter = String.fromCharCode(65 + i);
              const selected = answers[q.id] === letter;
              return `<div class="option-item ${selected ? 'selected' : ''}" data-letter="${letter}"><div class="option-letter">${letter}</div><div class="option-text">${opt}</div></div>`;
            }).join('')}
          </div>
        </div>
      `;

      const optionItems = questionArea.querySelectorAll('.option-item');
      optionItems.forEach(item => {
        item.addEventListener('click', () => {
          optionItems.forEach(o => o.classList.remove('selected'));
          item.classList.add('selected');
          answers[q.id] = item.dataset.letter;
        });
      });

      // 更新进度
      document.querySelector('.quiz-progress span').textContent = `${currentIndex + 1}/${questions.length}`;
      document.querySelector('.quiz-progress-fill').style.width = `${((currentIndex + 1) / questions.length) * 100}%`;

      // 更新按钮
      const prevBtn = document.getElementById('exam-prev-btn');
      const nextBtn = document.getElementById('exam-next-btn');
      prevBtn.disabled = currentIndex === 0;
      nextBtn.textContent = currentIndex === questions.length - 1 ? '交卷' : '下一题';
    }

    document.getElementById('exam-prev-btn').addEventListener('click', () => {
      if (currentIndex > 0) {
        currentIndex--;
        renderQuestion();
      }
    });

    document.getElementById('exam-next-btn').addEventListener('click', () => {
      if (currentIndex === questions.length - 1) {
        if (confirm('确定要交卷吗？')) {
          submitExam();
        }
      } else {
        currentIndex++;
        renderQuestion();
      }
    });

    async function submitExam() {
      clearInterval(timer);
      const durationUsed = duration - timeLeft;
      try {
        const res = await API.post(`/exam/${examId}/submit`, {
          answers,
          duration_seconds: durationUsed,
        });
        location.hash = `#/exam-result/${examId}`;
        // 缓存结果
        sessionStorage.setItem(`exam_result_${examId}`, JSON.stringify(res));
      } catch (err) {
        Utils.toast(err.message);
      }
    }

    startTimer();
    renderQuestion();
  }

  // ==================== 考试结果 ====================
  renderExamResult(examId) {
    return `<div id="exam-result-container"><div class="loading"><div class="loading-spinner"></div>加载中...</div></div>`;
  }

  async bindExamResult(examId) {
    const container = document.getElementById('exam-result-container');
    try {
      const res = await API.get(`/exam/${examId}`);
      const exam = res.exam;
      const passed = exam.passed;
      const answers = exam.answers || [];

      container.innerHTML = `
        <div class="page">
          <div class="exam-result">
            <div class="exam-score-circle ${passed ? 'pass' : 'fail'}">
              <div class="exam-score-value">${exam.score}</div>
              <div class="exam-score-label">${passed ? '合格' : '不合格'}</div>
            </div>
            <div class="exam-result-title">${passed ? '🎉 恭喜通过！' : '😢 继续努力'}</div>
            <div class="exam-result-desc">
              共 ${exam.total} 题 · 答对 ${exam.score} 题 · 用时 ${Utils.formatDuration(exam.duration_seconds)}
            </div>
            <div style="display:flex;gap:12px;margin-bottom:24px;">
              <a href="#/exam" class="btn btn-primary" style="flex:1;">再考一次</a>
              <a href="#/wrong" class="btn btn-outline" style="flex:1;">查看错题</a>
            </div>
          </div>
          <div class="card">
            <div class="card-title">📋 答题详情</div>
            <div id="exam-answer-list">
              ${answers.map((a, i) => {
                const q = a.question || {};
                const chapterName = Utils.getChapterName(q.chapter_id);
                return `
                  <div style="padding:12px 0;border-bottom:1px solid var(--border);">
                    <div style="font-size:14px;font-weight:500;margin-bottom:6px;">${i + 1}. ${q.content || ''}</div>
                    <div style="font-size:13px;color:var(--text-secondary);">
                      你的答案：<span style="color:${a.is_correct ? 'var(--success)' : 'var(--danger)'};font-weight:600;">${a.user_answer || '未作答'}</span>
                      ｜ 正确答案：<span style="color:var(--success);font-weight:600;">${a.correct_answer}</span>
                    </div>
                    ${q.explanation_plain ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;font-style:italic;">💡 ${q.explanation_plain}</div>` : ''}
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
        ${this.renderBottomNav('exam')}
      `;
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">😕</div><div class="empty-state-text">${err.message}</div></div>`;
    }
  }

  // ==================== 个人中心 ====================
  renderProfile() {
    return `
      <div class="page">
        <div class="profile-header">
          <div class="profile-avatar">${this.user.role === 'coach' ? '👨‍🏫' : '🚗'}</div>
          <div class="profile-name">${this.user.name}</div>
          <div class="profile-role">${this.user.role === 'coach' ? '教练' : '学员'}</div>
        </div>
        <div class="menu-list">
          ${this.user.role === 'student' ? `
            <div class="menu-item" onclick="location.hash='#/wrong'">
              <span class="menu-icon">📝</span>
              <span class="menu-text">我的错题本</span>
              <span class="menu-arrow">›</span>
            </div>
            <div class="menu-item" onclick="location.hash='#/exam'">
              <span class="menu-icon">🎯</span>
              <span class="menu-text">模拟考试记录</span>
              <span class="menu-arrow">›</span>
            </div>
          ` : ''}
          <div class="menu-item" onclick="app.logout()">
            <span class="menu-icon">🚪</span>
            <span class="menu-text">退出登录</span>
            <span class="menu-arrow">›</span>
          </div>
        </div>
        <div style="text-align:center;padding:24px;color:var(--text-hint);font-size:12px;">
          科目一模拟考试系统 v1.0
        </div>
      </div>
      ${this.renderBottomNav('profile')}
    `;
  }

  bindProfile() {
    // 个人中心无需特殊绑定
  }

  logout() {
    API.setToken(null);
    this.user = null;
    this.route();
  }

  // ==================== 教练端路由 ====================
  routeCoach(hash, app) {
    const [path, ...args] = hash.split('/').filter(Boolean);
    switch (path) {
      case '':
      case 'home':
        app.innerHTML = this.renderCoachHome();
        this.bindCoachHome();
        break;
      case 'student':
        app.innerHTML = this.renderCoachStudent(args[0]);
        this.bindCoachStudent(args[0]);
        break;
      case 'appointments':
        app.innerHTML = this.renderCoachAppointments();
        this.bindCoachAppointments();
        break;
      case 'profile':
        app.innerHTML = this.renderCoachProfile();
        this.bindCoachProfile();
        break;
      default:
        app.innerHTML = this.renderCoachHome();
        this.bindCoachHome();
    }
  }

  renderCoachBottomNav(active) {
    const navs = [
      { key: 'home', icon: '🏠', label: '仪表盘', hash: '#/home' },
      { key: 'appointments', icon: '📅', label: '预约管理', hash: '#/appointments' },
      { key: 'profile', icon: '👤', label: '我的', hash: '#/profile' },
    ];
    return `
      <div class="bottom-nav">
        ${navs.map(n => `
          <div class="nav-item-wrapper">
            <a class="nav-item ${active === n.key ? 'active' : ''}" href="${n.hash}">
              <span class="nav-icon">${n.icon}</span>
              <span>${n.label}</span>
            </a>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ==================== 教练首页（仪表盘） ====================
  renderCoachHome() {
    return `
      <div class="page">
        <div class="coach-header">
          <h2>👨‍🏫 教练工作台</h2>
          <p>你好，${this.user.name}教练</p>
        </div>
        <div id="coach-overview"></div>
        <div class="card">
          <div class="card-title">👥 学员列表</div>
          <div id="coach-students"></div>
        </div>
      </div>
      ${this.renderCoachBottomNav('home')}
    `;
  }

  async bindCoachHome() {
    try {
      const [overviewRes, studentsRes] = await Promise.all([
        API.get('/coach/stats/overview'),
        API.get('/coach/students'),
      ]);

      // 仪表盘统计
      document.getElementById('coach-overview').innerHTML = `
        <div class="stats-grid">
          <div class="stat-item">
            <div class="stat-value">${overviewRes.totalStudents}</div>
            <div class="stat-label">学员总数</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${overviewRes.totalExams}</div>
            <div class="stat-label">考试次数</div>
          </div>
          <div class="stat-item">
            <div class="stat-value success">${overviewRes.passRate}%</div>
            <div class="stat-label">通过率</div>
          </div>
        </div>
        <div class="stats-grid" style="margin-top:0;">
          <div class="stat-item">
            <div class="stat-value primary">${overviewRes.avgScore}</div>
            <div class="stat-label">平均分</div>
          </div>
          <div class="stat-item">
            <div class="stat-value danger">${overviewRes.totalWrong}</div>
            <div class="stat-label">未掌握错题</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${overviewRes.totalQuestions}</div>
            <div class="stat-label">题目总数</div>
          </div>
        </div>
      `;

      // 学员列表
      const studentsHtml = studentsRes.students.map(s => {
        const weakTags = [];
        if (s.accuracy < 60 && s.total_practiced > 0) weakTags.push('<span class="weak-tag warning">正确率低</span>');
        if (s.wrong_count > 10) weakTags.push('<span class="weak-tag">错题较多</span>');
        if (s.exam_count > 0 && s.latest_score < 90) weakTags.push('<span class="weak-tag warning">模拟未通过</span>');
        if (s.exam_count > 0 && s.latest_score >= 95) weakTags.push('<span class="weak-tag" style="background:var(--success-light);color:var(--success);">可预约考试</span>');

        return `
          <div class="student-card" onclick="location.hash='#/student/${s.id}'">
            <div class="student-card-header">
              <div>
                <div class="student-name">${s.name}</div>
                <div class="student-phone">${s.phone || '未填写手机号'}</div>
              </div>
              <div style="text-align:right;">
                ${s.exam_count > 0 ? `<div style="font-size:20px;font-weight:700;color:${s.latest_score >= 90 ? 'var(--success)' : 'var(--danger)'};">${s.latest_score}分</div>` : '<div style="font-size:13px;color:var(--text-hint);">未模考</div>'}
              </div>
            </div>
            <div class="student-stats">
              <div class="student-stat">
                <div class="student-stat-value">${s.total_practiced}</div>
                <div class="student-stat-label">已练习</div>
              </div>
              <div class="student-stat">
                <div class="student-stat-value ${s.accuracy >= 60 ? 'success' : 'danger'}">${s.accuracy}%</div>
                <div class="student-stat-label">正确率</div>
              </div>
              <div class="student-stat">
                <div class="student-stat-value danger">${s.wrong_count}</div>
                <div class="student-stat-label">错题</div>
              </div>
              <div class="student-stat">
                <div class="student-stat-value">${s.exam_count}</div>
                <div class="student-stat-label">模考次数</div>
              </div>
            </div>
            ${weakTags.length > 0 ? `<div class="weak-tags">${weakTags.join('')}</div>` : ''}
          </div>
        `;
      }).join('');
      document.getElementById('coach-students').innerHTML = studentsHtml || '<div class="empty-state"><div class="empty-state-text">暂无学员</div></div>';
    } catch (err) {
      Utils.toast(err.message);
    }
  }

  // ==================== 教练查看学员详情 ====================
  renderCoachStudent(studentId) {
    return `
      <div class="page">
        <div class="app-header" style="margin:-16px -16px 16px;">
          <button class="header-action" onclick="location.hash='#/home'" style="margin-right:auto;">← 返回</button>
          <h1 style="position:absolute;left:50%;transform:translateX(-50%);">学员详情</h1>
        </div>
        <div id="student-detail"><div class="loading"><div class="loading-spinner"></div>加载中...</div></div>
      </div>
    `;
  }

  async bindCoachStudent(studentId) {
    const container = document.getElementById('student-detail');
    try {
      const res = await API.get(`/coach/students/${studentId}`);
      const { student, stats, weakChapters, examRecords, appointmentSuggestion } = res;

      const levelMap = {
        ready: { text: '✅ 可以预约考试', class: 'ready' },
        likely_ready: { text: '👍 基本可以预约', class: 'ready' },
        needs_practice: { text: '⚠️ 需要加强练习', class: '' },
        not_ready: { text: '❌ 暂不建议预约', class: 'not-ready' },
        not_started: { text: '📋 尚未开始', class: '' },
      };
      const levelInfo = levelMap[appointmentSuggestion.level] || levelMap.not_started;

      container.innerHTML = `
        <div class="card" style="text-align:center;">
          <div style="font-size:32px;margin-bottom:8px;">👤</div>
          <div style="font-size:20px;font-weight:600;">${student.name}</div>
          <div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">${student.phone || '未填写手机号'}</div>
        </div>

        <div class="stats-grid">
          <div class="stat-item">
            <div class="stat-value">${stats.totalPracticed}</div>
            <div class="stat-label">已练习题数</div>
          </div>
          <div class="stat-item">
            <div class="stat-value success">${stats.accuracy}%</div>
            <div class="stat-label">正确率</div>
          </div>
          <div class="stat-item">
            <div class="stat-value danger">${stats.wrongCount}</div>
            <div class="stat-label">错题数</div>
          </div>
        </div>
        <div class="stats-grid" style="margin-top:0;">
          <div class="stat-item">
            <div class="stat-value">${stats.examCount}</div>
            <div class="stat-label">模考次数</div>
          </div>
          <div class="stat-item">
            <div class="stat-value success">${stats.passedCount}</div>
            <div class="stat-label">通过次数</div>
          </div>
          <div class="stat-item">
            <div class="stat-value ${stats.bestScore >= 90 ? 'success' : 'danger'}">${stats.bestScore}</div>
            <div class="stat-label">最高分</div>
          </div>
        </div>

        <div class="detail-section">
          <div class="detail-section-title">📊 各章节错误率</div>
          <div class="card">
            ${weakChapters.map(c => {
              const color = c.error_rate >= 50 ? 'var(--danger)' : c.error_rate >= 30 ? 'var(--warning)' : 'var(--success)';
              return `
                <div class="chart-bar-item">
                  <div class="chart-bar-label">
                    <span>${c.name}</span>
                    <span style="color:${color};font-weight:600;">${c.error_rate}% (${c.wrong_count}/${c.total_answered})</span>
                  </div>
                  <div class="chart-bar-track">
                    <div class="chart-bar-fill" style="width:${c.error_rate}%;background:${color};"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div class="detail-section">
          <div class="detail-section-title">📅 预约考试建议</div>
          <div class="appointment-card ${levelInfo.class}">
            <div class="appointment-level">${levelInfo.text}</div>
            <div class="appointment-suggestion">${appointmentSuggestion.suggestion}</div>
            ${appointmentSuggestion.recommendedDate ? `<div class="appointment-date">建议预约日期：${appointmentSuggestion.recommendedDate}</div>` : ''}
          </div>
          <button class="btn btn-primary btn-block" style="margin-top:12px;" onclick="app.showAppointmentModal(${studentId}, '${student.name}', '${appointmentSuggestion.recommendedDate || ''}')">
            给出预约建议
          </button>
        </div>

        <div class="detail-section">
          <div class="detail-section-title">📝 模拟考试记录</div>
          ${examRecords.length > 0 ? examRecords.map(r => `
            <div class="exam-record-item">
              <div class="exam-record-info">
                <div class="exam-record-date">${Utils.formatDate(r.started_at)}</div>
                <div style="font-size:12px;color:var(--text-hint);">用时 ${Utils.formatDuration(r.duration_seconds)}</div>
              </div>
              <div style="text-align:right;">
                <div class="exam-record-score ${r.passed ? 'pass' : 'fail'}">${r.score}分</div>
                <span class="exam-record-status ${r.passed ? 'pass' : 'fail'}">${r.passed ? '合格' : '不合格'}</span>
              </div>
            </div>
          `).join('') : '<div class="card" style="text-align:center;color:var(--text-hint);">暂无模拟考试记录</div>'}
        </div>

        <div class="detail-section">
          <div class="detail-section-title">📋 错题详情</div>
          <button class="btn btn-outline btn-block" onclick="app.showStudentWrongQuestions(${studentId})">查看该学员错题本</button>
        </div>
      </div>
      ${this.renderCoachBottomNav('home')}
    `;
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">😕</div><div class="empty-state-text">${err.message}</div></div>`;
    }
  }

  showAppointmentModal(studentId, studentName, suggestedDate) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-title">预约考试建议 - ${studentName}</div>
        <div class="form-group">
          <label class="form-label">建议预约日期</label>
          <input type="date" class="form-input" id="appt-date" value="${suggestedDate || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">教练备注</label>
          <textarea class="form-input" id="appt-note" rows="3" placeholder="填写备注信息..."></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">取消</button>
          <button class="btn btn-primary" id="appt-save">保存建议</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('appt-save').addEventListener('click', async () => {
      const date = document.getElementById('appt-date').value;
      const note = document.getElementById('appt-note').value;
      try {
        await API.post(`/coach/students/${studentId}/appointment`, {
          suggested_date: date || null,
          coach_note: note || null,
          status: 'suggested',
        });
        Utils.toast('预约建议已保存');
        modal.remove();
      } catch (err) {
        Utils.toast(err.message);
      }
    });
  }

  async showStudentWrongQuestions(studentId) {
    try {
      const res = await API.get(`/coach/students/${studentId}/wrong-questions`);
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal" style="max-width:480px;">
          <div class="modal-title">学员错题本（共 ${res.wrongQuestions.length} 道）</div>
          <div style="max-height:60vh;overflow-y:auto;">
            ${res.wrongQuestions.length === 0 ? '<div style="text-align:center;padding:20px;color:var(--text-hint);">暂无错题</div>' :
              res.wrongQuestions.map(w => {
                const q = w.question;
                return `
                  <div style="padding:12px 0;border-bottom:1px solid var(--border);">
                    <div style="font-size:14px;font-weight:500;margin-bottom:6px;">${q.content}</div>
                    <div style="font-size:13px;color:var(--text-secondary);">
                      正确答案：<span style="color:var(--success);font-weight:600;">${q.answer}</span>
                      ｜ 错误次数：${w.wrong_count}
                    </div>
                    ${q.explanation_plain ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;font-style:italic;">💡 ${q.explanation_plain}</div>` : ''}
                  </div>
                `;
              }).join('')
            }
          </div>
          <div class="modal-actions">
            <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove()">关闭</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    } catch (err) {
      Utils.toast(err.message);
    }
  }

  // ==================== 预约管理 ====================
  renderCoachAppointments() {
    return `
      <div class="page">
        <div class="app-header" style="margin:-16px -16px 16px;">
          <h1>📅 预约管理</h1>
        </div>
        <div id="appointments-list"><div class="loading"><div class="loading-spinner"></div>加载中...</div></div>
      </div>
      ${this.renderCoachBottomNav('appointments')}
    `;
  }

  async bindCoachAppointments() {
    const container = document.getElementById('appointments-list');
    try {
      const res = await API.get('/coach/appointments');
      if (res.appointments.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📅</div><div class="empty-state-text">暂无预约记录</div></div>';
        return;
      }
      container.innerHTML = res.appointments.map(a => {
        const statusMap = {
          suggested: { text: '已建议', color: 'var(--primary)' },
          confirmed: { text: '已确认', color: 'var(--success)' },
          completed: { text: '已完成', color: 'var(--text-secondary)' },
          cancelled: { text: '已取消', color: 'var(--danger)' },
        };
        const status = statusMap[a.status] || statusMap.suggested;
        return `
          <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <div style="font-size:16px;font-weight:600;">${a.student_name}</div>
              <span style="background:${status.color}20;color:${status.color};padding:2px 10px;border-radius:10px;font-size:12px;font-weight:600;">${status.text}</span>
            </div>
            <div style="font-size:13px;color:var(--text-secondary);">
              <div>电话：${a.student_phone || '未填写'}</div>
              <div>建议日期：${a.suggested_date || '待定'}</div>
              ${a.coach_note ? `<div style="margin-top:4px;">备注：${a.coach_note}</div>` : ''}
              ${a.student_note ? `<div style="margin-top:4px;">学员备注：${a.student_note}</div>` : ''}
            </div>
            <div style="font-size:12px;color:var(--text-hint);margin-top:8px;">创建于 ${Utils.formatDate(a.created_at)}</div>
          </div>
        `;
      }).join('');
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">😕</div><div class="empty-state-text">${err.message}</div></div>`;
    }
  }

  // ==================== 教练个人中心 ====================
  renderCoachProfile() {
    return `
      <div class="page">
        <div class="profile-header">
          <div class="profile-avatar">👨‍🏫</div>
          <div class="profile-name">${this.user.name}</div>
          <div class="profile-role">教练</div>
        </div>
        <div class="menu-list">
          <div class="menu-item" onclick="app.logout()">
            <span class="menu-icon">🚪</span>
            <span class="menu-text">退出登录</span>
            <span class="menu-arrow">›</span>
          </div>
        </div>
        <div style="text-align:center;padding:24px;color:var(--text-hint);font-size:12px;">
          科目一模拟考试系统 v1.0
        </div>
      </div>
      ${this.renderCoachBottomNav('profile')}
    `;
  }

  bindCoachProfile() {
    // 无需特殊绑定
  }
}

// 启动应用
const app = new App();
window.app = app;

// 监听路由变化
window.addEventListener('hashchange', () => app.route());
