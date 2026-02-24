"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

// GABE's knowledge base for fireplace expertise
const gabeResponses: Record<string, string> = {
  pilot: "For pilot light issues, check these in order:\n\n1. **Gas Supply** - Verify gas valve is ON at the unit and at the main\n2. **Thermocouple** - Clean the tip with fine sandpaper, check connection\n3. **Thermopile** - Should generate 500-750mV when heated\n4. **Air in Line** - If new install, may need to bleed the gas line\n5. **Spark Igniter** - Check gap (1/8\") and for spark at pilot\n\nCommon fix: Thermocouple replacement runs $15-30 in parts.",
  thermocouple: "Thermocouple Testing:\n\n1. **Visual Check** - Look for soot, corrosion, or damage\n2. **Millivolt Test** - Should read 15-30mV when heated\n3. **Connection** - Ensure tight connection to gas valve\n\n**Replacement Steps:**\n1. Turn off gas supply\n2. Remove old thermocouple from pilot assembly\n3. Install new one (universal fit, typically 24\"-36\")\n4. Tighten connection finger-tight + 1/4 turn\n5. Re-light pilot and hold for 60 seconds\n\nPart cost: $15-30 | Labor: 15-30 min",
  venting: "Gas Fireplace Venting Requirements:\n\n**Direct Vent (most common):**\n- Co-linear venting for existing chimneys\n- Horizontal termination: min 12\" from window/door\n- Vertical: 3' above roof penetration\n\n**Vent-Free:**\n- No venting required\n- Must have adequate room ventilation\n- Not allowed in bedrooms or bathrooms\n\n**B-Vent:**\n- Natural draft venting\n- Must terminate 3' above roof\n\nAlways check local codes - they may exceed manufacturer specs.",
  remote: "Remote Control Troubleshooting:\n\n1. **Batteries** - Replace in both remote and receiver\n2. **Receiver Location** - Keep away from heat sources\n3. **Signal Test** - Press button, look for LED flash on receiver\n4. **Learn Function** - May need to re-pair remote to receiver\n5. **Wiring** - Check connections at gas valve\n\n**Smart Home Integration:**\nMany units work with smart thermostats. Check if yours has a 3V DC connection for thermostat control.",
  cleaning: "Gas Fireplace Cleaning Procedure:\n\n**Glass Cleaning:**\n1. Wait until completely cool (30+ min)\n2. Remove glass frame/door\n3. Use gas fireplace glass cleaner (not regular glass cleaner)\n4. White haze is normal - from combustion byproducts\n5. Reinstall glass with gasket properly seated\n\n**Interior Cleaning:**\n1. Vacuum burner ports gently\n2. Clean ember material (replace if deteriorated)\n3. Check log placement per manufacturer diagram\n4. Inspect for rust or corrosion\n\nService interval: Annual inspection recommended",
  installation: "Gas Fireplace Installation Checklist:\n\n**Pre-Install:**\n✓ Verify gas line size (1/2\" min for most units)\n✓ Check clearances to combustibles\n✓ Confirm electrical available (for fan/ignition)\n✓ Verify venting path is clear\n\n**During Install:**\n✓ Level unit and secure in place\n✓ Connect gas with approved fittings\n✓ Install venting per manufacturer specs\n✓ Connect electrical (if required)\n✓ Test for gas leaks with soap solution\n\n**Post-Install:**\n✓ Light pilot and verify operation\n✓ Check all flame patterns\n✓ Test fan/remote\n✓ Review operation with customer\n✓ Leave manual and warranty info",
  noise: "Gas Fireplace Noise Diagnosis:\n\n**Whistling:**\n- Gas pressure too high\n- Restricted gas line\n- Dirty burner ports\n\n**Rumbling:**\n- Improper gas pressure\n- Loose components\n- Fan motor issues\n\n**Clicking:**\n- Normal during ignition\n- If continuous: igniter issue\n- Expansion/contraction: normal during heat-up\n\n**Fan Noise:**\n- Clean fan blades\n- Check mounting screws\n- Variable speed may cause hum at low settings\n\nAlways check gas pressure with manometer - should match rating plate.",
  default: "I'm GABE, your Fireplace Expert AI assistant! I can help with:\n\n• **Troubleshooting** - Pilot issues, ignition problems, noise\n• **Installation** - Venting requirements, clearances, gas sizing\n• **Service** - Cleaning, maintenance, inspections\n• **Parts** - Thermocouples, remotes, blowers, glass\n• **Safety** - CO detection, gas leaks, proper operation\n\nJust ask your question and I'll provide expert guidance for your fireplace service or installation needs.",
};

function getGabeResponse(query: string): string {
  const lowerQuery = query.toLowerCase();
  
  if (lowerQuery.includes("pilot") || lowerQuery.includes("won't light") || lowerQuery.includes("won t light")) {
    return gabeResponses.pilot;
  }
  if (lowerQuery.includes("thermocouple") || lowerQuery.includes("thermopile")) {
    return gabeResponses.thermocouple;
  }
  if (lowerQuery.includes("vent") || lowerQuery.includes("venting") || lowerQuery.includes("chimney")) {
    return gabeResponses.venting;
  }
  if (lowerQuery.includes("remote") || lowerQuery.includes("thermostat") || lowerQuery.includes("control")) {
    return gabeResponses.remote;
  }
  if (lowerQuery.includes("clean") || lowerQuery.includes("glass") || lowerQuery.includes("maintenance")) {
    return gabeResponses.cleaning;
  }
  if (lowerQuery.includes("install") || lowerQuery.includes("clearance") || lowerQuery.includes("gas line")) {
    return gabeResponses.installation;
  }
  if (lowerQuery.includes("noise") || lowerQuery.includes("sound") || lowerQuery.includes("whistl") || lowerQuery.includes("rumbl")) {
    return gabeResponses.noise;
  }
  
  return gabeResponses.default;
}

export default function GABEPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "🔥 Hey there! I'm **GABE**, your Fireplace Expert AI assistant.\n\nI'm here to help with any service or installation questions. Need help troubleshooting a pilot light? Figuring out venting requirements? Just ask!\n\nWhat can I help you with today?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);

    // Simulate AI thinking
    await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1000));

    const response = getGabeResponse(input);
    
    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: response,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, assistantMessage]);
    setIsTyping(false);
  };

  const quickQuestions = [
    "Pilot light won't stay lit",
    "Thermocouple testing",
    "Venting requirements",
    "Remote not working",
    "Cleaning procedure",
    "Installation checklist",
  ];

  return (
    <div className="flex flex-col min-h-screen pb-20">
      {/* Header */}
      <header className="bg-[#1a1a2e] p-4 sticky top-0 z-10 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <Link href="/tech" className="text-gray-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-500 rounded-full flex items-center justify-center">
              <span className="text-lg">🔥</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold">GABE</h1>
              <p className="text-xs text-gray-400">Fireplace Expert AI</p>
            </div>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl p-3 ${
                message.role === "user"
                  ? "bg-orange-500 text-white rounded-br-md"
                  : "bg-[#1a1a2e] text-white rounded-bl-md"
              }`}
            >
              <div className="text-sm whitespace-pre-wrap">{message.content}</div>
              <p className="text-xs opacity-50 mt-1">
                {message.timestamp.toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
        ))}
        
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-[#1a1a2e] rounded-2xl rounded-bl-md p-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Questions */}
      {messages.length <= 2 && (
        <div className="px-4 pb-2">
          <p className="text-xs text-gray-400 mb-2">Quick questions:</p>
          <div className="flex flex-wrap gap-2">
            {quickQuestions.map((q) => (
              <button
                key={q}
                onClick={() => {
                  setInput(q);
                  setTimeout(() => handleSend(), 100);
                }}
                className="bg-[#1a1a2e] px-3 py-1.5 rounded-full text-xs text-gray-300 border border-gray-700 hover:border-orange-500 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="sticky bottom-16 bg-[#0f0f1a] p-4 border-t border-gray-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask GABE anything..."
            className="flex-1 bg-[#1a1a2e] rounded-xl px-4 py-3 text-sm border border-gray-700 focus:border-orange-500 outline-none"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="bg-gradient-to-r from-orange-500 to-amber-500 px-4 rounded-xl disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[#1a1a2e] border-t border-gray-800 z-20">
        <div className="max-w-md mx-auto flex justify-around py-3">
          <Link href="/tech" className="flex flex-col items-center text-gray-400 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span className="text-xs mt-1">Jobs</span>
          </Link>
          <Link href="/tech/manuals" className="flex flex-col items-center text-gray-400 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span className="text-xs mt-1">Manuals</span>
          </Link>
          <Link href="/tech/gabe" className="flex flex-col items-center text-orange-400">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <span className="text-xs mt-1">GABE</span>
          </Link>
          <Link href="/tech/profile" className="flex flex-col items-center text-gray-400 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="text-xs mt-1">Profile</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
