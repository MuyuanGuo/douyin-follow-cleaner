import {
  DOUYIN_ORIGIN,
  commitFollowUser,
  defaultWebQuery,
  followingList,
  userProfileOther,
} from './douyinApiMapping';
import type { FollowingListItem } from './types';

export function buildProfileUrl(secUserId: string): string {
  const q = new URLSearchParams({
    ...defaultWebQuery,
    [userProfileOther.queryKeys.secUserId]: secUserId,
  });
  return `${DOUYIN_ORIGIN}${userProfileOther.path}?${q.toString()}`;
}

export function buildFollowingListUrl(secUserId: string, maxTime: string, count: number): string {
  const q = new URLSearchParams({
    ...defaultWebQuery,
    [followingList.queryKeys.secUserId]: secUserId,
    [followingList.queryKeys.count]: String(count),
    [followingList.queryKeys.maxTime]: maxTime,
  });
  return `${DOUYIN_ORIGIN}${followingList.path}?${q.toString()}`;
}

function firstArray(obj: unknown, keys: string[]): unknown[] | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const o = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = o[k];
    if (Array.isArray(v)) return v;
  }
  return undefined;
}

function pickScalar(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== '') return String(v);
  }
  return undefined;
}

/**
 * 解析关注列表响应（多路径兼容）
 */
export function parseFollowingResponse(json: unknown): {
  items: FollowingListItem[];
  nextMaxTime: string;
  hasMore: boolean;
} {
  const root = json as Record<string, unknown>;
  const paths = followingList.responsePaths;

  let list: unknown[] | undefined =
    firstArray(root, paths.list) ??
    (Array.isArray(root.data) ? (root.data as unknown[]) : undefined);

  if (!list && root.data && typeof root.data === 'object') {
    const d = root.data as Record<string, unknown>;
    list = firstArray(d, paths.list);
  }

  const items: FollowingListItem[] = [];
  for (const entry of list ?? []) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const inner = (e.user_info as Record<string, unknown> | undefined) ?? e;
    const secUserId =
      pickScalar(inner, paths.itemSecUserId) ?? pickScalar(e, paths.itemSecUserId);
    if (!secUserId) continue;
    items.push({
      secUserId,
      userId: pickScalar(inner, paths.itemUserId) ?? pickScalar(e, paths.itemUserId),
      nickname: pickScalar(inner, paths.itemNickname) ?? pickScalar(e, paths.itemNickname),
      raw: e,
    });
  }

  let nextMaxTime = '0';
  const rawNext = root.max_time ?? root.min_time;
  if (rawNext !== undefined && rawNext !== null) {
    nextMaxTime = String(rawNext);
  }
  if (root.data && typeof root.data === 'object') {
    const d = root.data as Record<string, unknown>;
    const t = d.max_time ?? d.min_time;
    if (t !== undefined && t !== null) nextMaxTime = String(t);
  }

  const hasMore =
    root.has_more === true ||
    root.has_more === 1 ||
    (root.data &&
      typeof root.data === 'object' &&
      ((root.data as Record<string, unknown>).has_more === true ||
        (root.data as Record<string, unknown>).has_more === 1)) ||
    false;

  return { items, nextMaxTime, hasMore };
}

export function buildUnfollowRequest(
  secUserId: string,
  userId: string | undefined,
): { url: string; body: string; headers: Record<string, string> } {
  const q = new URLSearchParams(defaultWebQuery);
  const url = `${DOUYIN_ORIGIN}${commitFollowUser.path}?${q.toString()}`;
  const body = new URLSearchParams({
    sec_user_id: secUserId,
    ...(userId ? { user_id: userId } : {}),
    type: commitFollowUser.unfollowType,
  });
  return {
    url,
    body: body.toString(),
    headers: { ...commitFollowUser.headers },
  };
}
