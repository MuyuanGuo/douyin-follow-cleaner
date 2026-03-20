import { userProfileOther } from './douyinApiMapping';
import type { NormalizedUser } from './types';

function pick<T>(obj: Record<string, unknown> | undefined, paths: string[]): T | undefined {
  if (!obj) return undefined;
  for (const p of paths) {
    if (p in obj && obj[p] !== undefined && obj[p] !== null) {
      return obj[p] as T;
    }
  }
  return undefined;
}

function getNested(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/**
 * 将 profile/other 接口 JSON 转为 NormalizedUser（启发式，需随接口字段调整）。
 */
export function normalizeProfileJson(
  json: unknown,
  secUserId: string,
): { user: NormalizedUser; rawStatus?: number; parseError?: string } {
  try {
    const root = json as Record<string, unknown>;
    const statusCode = typeof root.status_code === 'number' ? root.status_code : undefined;

    if (statusCode === 0 && root.user === undefined && root.data === undefined) {
      return {
        user: emptyUser(secUserId, '接口返回异常'),
        parseError: 'missing user payload',
      };
    }

    // 账号不存在 / 注销：常见为 404 或非 0 status_code
    if (statusCode !== undefined && statusCode !== 0) {
      const msg = String(root.status_msg ?? '');
      const deleted =
        statusCode === 404 ||
        /注销|不存在|已删除|not\s*found/i.test(msg) ||
        /2048|2155/.test(String(statusCode));
      return {
        user: {
          secUserId,
          userId: undefined,
          nickname: '',
          awemeCount: null,
          isBanned: false,
          isDeleted: deleted,
          needsManualReview: false,
          isNonPersonalAccount: false,
        },
        rawStatus: statusCode,
      };
    }

    const userObj =
      (getNested(root, userProfileOther.responsePaths.userRoot) as Record<string, unknown> | undefined) ??
      (root.user as Record<string, unknown> | undefined) ??
      (root.data as Record<string, unknown> | undefined);

    if (!userObj || typeof userObj !== 'object') {
      return {
        user: emptyUser(secUserId, ''),
        parseError: 'no user object',
      };
    }

    const nickname = String(pick<string>(userObj, ['nickname', 'nick_name']) ?? '');
    const awemeRaw = pick<number>(userObj, userProfileOther.responsePaths.awemeCount);
    const awemeCount = typeof awemeRaw === 'number' ? awemeRaw : null;

    const sec = String(pick(userObj, ['sec_uid', 'sec_user_id']) ?? secUserId);
    const uidRaw = pick<string | number>(userObj, ['uid', 'user_id', 'short_id']);
    const userId = uidRaw !== undefined && uidRaw !== null ? String(uidRaw) : undefined;

    // 封禁：字段名随版本变化，多关键字匹配
    const banHint = JSON.stringify(userObj);
    const isBanned =
      /封禁|账号处罚|账号异常|永久封禁|suspend|banned/i.test(banHint) ||
      userObj.is_block === true ||
      userObj.is_blocked === true ||
      userObj.block_status === 1;

    const isDeleted =
      userObj.is_deleted === true ||
      userObj.deleted === true ||
      /已注销|账号已注销/.test(banHint);

    // 企业 / 店铺 / 机构：蓝 V、企业认证、店铺标
    const verifyType = pick<number>(userObj, ['verification_type', 'verification_type_new']);
    const enterpriseReason = pick<string>(userObj, ['enterprise_verify_reason']);
    const customVerify = pick<string>(userObj, ['custom_verify']);
    const commerce = pick<unknown>(userObj, ['commerce_user_info', 'commerce_user_level']);

    /** 认证类型因版本而异：通常 2 及以上偏企业/机构；以文案与 commerce 字段辅助判断 */
    const isNonPersonalAccount =
      (typeof verifyType === 'number' && verifyType >= 2) ||
      (!!enterpriseReason && enterpriseReason.length > 0) ||
      (!!customVerify && /企业|店铺|机构|品牌|官方/i.test(customVerify)) ||
      (commerce !== undefined && commerce !== null);

    // 私密账号：部分接口 aweme_count 仍为 0，无法区分「未发」与「不可见」
    const secret = userObj.secret === true || userObj.private === true;
    const needsManualReview = secret && awemeCount === 0;

    const user: NormalizedUser = {
      secUserId: sec,
      userId,
      nickname,
      awemeCount,
      isBanned,
      isDeleted,
      needsManualReview,
      isNonPersonalAccount,
    };

    return { user, rawStatus: statusCode };
  } catch (e) {
    return {
      user: emptyUser(secUserId, ''),
      parseError: e instanceof Error ? e.message : String(e),
    };
  }
}

function emptyUser(secUserId: string, nickname: string): NormalizedUser {
  return {
    secUserId,
    userId: undefined,
    nickname,
    awemeCount: null,
    isBanned: false,
    isDeleted: false,
    needsManualReview: true,
    isNonPersonalAccount: false,
  };
}
