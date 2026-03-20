/** Reasons why a followed user may be flagged */
export type UnfollowReason =
  | 'banned'
  | 'deleted'
  | 'no_posts'
  | 'non_personal'
  | 'needs_manual_review';

export interface NormalizedUser {
  secUserId: string;
  /** 站内数字 uid，取关接口可能需要 */
  userId?: string;
  nickname: string;
  /** Public video count when known */
  awemeCount: number | null;
  /** True if platform marks account as banned / restricted */
  isBanned: boolean;
  /** True if account deleted / not found */
  isDeleted: boolean;
  /** True when we cannot tell private vs truly zero posts */
  needsManualReview: boolean;
  /** Heuristic: not a normal personal creator account */
  isNonPersonalAccount: boolean;
}

export interface EvaluateResult {
  reasons: UnfollowReason[];
  shouldUnfollow: boolean;
}

export interface FollowingListItem {
  secUserId: string;
  userId?: string;
  nickname?: string;
  raw?: Record<string, unknown>;
}

export const SCAN_PROGRESS_STORAGE_KEY = 'douyin_scan_progress';

/** 弹窗与 content 共用的扫描进度 */
export type ScanProgressPhase =
  | 'idle'
  | 'collecting'
  | 'profiling'
  | 'unfollowing'
  | 'done'
  | 'aborted'
  | 'error';

export interface ScanProgressState {
  phase: ScanProgressPhase;
  /** 拉取关注列表阶段：已收集的去重人数 */
  collectedCount?: number;
  /** 列表请求页序号 */
  listPage?: number;
  /** 分析资料：计划分析总人数（拉取完成后确定） */
  totalToProfile?: number;
  /** 已分析完成人数 */
  profiledCount?: number;
  /** 待分析人数（含队列中未开始的） */
  pendingCount?: number;
  /** 当前正在分析的关注用户昵称 */
  currentNickname?: string;
  /** 取关进度 */
  unfollowIndex?: number;
  unfollowTotal?: number;
  message?: string;
}

export interface ScanResultRow {
  secUserId: string;
  /** 数字 uid，取关 POST 可能需要 */
  userId?: string;
  nickname: string;
  reasons: UnfollowReason[];
  shouldUnfollow: boolean;
}
