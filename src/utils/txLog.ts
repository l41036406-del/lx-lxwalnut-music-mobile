import { log } from '@/utils/log'

export const txLog = {
  info(...msgs: any[]) {
    const msg = msgs.map(m => typeof m == 'string' ? m : m instanceof Error ? (m.stack ?? m.message) : JSON.stringify(m)).join(' ')
    if (__DEV__) {
      console.log('[TX]', ...msgs);
    }
    log.info('[TX] ' + msg)
  },
  warn(...msgs: any[]) {
    const msg = msgs.map(m => typeof m == 'string' ? m : m instanceof Error ? (m.stack ?? m.message) : JSON.stringify(m)).join(' ')
    if (__DEV__) {
      console.warn('[TX]', ...msgs);
    }
    log.warn('[TX] ' + msg)
  },
  error(...msgs: any[]) {
    const msg = msgs.map(m => typeof m == 'string' ? m : m instanceof Error ? (m.stack ?? m.message) : JSON.stringify(m)).join(' ')
    console.error('[TX]', ...msgs);
    log.error('[TX] ' + msg)
  },
  debug(...msgs: any[]) {
    const msg = msgs.map(m => typeof m == 'string' ? m : m instanceof Error ? (m.stack ?? m.message) : JSON.stringify(m)).join(' ')
    if (__DEV__) {
      console.debug('[TX]', ...msgs);
    }
    log.info('[TX DEBUG] ' + msg)
  },
};