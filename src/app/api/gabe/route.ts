import { NextRequest, NextResponse } from 'next/server';
import { buildGabeSystemPrompt, manualKnowledgeBase, type Manual } from '@/lib/gabe/prompts';

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

    // Fetch manuals from API
    let manuals: Manual[] = [];
    try {
      const manualsRes = await fetch(new URL('/api/manuals', request.url).toString(), {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (manualsRes.ok) {
        manuals = await manualsRes.json();
      }
    } catch (err) {
      console.error('Failed to fetch manuals:', err);
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    const modelOverride = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

    // Build system prompt with job context and manuals (for both API and fallback)
    const systemPrompt = buildGabeSystemPrompt(jobContext, manuals);

    if (!groqApiKey) {
      // Fallback response that includes manual knowledge but no AI
      const fallbackResponse = `🔥 **GABE AI is not configured** — To enable real AI responses, add your GROQ_API_KEY to .env.local.

However, I still have knowledge from the manual library! Here are some common fireplace questions I can help with:

**Pilot Light Issues:**
1. Check gas valve is ON at unit and main
2. Clean thermocouple tip with fine sandpaper
3. Thermopile should read 500–750mV when heated
4. Check for air in gas line (new installs)
5. Verify spark igniter gap (1/8")

**Thermocouple Testing:**
- Should read 15–30mV when heated
- Check connection to gas valve
- Replace if damaged ($15–30 parts)

**Thermopile Testing:**
- Should read 350–750mV when fully heated (3–5 min)
- Under load test: stay above 250mV
- Replace if under 300mV ($35–55 parts)

**Direct Vent Venting:**
- 4" inner, 6.5" outer co-axial pipe
- Horizontal: min 12" from window/door
- Vertical: 3' above roof penetration
- Each 90° elbow = 5 ft equivalent length

**Popular Majestic Models I have manuals for:**
- Al Fresco, Ashland (36/42/50), Aura, Biltmore, Bravo, Cameo, Carolina
- Jade Series, Meridian, Monroe, Quartz, Ruby, TruFlush
- And 30+ more models with PDF links

⚠️ **Safety First:** If you smell gas, shut off supply and ventilate before troubleshooting.

**To enable full AI responses:** Get a free Groq API key at console.groq.com and add it to your .env.local file.

Would you like help with a specific fireplace model or issue?`;
      
      return NextResponse.json({
        message: fallbackResponse,
        usage: null,
      });
    }

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
