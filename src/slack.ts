import { WebClient } from '@slack/web-api';
import { requireSlackConfig } from './config.js';
import type { RenderedTip } from './render.js';

export interface PostResult {
  /** 본문 메시지의 타임스탬프. 스레드 부모 키이기도 하다. */
  ts: string;
  channel: string;
  threadTs: string | undefined;
}

/**
 * 팁을 채널에 올리고, 상세 내용을 스레드로 붙인다.
 *
 * 본문이 성공하면 그 결과를 살린다 — 스레드 답글이 실패해도 본문 포스팅은
 * 되돌릴 수 없으므로 예외로 전체를 실패시키지 않고 경고만 남긴다. 그래야
 * 로테이션 상태가 "발행됨"으로 정상 커밋되고 같은 팁이 다음 날 또 나가지 않는다.
 */
export async function postTip(rendered: RenderedTip): Promise<PostResult> {
  const { token, channel } = requireSlackConfig();
  const client = new WebClient(token);

  const main = await client.chat.postMessage({
    channel,
    text: rendered.main.text,
    blocks: rendered.main.blocks,
    unfurl_links: false,
    unfurl_media: false,
  });

  if (!main.ok || !main.ts) {
    throw new Error(`슬랙 본문 포스팅 실패: ${main.error ?? '알 수 없는 오류'}`);
  }

  let threadTs: string | undefined;
  try {
    const reply = await client.chat.postMessage({
      channel,
      thread_ts: main.ts,
      text: rendered.thread.text,
      blocks: rendered.thread.blocks,
      unfurl_links: false,
      unfurl_media: false,
    });
    threadTs = reply.ts;
  } catch (error) {
    console.warn(
      `경고: 본문은 올라갔지만 스레드 답글이 실패했습니다 — ${(error as Error).message}`,
    );
  }

  return { ts: main.ts, channel: main.channel ?? channel, threadTs };
}
