import { NextRequest } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages: ChatMessage[] = Array.isArray(body?.messages) ? body.messages : [];

    if (!messages.length) {
      return Response.json({ error: 'messages 不能为空' }, { status: 400 });
    }

    // z-ai SDK：system 提示词使用 assistant 角色
    const mapped = messages
      .filter((m) => m && typeof m.content === 'string' && m.content.trim())
      .slice(-24)
      .map((m) => ({
        role: m.role === 'system' ? ('assistant' as const) : m.role,
        content: m.content,
      }));

    // 合并连续同角色消息（避免连续 assistant 导致 400）
    const normalized: { role: 'assistant' | 'user'; content: string }[] = [];
    for (const m of mapped) {
      const last = normalized[normalized.length - 1];
      if (last && last.role === m.role) {
        last.content = last.content + '\n\n' + m.content;
      } else {
        normalized.push({ role: m.role, content: m.content });
      }
    }

    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: normalized,
      thinking: { type: 'disabled' },
    });

    const content = completion.choices?.[0]?.message?.content || '';

    if (!content.trim()) {
      return Response.json({ error: 'AI 返回了空回复，请重试' }, { status: 502 });
    }

    // 以 SSE 流式输出（打字机效果）
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const chunks = content.match(/[\s\S]{1,26}/g) || [];
        for (const c of chunks) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`)
          );
          await new Promise((r) => setTimeout(r, 18));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[/api/chat]', msg);
    return Response.json({ error: 'AI 服务异常：' + msg }, { status: 500 });
  }
}
