import {
  DOUYIN_ORIGIN,
  commitFollowUser,
  defaultWebQuery,
  followingList,
  userProfileOther,
  userProfileSelf,
} from './douyinApiMapping';
import type { FollowingListItem } from './types';

export function buildProfileUrl(secUserId: string): string {
  const q = new URLSearchParams({
    ...defaultWebQuery,
    [userProfileOther.queryKeys.secUserId]: secUserId,
  });
  return `${DOUYIN_ORIGIN}${userProfileOther.path}?${q.toString()}`;
}

/** 当前登录用户（无 sec_user_id 参数），用于从 `/user/self` 页面解析真实 ID */
export function buildProfileSelfUrl(): string {
  const q = new URLSearchParams({ ...defaultWebQuery });
  return `${DOUYIN_ORIGIN}${userProfileSelf.path}?${q.toString()}`;
}

/**
 * 从 profile/self 接口 JSON 中取出 sec_uid / sec_user_id
 */
export function parseSelfProfileSecUserId(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null;
  const root = json as Record<string, unknown>;

  const pickFromUser = (u: unknown): string | null => {
    if (!u || typeof u !== 'object') return null;
    const o = u as Record<string, unknown>;
    const s = o.sec_uid ?? o.sec_user_id;
    if (typeof s === 'string' && s.length > 10 && s !== 'self') return s;
    return null;
  };

  const data = root.data;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    const fromData = pickFromUser(d.user) ?? pickFromUser(d.user_info) ?? pickFromUser(d);
    if (fromData) return fromData;
  }

  return pickFromUser(root.user) ?? pickFromUser(root.user_info);
}

/**
 * @param sourceType 首次握手为 2，之后为 1（见 douyinApiMapping 说明）
 */
export function buildFollowingListUrl(
  secUserId: string,
  maxTime: string,
  count: number,
  sourceType: 1 | 2 = 1,
): string {
  const q = new URLSearchParams({
    ...defaultWebQuery,
    [followingList.queryKeys.secUserId]: secUserId,
    [followingList.queryKeys.count]: String(count),
    [followingList.queryKeys.maxTime]: maxTime,
    [followingList.queryKeys.sourceType]: String(sourceType),
  });
  return `${DOUYIN_ORIGIN}${followingList.path}?${q.toString()}`;
}

/** 接口业务错误（非 HTTP 层） */
export function checkFollowingApiError(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null;
  const root = json as Record<string, unknown>;
  if (!('status_code' in root)) return null;
  const sc = root.status_code;
  const n = typeof sc === 'number' ? sc : Number(sc);
  if (!Number.isNaN(n) && n !== 0) {
    return `抖音接口 status_code=${n} ${String(root.status_msg ?? '')}`.trim();
  }
  return null;
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

/** 优先非空数组，避免命中空的 `list: []` 而漏掉其它字段里的数据 */
function firstNonEmptyArray(obj: unknown, keys: string[]): unknown[] | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const o = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = o[k];
    if (Array.isArray(v) && v.length > 0) return v;
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

const EXTRA_LIST_KEYS = [
  'followings',
  'user_list',
  'follow_list',
  'following_list',
  'following_users',
  'list',
  'users',
];

function findArrayWithSecUser(obj: unknown, depth: number): unknown[] | undefined {
  if (depth > 5 || !obj || typeof obj !== 'object') return undefined;
  const o = obj as Record<string, unknown>;
  for (const v of Object.values(o)) {
    if (!Array.isArray(v) || v.length === 0) continue;
    const first = v[0];
    if (!first || typeof first !== 'object') continue;
    const e = first as Record<string, unknown>;
    const inner = (e.user_info as Record<string, unknown> | undefined) ?? e;
    if (
      inner.sec_uid ||
      inner.sec_user_id ||
      e.sec_uid ||
      e.sec_user_id ||
      inner.uid ||
      e.uid
    ) {
      return v;
    }
  }
  for (const v of Object.values(o)) {
    if (v && typeof v === 'object') {
      const found = findArrayWithSecUser(v, depth + 1);
      if (found) return found;
    }
  }
  return undefined;
}

function extractFollowingsList(root: Record<string, unknown>): unknown[] | undefined {
  const paths = followingList.responsePaths;
  let list: unknown[] | undefined =
    firstNonEmptyArray(root, paths.list) ??
    firstNonEmptyArray(root, EXTRA_LIST_KEYS) ??
    firstArray(root, paths.list) ??
    firstArray(root, EXTRA_LIST_KEYS);

  if (!list && Array.isArray(root.data) && (root.data as unknown[]).length > 0) {
    list = root.data as unknown[];
  }

  if (!list && root.data && typeof root.data === 'object') {
    const d = root.data as Record<string, unknown>;
    list =
      firstNonEmptyArray(d, paths.list) ??
      firstNonEmptyArray(d, EXTRA_LIST_KEYS) ??
      firstArray(d, paths.list) ??
      firstArray(d, EXTRA_LIST_KEYS);
  }

  if (!list) {
    list = findArrayWithSecUser(root, 0);
  }

  return list;
}

function extractNextCursor(root: Record<string, unknown>): string {
  const keys = ['max_time', 'min_time', 'max_cursor', 'cursor', '_cursor', 'offset'];
  for (const k of keys) {
    const v = root[k];
    if (v !== undefined && v !== null && String(v) !== '') return String(v);
  }
  if (root.data && typeof root.data === 'object') {
    const d = root.data as Record<string, unknown>;
    for (const k of keys) {
      const v = d[k];
      if (v !== undefined && v !== null && String(v) !== '') return String(v);
    }
  }
  return '0';
}

function extractHasMore(root: Record<string, unknown>, itemsLen: number): boolean {
  const pick = (o: Record<string, unknown>): boolean | undefined => {
    if (o.has_more === true || o.has_more === 1) return true;
    if (o.has_more === false || o.has_more === 0) return false;
    if (o.hasMore === true) return true;
    if (o.hasMore === false) return false;
    return undefined;
  };
  const a = pick(root);
  if (a !== undefined) return a;
  if (root.data && typeof root.data === 'object') {
    const b = pick(root.data as Record<string, unknown>);
    if (b !== undefined) return b;
  }
  // 未知时：有数据则倾向继续翻页（由上层结合空页退出）
  return itemsLen > 0;
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

  const list = extractFollowingsList(root) ?? [];

  const items: FollowingListItem[] = [];
  for (const entry of list) {
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

  const nextMaxTime = extractNextCursor(root);
  const hasMore = extractHasMore(root, items.length);

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
