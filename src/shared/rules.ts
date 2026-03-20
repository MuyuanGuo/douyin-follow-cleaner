import type { EvaluateResult, NormalizedUser, UnfollowReason } from './types';

/**
 * 根据归一化用户信息判断是否应取消关注（满足任一条件即 shouldUnfollow=true）。
 */
export function evaluateUser(user: NormalizedUser): EvaluateResult {
  const reasons: UnfollowReason[] = [];

  if (user.isDeleted) {
    reasons.push('deleted');
  }
  if (user.isBanned) {
    reasons.push('banned');
  }
  if (user.needsManualReview) {
    reasons.push('needs_manual_review');
  }
  /** 私密账号且可见作品数为 0 时无法区分「未发作品」与「仅自己可见」，不自动按未发作品取关 */
  if (user.awemeCount === 0 && !user.needsManualReview) {
    reasons.push('no_posts');
  }

  const shouldUnfollow =
    reasons.includes('banned') ||
    reasons.includes('deleted') ||
    reasons.includes('no_posts');

  return { reasons, shouldUnfollow };
}
