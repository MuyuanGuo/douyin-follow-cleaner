import { describe, expect, it } from 'vitest';
import { parseSelfProfileSecUserId } from '../src/shared/client';

describe('parseSelfProfileSecUserId', () => {
  it('reads user.sec_uid', () => {
    const id = 'MS4wLjABAAAAtest';
    expect(
      parseSelfProfileSecUserId({
        status_code: 0,
        user: { sec_uid: id, nickname: 'a' },
      }),
    ).toBe(id);
  });

  it('reads data.user.sec_user_id', () => {
    const id = 'MS4wLjABAAAAtest2';
    expect(
      parseSelfProfileSecUserId({
        status_code: 0,
        data: { user: { sec_user_id: id } },
      }),
    ).toBe(id);
  });

  it('returns null when missing', () => {
    expect(parseSelfProfileSecUserId({ status_code: 0 })).toBeNull();
  });
});
