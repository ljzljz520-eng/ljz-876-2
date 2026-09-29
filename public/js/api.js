// API 请求辅助模块
const API = {
  baseURL: '/api',
  token: localStorage.getItem('token') || null,

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  },

  async request(method, path, data = null) {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (this.token) {
      options.headers['Authorization'] = 'Bearer ' + this.token;
    }
    if (data) {
      options.body = JSON.stringify(data);
    }
    try {
      const res = await fetch(this.baseURL + path, options);
      const result = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          this.setToken(null);
          if (window.app && window.app.onAuthExpired) {
            window.app.onAuthExpired();
          }
        }
        throw new Error(result.error || '请求失败');
      }
      return result;
    } catch (err) {
      if (err.message === 'Failed to fetch') {
        throw new Error('网络连接失败，请检查网络');
      }
      throw err;
    }
  },

  get(path) { return this.request('GET', path); },
  post(path, data) { return this.request('POST', path, data); },
  put(path, data) { return this.request('PUT', path, data); },
  delete(path) { return this.request('DELETE', path); },
};

// 工具函数
const Utils = {
  toast(message, duration = 2000) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
  },

  formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  },

  formatDuration(seconds) {
    if (!seconds) return '0秒';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m === 0) return `${s}秒`;
    return `${m}分${s}秒`;
  },

  getChapterName(chapterId) {
    const chapters = window.app && window.app.chapters;
    if (!chapters) return '';
    const ch = chapters.find(c => c.id === chapterId);
    return ch ? ch.name : '';
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  },
};
