import {
  buildFollowingListUrl,
  buildProfileSelfUrl,
  buildProfileUrl,
  buildUnfollowRequest,
  checkFollowingApiError,
  parseFollowingResponse,
  parseSelfProfileSecUserId,
} from '../shared/client';
import { followingList } from '../shared/douyinApiMapping';
import { normalizeProfileJson } from '../shared/normalize';
import { evaluateUser } from '../shared/rules';
import type { FollowingListItem, ScanProgressState, ScanResultRow } from '../shared/types';
import { SCAN_PROGRESS_STORAGE_KEY } from '../shared/types';

function setScanProgress(state: ScanProgressState): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [SCAN_PROGRESS_STORAGE_KEY]: state }, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve();
    });
  });
}

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

/** 分页拉取关注列表（去重、上限），不拉资料 */
async function collectFollowingItems(
  ownerSecUserId: string,
  maxCount: number,
  signal: AbortSignal | undefined,
): Promise<{ items: FollowingListItem[]; error?: string }> {
  const items: FollowingListItem[] = [];
  const seen = new Set<string>();
  let maxTime = '0';
  let page = 0;
  const maxPages = 500;
  const useHandshake = followingList.useSourceTypeHandshake !== false;

  while (items.length < maxCount && page < maxPages) {
    page += 1;
    if (signal?.aborted) return { items, error: 'aborted' };

    const isFirstFollowingRequest = page === 1;
    const sourceType: 1 | 2 = useHandshake && isFirstFollowingRequest ? 2 : 1;
    const requestMaxTime = useHandshake && isFirstFollowingRequest ? '0' : maxTime;

    const url = buildFollowingListUrl(ownerSecUserId, requestMaxTime, 20, sourceType);
    const res = await pageFetch(url);
    if (res.error) {
      return { items, error: res.error };
    }
    if (!res.text && res.status === 0) {
      return { items, error: '页面内 fetch 失败（请确认当前在抖音页且已刷新）' };
    }
    const json = parseJson(res.text);
    if (!json) {
      return {
        items,
        error: `关注列表非 JSON（HTTP ${res.status}）。可能被风控拦截或路径错误，请核对 douyinApiMapping.followingList.path`,
      };
    }

    const apiErr = checkFollowingApiError(json);
    if (apiErr) {
      return { items, error: apiErr };
    }

    const { items: pageItems, nextMaxTime, hasMore } = parseFollowingResponse(json);

    if (useHandshake && isFirstFollowingRequest && pageItems.length === 0) {
      maxTime = nextMaxTime;
      if (!maxTime || maxTime === '0') {
        return {
          items,
          error:
            '关注列表握手未返回有效游标（max_time 等）。请在 Network 中搜索含 following/relation 的请求，对照更新 douyinApiMapping',
        };
      }
      await setScanProgress({
        phase: 'collecting',
        collectedCount: items.length,
        listPage: page,
        message: '关注列表握手中…',
      });
      continue;
    }

    if (pageItems.length === 0 && !hasMore) break;

    for (const item of pageItems) {
      if (items.length >= maxCount) break;
      if (seen.has(item.secUserId)) continue;
      seen.add(item.secUserId);
      items.push(item);
    }

    await setScanProgress({
      phase: 'collecting',
      collectedCount: items.length,
      listPage: page,
      message: `已拉取关注列表 ${items.length} 人`,
    });

    maxTime = nextMaxTime;
    if (!hasMore) break;
  }

  return { items };
}

async function runScan(opts: ScanOptions): Promise<{ rows: ScanResultRow[]; error?: string }> {
  const rows: ScanResultRow[] = [];

  await setScanProgress({
    phase: 'collecting',
    collectedCount: 0,
    listPage: 0,
    message: '正在拉取关注列表…',
  });

  const { items: followingItems, error: collectErr } = await collectFollowingItems(
    opts.ownerSecUserId,
    opts.maxFollowingToScan,
    opts.signal,
  );

  if (collectErr) {
    await setScanProgress({
      phase: collectErr === 'aborted' ? 'aborted' : 'error',
      message: collectErr,
    });
    return { rows, error: collectErr };
  }

  const total = followingItems.length;
  await setScanProgress({
    phase: 'profiling',
    totalToProfile: total,
    profiledCount: 0,
    pendingCount: total,
    collectedCount: total,
    message: total === 0 ? '关注列表为空' : `共 ${total} 人，开始分析资料…`,
  });

  if (total === 0) {
    await chrome.storage.local.set({
      [SCAN_PROGRESS_STORAGE_KEY]: {
        phase: 'done',
        totalToProfile: 0,
        profiledCount: 0,
        pendingCount: 0,
        message: '无关注用户',
      },
      last_scan_results: [],
    });
    return { rows };
  }

  for (let i = 0; i < followingItems.length; i++) {
    if (opts.signal?.aborted) {
      await setScanProgress({ phase: 'aborted', message: '已中止' });
      return { rows, error: 'aborted' };
    }

    const item = followingItems[i];
    await setScanProgress({
      phase: 'profiling',
      totalToProfile: total,
      profiledCount: i,
      pendingCount: total - i,
      currentNickname: item.nickname ?? item.secUserId,
      message: `分析资料：第 ${i + 1} / ${total} 人`,
    });

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

    const done = i + 1;
    await setScanProgress({
      phase: 'profiling',
      totalToProfile: total,
      profiledCount: done,
      pendingCount: total - done,
      currentNickname: user.nickname || item.nickname || '',
      message: `已完成 ${done} / ${total}，待分析 ${total - done} 人`,
    });
  }

  if (opts.executeUnfollow) {
    const targets = rows.filter((r) => r.shouldUnfollow);
    await setScanProgress({
      phase: 'unfollowing',
      unfollowTotal: targets.length,
      unfollowIndex: 0,
      totalToProfile: total,
      profiledCount: rows.length,
      pendingCount: 0,
      message: targets.length === 0 ? '无需取关' : `准备取关 ${targets.length} 人…`,
    });

    for (let j = 0; j < targets.length; j++) {
      if (opts.signal?.aborted) {
        await setScanProgress({ phase: 'aborted', message: '已中止（取关阶段）' });
        return { rows, error: 'aborted' };
      }
      const t = targets[j];
      await setScanProgress({
        phase: 'unfollowing',
        unfollowTotal: targets.length,
        unfollowIndex: j + 1,
        currentNickname: t.nickname,
        message: `取关中 ${j + 1} / ${targets.length}`,
      });
      await sleep(opts.delayMsBetweenUnfollows);
      const { url, body, headers } = buildUnfollowRequest(t.secUserId, t.userId);
      await pageFetch(url, { method: 'POST', headers, body });
    }
  }

  await chrome.storage.local.set({
    [SCAN_PROGRESS_STORAGE_KEY]: {
      phase: 'done',
      totalToProfile: total,
      profiledCount: rows.length,
      pendingCount: 0,
      message: '扫描完成',
    },
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
