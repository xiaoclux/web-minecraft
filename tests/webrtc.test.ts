import { describe, expect, it } from 'vitest';
import { decodeCode } from '../src/net/webrtc';

describe('房间码', () => {
  it('能解出 SDP，格式不对时返回 null 而不是抛异常', () => {
    const description = { type: 'offer', sdp: 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n' };
    const code = btoa(encodeURIComponent(JSON.stringify(description)));
    expect(decodeCode(code)).toEqual(description);
    // 前后空白应当被容忍（复制粘贴常带换行）
    expect(decodeCode(`\n  ${code}  \n`)).toEqual(description);
    expect(decodeCode('这不是房间码')).toBeNull();
    expect(decodeCode('')).toBeNull();
    // 合法 base64 但不是 SDP
    expect(decodeCode(btoa('{"a":1}'))).toBeNull();
  });
});
