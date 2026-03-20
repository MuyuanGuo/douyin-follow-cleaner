import { describe, expect, it } from 'vitest';
import { parseFollowingResponse, parseSelfProfileSecUserId } from '../src/shared/client';

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

describe('parseFollowingResponse', () => {
  it('parses handshake empty list with max_time', () => {
    const r = parseFollowingResponse({
      status_code: 0,
      followings: [],
      max_time: 1730000000000,
      has_more: true,
    });
    expect(r.items).toHaveLength(0);
    expect(r.nextMaxTime).toBe('1730000000000');
    expect(r.hasMore).toBe(true);
  });

  it('parses followings with user_info', () => {
    const r = parseFollowingResponse({
      status_code: 0,
      followings: [
        {
          user_info: {
            sec_uid: 'MS4wLjABAAAAx',
            uid: '123',
            nickname: 'a',
          },
        },
      ],
      has_more: false,
    });
    expect(r.items).toHaveLength(1);
    expect(r.items[0].secUserId).toBe('MS4wLjABAAAAx');
  });
});
