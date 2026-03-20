import { describe, expect, it } from 'vitest';
import { evaluateUser } from '../src/shared/rules';
import type { NormalizedUser } from '../src/shared/types';

function base(over: Partial<NormalizedUser> = {}): NormalizedUser {
  return {
    secUserId: 'x',
    nickname: 'n',
    awemeCount: 10,
    isBanned: false,
    isDeleted: false,
    needsManualReview: false,
    isNonPersonalAccount: false,
    ...over,
  };
}

describe('evaluateUser', () => {
  it('flags banned', () => {
    const r = evaluateUser(base({ isBanned: true }));
    expect(r.shouldUnfollow).toBe(true);
    expect(r.reasons).toContain('banned');
  });

  it('flags deleted', () => {
    const r = evaluateUser(base({ isDeleted: true }));
    expect(r.shouldUnfollow).toBe(true);
    expect(r.reasons).toContain('deleted');
  });

  it('flags no posts when count is 0 and not manual review', () => {
    const r = evaluateUser(base({ awemeCount: 0, needsManualReview: false }));
    expect(r.shouldUnfollow).toBe(true);
    expect(r.reasons).toContain('no_posts');
  });

  it('does not auto no_posts for private/manual review', () => {
    const r = evaluateUser(base({ awemeCount: 0, needsManualReview: true }));
    expect(r.reasons).toContain('needs_manual_review');
    expect(r.reasons).not.toContain('no_posts');
    expect(r.shouldUnfollow).toBe(false);
  });

  it('flags non-personal accounts', () => {
    const r = evaluateUser(base({ isNonPersonalAccount: true }));
    expect(r.shouldUnfollow).toBe(true);
    expect(r.reasons).toContain('non_personal');
  });

  it('does not unfollow when only manual review without other triggers', () => {
    const r = evaluateUser(
      base({
        awemeCount: 10,
        needsManualReview: true,
        isNonPersonalAccount: false,
      }),
    );
    expect(r.shouldUnfollow).toBe(false);
  });
});
