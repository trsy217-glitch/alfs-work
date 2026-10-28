// localStorage 접근이 막힌 환경(시크릿 창 등)에서도 앱이 멈추지 않도록 감싼 도우미
export const ls = {
  get(key, fallback = null) {
    try {
      const v = window.localStorage.getItem(key)
      return v == null ? fallback : JSON.parse(v)
    } catch { return fallback }
  },
  set(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); return true } catch { return false }
  },
  remove(key) {
    try { window.localStorage.removeItem(key) } catch { /* 무시 */ }
  },
}
