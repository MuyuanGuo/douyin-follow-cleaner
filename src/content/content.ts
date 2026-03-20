import {
  buildFollowingListUrl,
  buildProfileSelfUrl,
  buildProfileUrl,
  buildUnfollowRequest,
  parseFollowingResponse,
  parseSelfProfileSecUserId,
} from '../shared/client';
import { normalizeProfileJson } from '../shared/normalize';
import { evaluateUser } from '../shared/rules';
import type { ScanResultRow } from '../shared/types';

const STORAGE_KEY = 'douyin_follow_cleaner_state';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function pageFetch(url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) {
  return new Promise<{
    ok: boolean;
    status: number;
    text: string;
    error?: string;
  }>((resolve) => {
    chrome.runtime.sendMessage({ type: 'PAGE_FETCH', url, init }, (res) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, status: 0, text: '', error: chrome.runtime.lastError.message });
        return;
      }
      resolve(res ?? { ok: false, status: 0, text: '' });
    });
  });
}

function extractOwnerSecFromLocation(): string | null {
  const m = window.location.pathname.match(/\/user\/([^/?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** 地址栏里的长 ID（非 `self`） */
function isLikelySecUserId(s: string): boolean {
  const t = s.trim();
  if (!t || t === 'self') return false;
  return t.length >= 15 && /^[A-Za-z0-9._+-]+$/.test(t);
}

/**
 * 解析「当前账号」的 sec_user_id：优先手动输入 → URL 路径 → profile/self 接口
 */
async function resolveOwnerSecUserId(manualInput: string | undefined): Promise<{ sec: string | null; error?: string }> {
  const manual = manualInput?.trim();
  if (manual && isLikelySecUserId(manual)) {
    return { sec: manual };
  }

  const fromPath = extractOwnerSecFromLocation();
  if (fromPath && isLikelySecUserId(fromPath)) {
    return { sec: fromPath };
  }

  const selfUrl = buildProfileSelfUrl();
  const res = await pageFetch(selfUrl);
  if (res.error) {
    return { sec: null, error: res.error };
  }
  const json = parseJson(res.text);
  const sec = parseSelfProfileSecUserId(json);
  if (sec) {
    return { sec };
  }

  return {
    sec: null,
    error:
      '无法从当前页解析 sec_user_id。请确认已登录；或在弹窗中手动填写 sec_user_id。若仍失败，请打开 DevTools→Network 找到「当前用户」请求，按 README 更新 userProfileSelf.path',
  };
}

export interface ScanOptions {
  ownerSecUserId: string;
  maxFollowingToScan: number;
  delayMsBetweenProfiles: number;
  delayMsBetweenUnfollows: number;
  executeUnfollow: boolean;
  /** AbortController signal */
  signal?: AbortSignal;
}

async function runScan(opts: ScanOptions): Promise<{ rows: ScanResultRow[]; error?: string }> {
  const rows: ScanResultRow[] = [];
  let maxTime = '0';
  let fetched = 0;
  const seen = new Set<string>();
  let page = 0;
  const maxPages = 500;

  while (fetched < opts.maxFollowingToScan && page < maxPages) {
    page += 1;
    if (opts.signal?.aborted) return { rows, error: 'aborted' };
    const url = buildFollowingListUrl(opts.ownerSecUserId, maxTime, 20);
    const res = await pageFetch(url);
    if (res.error) {
      return { rows, error: res.error };
    }
    if (!res.text && res.status === 0) {
      return { rows, error: '页面内 fetch 失败（请确认当前在抖音页且已刷新）' };
    }
    const json = parseJson(res.text);
    if (!json) {
      return {
        rows,
        error: `关注列表解析失败 HTTP ${res.status}，请核对 douyinApiMapping 中 followingList 路径或登录态`,
      };
    }
    const { items, nextMaxTime, hasMore } = parseFollowingResponse(json);
    if (items.length === 0 && !hasMore) break;

    for (const item of items) {
      if (fetched >= opts.maxFollowingToScan) break;
      if (seen.has(item.secUserId)) continue;
      seen.add(item.secUserId);
      fetched += 1;

      if (opts.signal?.aborted) return { rows, error: 'aborted' };
      await sleep(opts.delayMsBetweenProfiles);

      const pUrl = buildProfileUrl(item.secUserId);
      const pres = await pageFetch(pUrl);
      const pjson = parseJson(pres.text);
      const { user, parseError } = normalizeProfileJson(pjson, item.secUserId);
      if (parseError && !user.nickname) {
        user.nickname = item.nickname ?? '';
      }
      const ev = evaluateUser(user);
      rows.push({
        secUserId: item.secUserId,
        userId: user.userId ?? item.userId,
        nickname: user.nickname || item.nickname || '',
        reasons: ev.reasons,
        shouldUnfollow: ev.shouldUnfollow,
      });

      chrome.storage.local.set({
        [STORAGE_KEY]: {
          phase: 'profiles',
          processed: rows.length,
          lastNickname: user.nickname,
        },
      });
    }

    maxTime = nextMaxTime;
    if (!hasMore || items.length === 0) break;
  }

  if (opts.executeUnfollow) {
    const targets = rows.filter((r) => r.shouldUnfollow);
    for (const t of targets) {
      if (opts.signal?.aborted) return { rows, error: 'aborted' };
      await sleep(opts.delayMsBetweenUnfollows);
      const { url, body, headers } = buildUnfollowRequest(t.secUserId, t.userId);
      await pageFetch(url, { method: 'POST', headers, body });
    }
  }

  await chrome.storage.local.set({
    [STORAGE_KEY]: { phase: 'done', processed: rows.length },
    last_scan_results: rows,
  });

  return { rows };
}

let abort: AbortController | null = null;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'START_SCAN') {
    if (abort) abort.abort();
    abort = new AbortController();
    (async () => {
      const resolved = await resolveOwnerSecUserId(msg.ownerSecUserId as string | undefined);
      if (!resolved.sec) {
        sendResponse({
          ok: false,
          error: resolved.error ?? 'missing_owner_sec',
        });
        return;
      }
      try {
        const r = await runScan({
          ownerSecUserId: resolved.sec,
          maxFollowingToScan: Number(msg.maxFollowingToScan) || 500,
          delayMsBetweenProfiles: Number(msg.delayMsBetweenProfiles) || 1200,
          delayMsBetweenUnfollows: Number(msg.delayMsBetweenUnfollows) || 2000,
          executeUnfollow: Boolean(msg.executeUnfollow),
          signal: abort.signal,
        });
        sendResponse({ ok: true, ...r, resolvedOwnerSec: resolved.sec });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }
  if (msg?.type === 'ABORT_SCAN') {
    abort?.abort();
    sendResponse({ ok: true });
    return;
  }
  return undefined;
});
