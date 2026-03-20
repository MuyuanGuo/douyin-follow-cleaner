/**
 * 抖音网页端接口与 JSON 路径映射（会随官方改版变化）。
 * 若扫描失败，请在已登录状态下打开 DevTools → Network，对照 README「抓包校准」更新本文件。
 */

export const DOUYIN_ORIGIN = 'https://www.douyin.com';

/** 通用 query：与站内请求保持一致时可提高成功率；可按 Network 里实际请求增补 */
export const defaultWebQuery: Record<string, string> = {
  device_platform: 'webapp',
  aid: '6383',
  channel: 'channel_pc_web',
  publish_video_strategy_type: '2',
  source: 'channel_pc_web',
  version_code: '170400',
  version_name: '17.4.0',
};

/**
 * 关注列表（GET）
 * 常见路径：`/aweme/v1/web/user/following/list/`（若 404 请改为 Network 中实际路径）
 */
export const followingList = {
  path: '/aweme/v1/web/user/following/list/',
  queryKeys: {
    /** 主页主体的 sec_user_id（一般为当前登录用户打开自己主页时 URL 中的 ID） */
    secUserId: 'sec_user_id',
    count: 'count',
    /** 分页游标：首次 0，后续取上一页响应中的 max_time（字段名见 responsePaths） */
    maxTime: 'max_time',
  },
  defaultCount: 20,
  responsePaths: {
    /** 列表数组 */
    list: ['followings', 'user_list'],
    /** 下一页 max_time */
    nextMaxTime: ['max_time'],
    /** 是否还有下一页 */
    hasMore: ['has_more'],
    /** 单条里的 sec_user_id */
    itemSecUserId: ['sec_uid', 'sec_user_id'],
    itemUserId: ['uid', 'user_id', 'id'],
    itemNickname: ['nickname', 'nick_name'],
  },
};

/**
 * 当前登录用户资料（GET）
 * 用于 URL 为 `/user/self` 时解析真实 `sec_user_id`（地址栏不再展示长 ID）。
 * 若 404，请在 Network 中搜索含 profile/self 或 user/info 的请求并改 path。
 */
export const userProfileSelf = {
  path: '/aweme/v1/web/user/profile/self/',
};

/**
 * 他人用户资料（GET）
 */
export const userProfileOther = {
  path: '/aweme/v1/web/user/profile/other/',
  queryKeys: {
    secUserId: 'sec_user_id',
  },
  responsePaths: {
    userRoot: ['user'],
    nickname: ['nickname', 'nick_name'],
    awemeCount: ['aweme_count', 'aweme_count_visible'],
    /** 封禁、注销等：不同版本字段名可能不同，见 normalizeProfile */
    status: ['status'],
    banFields: ['is_block', 'is_blocked'],
    verifyInfo: ['verification_type', 'enterprise_verify_reason', 'custom_verify'],
    accountLabels: ['account_region', 'account_cert_info'],
  },
};

/**
 * 取关（POST）
 * 实际 Content-Type / body 以 Network 为准；默认按 x-www-form-urlencoded 猜测。
 */
export const commitFollowUser = {
  path: '/aweme/v1/web/commit/follow/user/',
  method: 'POST' as const,
  /** type: 0 常为取消关注，以实际抓包为准 */
  unfollowType: '0',
  headers: {
    'content-type': 'application/x-www-form-urlencoded',
  },
};
