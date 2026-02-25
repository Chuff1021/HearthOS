import { NextRequest, NextResponse } from 'next/server';
import { buildGabeSystemPrompt } from '@/lib/gabe/prompts';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface GroqResponse {
  choices: {
    message: {
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      messages: ChatMessage[];
      jobContext?: {
        fireplace?: string;
        jobType?: string;
        jobId?: string;
      };
    };

    const { messages, jobContext } = body;

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: 'Messages are required' },
        { status: 400 }
      );
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    const modelOverride = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

    if (!groqApiKey) {
      // Fallback to mock response if no API key configured
      return NextResponse.json({
        message: "GABE AI is not configured yet. Add your GROQ_API_KEY to .env.local to enable real AI responses. For now, try asking about: pilot lights, thermocouples, venting, or installation.",
        usage: null,
      });
    }

    // Build system prompt with job context
    const systemPrompt = buildGabeSystemPrompt(jobContext);

    // Call Groq API
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelOverride,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        temperature: 0.3, // Lower temp for more consistent technical answers
        max_tokens: 1024,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Groq API error:', error);
      return NextResponse.json(
        { error: 'AI service temporarily unavailable' },
        { status: 503 }
      );
    }

    const data = await response.json() as GroqResponse;
    const assistantMessage = data.choices[0]?.message?.content;

    if (!assistantMessage) {
      return NextResponse.json(
        { error: 'No response from AI' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: assistantMessage,
      usage: data.usage,
    });
  } catch (err) {
    console.error('GABE API error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
