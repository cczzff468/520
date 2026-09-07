import { NextRequest } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * 内置图像识别路由（OpenAI 视觉消息格式）。
 * POST { image: dataURL或http URL, question?: string }
 * → { content: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const image = typeof body?.image === 'string' ? body.image : '';
    const question =
      typeof body?.question === 'string' && body.question.trim()
        ? body.question.trim()
        : '用一两句话客观描述这张图片的内容，包括场景、主体和显著细节。';

    if (!image) {
      return Response.json({ error: 'image 不能为空' }, { status: 400 });
    }
    if (!/^(data:image\/|https?:\/\/)/i.test(image)) {
      return Response.json({ error: 'image 需为 dataURL 或 http(s) 地址' }, { status: 400 });
    }

    const zai = await ZAI.create();
    const completion = await zai.chat.completions.createVision({
      model: 'glm-4.6v',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: question },
            { type: 'image_url', image_url: { url: image } },
          ],
        },
      ],
      thinking: { type: 'disabled' },
    });

    const content = completion.choices?.[0]?.message?.content || '';
    if (!content.trim()) {
      return Response.json({ error: '识别结果为空，请重试' }, { status: 502 });
    }
    return Response.json({ content });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[/api/image]', msg);
    return Response.json({ error: '图像识别服务异常：' + msg }, { status: 500 });
  }
}
