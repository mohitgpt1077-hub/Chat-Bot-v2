import { useCallback, useEffect, useRef, useState } from "react";
import { GraduationCap, Minus, Pencil, Send, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ANNOUNCEMENTS,
  PROGRAMS,
  SPECIALIZATIONS,
  answerFor,
  idleNudges,
  loadProfile,
  maskPhone,
  saveProfile,
  topicPrompts,
  type ProgramKey,
  type Profile,
} from "@/lib/upes-data";

type Step =
  | "program"
  | "specialization"
  | "name"
  | "email"
  | "phone"
  | "otp"
  | "existing_phone"
  | "existing_otp"
  | "resume"
  | "topics"
  | "free";

type Msg = { id: number; role: "bot" | "user"; text: string; editStep?: Step | undefined };
type Option = { label: string; value: string };
type Mode = "options" | "text" | "otp" | "none";

const emptyProfile: Profile = {
  role: null,
  program: null,
  programLabel: null,
  specialization: null,
  name: "",
  email: "",
  phone: "",
  lastTopic: null,
};

const OTHER: Option = { label: "✏️ Something else", value: "__other__" };
const EDITABLE: Step[] = ["program", "specialization", "name", "email", "phone"];
const IDLE_MS = 30_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function UpesChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [options, setOptions] = useState<Option[]>([]);
  const [mode, setMode] = useState<Mode>("none");
  const [step, setStep] = useState<Step>("program");
  const [showResumeCta, setShowResumeCta] = useState(true);
  const [minimized, setMinimized] = useState(false);
  const [profileDone, setProfileDone] = useState(false);
  const [announcement, setAnnouncement] = useState(0);

  const [placeholder, setPlaceholder] = useState("Type your message…");
  const [draft, setDraft] = useState("");
  const profileRef = useRef<Profile>({ ...emptyProfile });
  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const nudgeIndex = useRef(0);

  useEffect(() => {
    const t = setInterval(() => setAnnouncement((i) => (i + 1) % ANNOUNCEMENTS.length), 6000);
    return () => clearInterval(t);
  }, []);

  const push = useCallback((role: "bot" | "user", text: string, editStep?: Step) => {
    idRef.current += 1;
    setMessages((m) => [...m, { id: idRef.current, role, text, editStep }]);
  }, []);

  // Streams a bot line in word by word.
  const streamLine = useCallback(async (line: string) => {
    setTyping(true);
    await sleep(Math.min(700, 260 + line.length * 2));
    setTyping(false);
    idRef.current += 1;
    const id = idRef.current;
    setMessages((m) => [...m, { id, role: "bot", text: "" }]);
    const tokens = line.split(/(\s+)/);
    let acc = "";
    for (const tk of tokens) {
      acc += tk;
      const snapshot = acc;
      setMessages((m) => m.map((x) => (x.id === id ? { ...x, text: snapshot } : x)));
      if (tk.trim()) await sleep(22);
    }
  }, []);

  const bot = useCallback(
    async (...lines: string[]) => {
      for (const line of lines) {
        await streamLine(line);
        await sleep(120);
      }
    },
    [streamLine],
  );

  const askOptions = useCallback((next: Step, opts: Option[], withOther = true) => {
    setStep(next);
    setOptions(withOther ? [...opts, OTHER] : opts);
    setMode("options");
  }, []);

  const askText = useCallback((next: Step, ph: string, otp = false) => {
    setStep(next);
    setOptions([]);
    setMode(otp ? "otp" : "text");
    setPlaceholder(ph);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing, options]);

  // Opening
  const startOpening = useCallback(async () => {
    await bot(
      "👋 Hi! I'm your UPES Assistant.",
      "I can help you explore programs, understand eligibility, compare specializations, check fees, scholarships, admissions and much more.",
      "What program are you interested in exploring?",
    );
    askOptions(
      "program",
      PROGRAMS.map((x) => ({ label: x.label, value: x.key })),
      false,
    );
  }, [bot, askOptions]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void startOpening();
  }, [startOpening]);

  const onClearChat = useCallback(() => {
    setMessages([]);
    setOptions([]);
    setTyping(false);
    setDraft("");
    setMode("none");
    setStep("program");
    setShowResumeCta(true);
    setProfileDone(false);
    profileRef.current = { ...emptyProfile };
    void startOpening();
  }, [startOpening]);

  const showTopics = useCallback(async () => {
    const p = profileRef.current;
    await bot("What would you like to explore first?");
    askOptions(
      "topics",
      topicPrompts(p).map((t) => ({ label: t, value: t })),
    );
    setOptions((o) => [...o.slice(0, -1), { label: "❓ Ask me anything", value: "__other__" }]);
  }, [bot, askOptions]);

  const handleOther = useCallback(async () => {
    await bot("Sure — go ahead and type your question in your own words. 😊");
    askText("free", "Ask me anything about UPES…");
  }, [bot, askText]);

  const askName = useCallback(async () => {
    await bot(
      "Perfect. I have a better idea of what you're looking for now. 😊",
      "What should I call you?",
    );
    askText("name", "Your name");
  }, [bot, askText]);

  const handleValue = useCallback(
    async (value: string, currentStep: Step) => {
      const p = profileRef.current;

      switch (currentStep) {
        case "program": {
          const key = value as ProgramKey;
          p.program = key;
          p.programLabel = PROGRAMS.find((x) => x.key === key)?.label ?? null;
          p.specialization = null;
          if (key === "unsure") {
            await bot(
              "No problem at all. I can help you figure that out. 😊",
              "I'll ask you a couple of quick questions later and recommend options based on your interests.",
            );
            await askName();
            return;
          }
          const spec = SPECIALIZATIONS[key];
          await bot("Great choice. Do you already have a specialization in mind?", spec.title);
          askOptions(
            "specialization",
            [
              ...spec.items.map((s) => ({ label: s, value: s })),
              { label: "🤔 I'm not sure yet", value: "unsure" },
            ],
            false,
          );
          return;
        }
        case "specialization": {
          if (value === "unsure") {
            await bot(
              "No problem at all. I can help you figure that out. 😊",
              "I'll ask you a couple of quick questions later and recommend options based on your interests.",
            );
          } else {
            p.specialization = value;
          }
          await askName();
          return;
        }
        case "name": {
          if (value.trim().length < 2) {
            await bot("Could you share your name so I can personalise this for you? 😊");
            askText("name", "Your name");
            return;
          }
          p.name = value.trim().split(" ")[0] || value.trim();
          await bot(
            `Nice to meet you, ${p.name}! 👋`,
            "One more thing — I can use your email to share useful information from our conversation, such as program details, eligibility or recommendations.",
            "What's the best email address for you?",
          );
          askText("email", "you@example.com");
          return;
        }
        case "email": {
          if (!/^\S+@\S+\.\S+$/.test(value.trim())) {
            await bot("Hmm, that doesn't look like a valid email. Could you check it once? 😊");
            askText("email", "you@example.com");
            return;
          }
          p.email = value.trim();
          await bot(
            "Almost done! 😊",
            "If you ever leave and come back, I'd like to help you continue from where you stopped rather than making you start over.",
            "What's the best mobile number to link to your UPES conversation?",
          );
          askText("phone", "Enter your 10-digit mobile number");
          return;
        }
        case "phone": {
          const digits = value.replace(/\D/g, "");
          if (digits.length < 10) {
            await bot("That number looks incomplete — could you share a 10-digit mobile number?");
            askText("phone", "Enter your 10-digit mobile number");
            return;
          }
          p.phone = digits;
          await bot(
            `Thanks! I've sent a quick OTP to ${maskPhone(digits)}.`,
            "Please enter the 6-digit OTP to verify your number.",
          );
          askText("otp", "6-digit OTP", true);
          return;
        }
        case "otp": {
          if (!/^\d{6}$/.test(value.trim())) {
            await bot("That OTP doesn't look right. Please enter the 6-digit code.");
            askText("otp", "6-digit OTP", true);
            return;
          }
          saveProfile(p);
          setProfileDone(true);
          await bot(
            `✅ You're all set, ${p.name || "there"}!`,
            "I've saved your conversation so you can pick up where you left off if you come back later.",
          );
          await showTopics();
          return;
        }
        case "existing_phone": {
          const digits = value.replace(/\D/g, "");
          if (digits.length < 10) {
            await bot("Could you share the full 10-digit mobile number you used earlier?");
            askText("existing_phone", "Enter your 10-digit mobile number");
            return;
          }
          p.phone = digits;
          await bot(
            `Great. I'm sending a quick OTP to ${maskPhone(digits)} to verify it's you.`,
            "Please enter the 6-digit OTP.",
          );
          askText("existing_otp", "6-digit OTP", true);
          return;
        }
        case "existing_otp": {
          if (!/^\d{6}$/.test(value.trim())) {
            await bot("That OTP doesn't look right. Please enter the 6-digit code.");
            askText("existing_otp", "6-digit OTP", true);
            return;
          }
          const saved = loadProfile();
          if (!saved) {
            await bot(
              "I couldn't find an earlier conversation linked to this number. No worries — let's set you up quickly. 😊",
              "What program are you interested in exploring?",
            );
            askOptions(
              "program",
              PROGRAMS.map((x) => ({ label: x.label, value: x.key })),
              false,
            );
            return;
          }
          profileRef.current = { ...saved, phone: p.phone };
          setProfileDone(true);
          const sp = profileRef.current;
          await bot(
            `🎉 Welcome back, ${sp.name || "there"}!`,
            `I remember you were exploring ${sp.specialization || sp.programLabel?.replace(/^[^\w]+\s*/, "") || "our programs"}.`,
            `You were last looking at: ${sp.lastTopic || "getting started with your program options"}`,
            "Would you like to continue from there?",
          );
          askOptions(
            "resume",
            [
              { label: "▶️ Continue where I left off", value: "continue" },
              { label: "🔄 Start something new", value: "new" },
              { label: "❓ Ask me something else", value: "__other__" },
            ],
            false,
          );
          return;
        }
        case "resume": {
          if (value === "continue") {
            const topic =
              profileRef.current.lastTopic ?? topicPrompts(profileRef.current)[0] ?? "options";
            await bot(answerFor(topic, profileRef.current));
            await showTopics();
          } else {
            await bot("Absolutely! What would you like to explore?");
            askOptions(
              "topics",
              topicPrompts(profileRef.current).map((t) => ({ label: t, value: t })),
            );
            setOptions((o) => [
              ...o.slice(0, -1),
              { label: "❓ Ask me anything", value: "__other__" },
            ]);
          }
          return;
        }
        case "topics":
        case "free": {
          p.lastTopic = value;
          saveProfile(p);
          await bot(answerFor(value, p));
          await bot("Anything else you'd like to explore?");
          askOptions(
            "topics",
            topicPrompts(p).map((t) => ({ label: t, value: t })),
          );
          setOptions((o) => [
            ...o.slice(0, -1),
            { label: "❓ Ask me anything", value: "__other__" },
          ]);
          return;
        }
      }
    },
    [bot, askOptions, askText, askName, showTopics],
  );

  // Re-ask a lead-creation question when the user edits an earlier answer.
  const reAsk = useCallback(
    async (s: Step) => {
      const p = profileRef.current;
      switch (s) {
        case "program":
          await bot("Sure — which program would you like to explore instead?");
          askOptions(
            "program",
            PROGRAMS.map((x) => ({ label: x.label, value: x.key })),
            false,
          );
          return;
        case "specialization": {
          const spec = SPECIALIZATIONS[p.program ?? "unsure"];
          if (!spec.items.length) {
            await reAsk("program");
            return;
          }
          await bot("No problem — pick the specialization you'd like.");
          askOptions(
            "specialization",
            [
              ...spec.items.map((x) => ({ label: x, value: x })),
              { label: "🤔 I'm not sure yet", value: "unsure" },
            ],
            false,
          );
          return;
        }
        case "name":
          await bot("Of course — what should I call you?");
          askText("name", "Your name");
          return;
        case "email":
          await bot("Sure — what's the correct email address?");
          askText("email", "you@example.com");
          return;
        case "phone":
          await bot("No problem — what's the correct mobile number?");
          askText("phone", "Enter your 10-digit mobile number");
          return;
        default:
          return;
      }
    },
    [bot, askOptions, askText],
  );

  const onEdit = useCallback(
    async (msg: Msg) => {
      if (!msg.editStep || typing) return;
      setMessages((m) => {
        const i = m.findIndex((x) => x.id === msg.id);
        return i === -1 ? m : m.slice(0, i);
      });
      setOptions([]);
      setMode("none");
      setDraft("");
      await reAsk(msg.editStep);
    },
    [reAsk, typing],
  );

  const onOption = async (opt: Option) => {
    if (mode !== "options") return;
    const current = step;
    push("user", opt.label, EDITABLE.includes(current) ? current : undefined);
    setOptions([]);
    setMode("none");
    if (opt.value === "__other__") {
      await handleOther();
      return;
    }
    await handleValue(opt.value, current);
  };

  const onResume = async () => {
    setShowResumeCta(false);
    setOptions([]);
    setMode("none");
    push("user", "↩ Continue where I left off");
    await bot(
      "Welcome back! 👋",
      "Let's get you back to where you left off.",
      "What's the mobile number you used earlier?",
    );
    askText("existing_phone", "Enter your 10-digit mobile number");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = draft.trim();
    if (!value || (mode !== "text" && mode !== "otp")) return;
    const current = step;
    push(
      "user",
      mode === "otp" ? "••••••" : value,
      EDITABLE.includes(current) ? current : undefined,
    );
    setDraft("");
    setMode("none");
    await handleValue(value, current);
  };

  // Inactivity nudge — 30s of silence once the profile is complete.
  useEffect(() => {
    if (!profileDone || minimized || typing || mode === "none") return;
    const t = setTimeout(() => {
      const nudges = idleNudges(profileRef.current);
      const line = nudges[nudgeIndex.current % nudges.length];
      nudgeIndex.current += 1;
      if (line) void bot(line);
    }, IDLE_MS);
    return () => clearTimeout(t);
  }, [profileDone, minimized, typing, mode, messages, bot]);

  const busy = mode === "none";
  const current = ANNOUNCEMENTS[announcement];

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        aria-label="Open UPES Assistant chat"
        className="brand-gradient-btn fixed right-5 bottom-5 flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold shadow-lg transition hover:opacity-90"
      >
        <GraduationCap className="size-5" />
        Chat with UPES Assistant
      </button>
    );
  }

  return (
    <div className="chat-shell mx-auto flex h-[100dvh] w-full max-w-3xl flex-col overflow-hidden border-x border-border">
      <header className="brand-bar flex items-center gap-3 px-5 py-4 text-primary-foreground">
        <span className="flex size-10 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
          <GraduationCap className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-wide">UPES Assistant</p>
          <p className="flex items-center gap-1 text-xs opacity-80">
            <Sparkles className="size-3" /> Programs · Eligibility · Fees · Admissions
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onClearChat}
            title="Clear chat"
            aria-label="Clear chat"
            className="flex size-8 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/25"
          >
            <Trash2 className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setMinimized(true)}
            title="Minimise chat"
            aria-label="Minimise chat"
            className="flex size-8 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/25"
          >
            <Minus className="size-4" />
          </button>
        </div>
        <span className="hidden items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-[11px] sm:flex">
          <ShieldCheck className="size-3" /> Secure
        </span>
      </header>

      {current && (
        <aside
          aria-live="polite"
          className="brand-gradient-card flex items-center gap-2 border-b border-border px-4 py-2.5 text-xs sm:px-6"
        >
          <span aria-hidden>{current.icon}</span>
          <p className="min-w-0">
            <span className="font-semibold text-secondary">{current.title}:</span>{" "}
            <span className="text-muted-foreground">{current.detail}</span>
          </p>
        </aside>
      )}

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-5 sm:px-6">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="flex max-w-[85%] items-center gap-1.5">
              {m.role === "user" && m.editStep && !profileDone && (
                <button
                  type="button"
                  onClick={() => void onEdit(m)}
                  title="Edit this answer"
                  aria-label="Edit this answer"
                  className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:border-primary hover:text-primary"
                >
                  <Pencil className="size-3.5" />
                </button>
              )}
              <div
                className={`animate-bubble-in rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line ${
                  m.role === "user" ? "bubble-user" : "bubble-bot"
                }`}
              >
                {m.text}
              </div>
            </div>
          </div>
        ))}

        {typing && (
          <div className="flex justify-start">
            <div className="bubble-bot flex items-center gap-1 rounded-2xl px-4 py-3">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="size-1.5 animate-bounce rounded-full bg-muted-foreground"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        )}

        {mode === "options" && (
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            {options.map((o) => (
              <Button
                key={o.value + o.label}
                variant="outline"
                size="sm"
                onClick={() => onOption(o)}
                className="animate-bubble-in h-auto rounded-full border-primary/25 bg-card px-4 py-2 text-left text-sm font-medium text-secondary whitespace-normal hover:border-primary hover:bg-accent"
              >
                {o.label}
              </Button>
            ))}
          </div>
        )}

        {showResumeCta && mode === "options" && ["program", "specialization"].includes(step) && (
          <div className="brand-gradient-card animate-bubble-in mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-secondary">Already explored UPES?</p>
              <p className="text-xs text-muted-foreground">
                Verify your mobile number to pick up right where you left off.
              </p>
            </div>
            <Button
              size="sm"
              onClick={onResume}
              className="brand-gradient-btn rounded-full px-4 hover:opacity-90"
            >
              ↩ Continue where I left off
            </Button>
          </div>
        )}
      </div>

      <form
        onSubmit={onSubmit}
        className="flex items-center gap-2 border-t border-border bg-card px-4 py-3 sm:px-6"
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={busy || mode === "options"}
          inputMode={mode === "otp" ? "numeric" : "text"}
          maxLength={mode === "otp" ? 6 : 300}
          placeholder={
            mode === "options"
              ? "Pick an option above, or tap “Something else”"
              : busy
                ? "One moment…"
                : placeholder
          }
          className="h-11 rounded-full border-border bg-background"
          aria-label="Message"
        />
        <Button
          type="submit"
          size="icon"
          disabled={busy || mode === "options" || !draft.trim()}
          className="size-11 shrink-0 rounded-full"
        >
          <Send className="size-4" />
          <span className="sr-only">Send</span>
        </Button>
      </form>
    </div>
  );
}
