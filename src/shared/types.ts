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

export interface ScanProgress {
  phase: 'idle' | 'following' | 'profiles' | 'done' | 'error';
  totalFollowing?: number;
  processed: number;
  currentNickname?: string;
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
