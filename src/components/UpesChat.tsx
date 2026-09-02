import { useCallback, useEffect, useRef, useState } from "react";
import { GraduationCap, Minus, Pencil, Send, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  COUNSELLOR_CTA_LABEL,
  FALLBACK_MESSAGE,
  emptyProfile,
  getAnswer,
  getCategories,
  getCategory,
  getCounsellorCta,
  getQuestion,
  getQuestionsForCategory,
  getRelatedQuestions,
  isHttpUrl,
  matchFreeText,
  type Answer,
  type Profile,
  type ProgramKey,
} from "@/lib/chatbot";
import {
  ANNOUNCEMENTS,
  PROGRAMS,
  SPECIALIZATIONS,
  findProfileByMobile,
  maskPhone,
  programSubject,
  saveProfile,
  suggestedExploreOptions,
  syncQaContext,
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
  | "prompts"
  | "free"
  | "categories"
  | "questions"
  | "after_answer";

type Msg = {
  id: number;
  role: "bot" | "user";
  text: string;
  sourceUrl?: string;
  sourceLabel?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  editStep?: Step;
};
type Option = { label: string; value: string };
type Mode = "options" | "text" | "otp" | "none";

const MENU = "__menu__";
const NEW_CHAT = "__new__";
const COUNSELLOR = "__counsellor__";
const ASK_ANYTHING = "__other__";
const UNSURE = "unsure";
const EDITABLE: Step[] = ["program", "specialization", "name", "email", "phone"];
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
  const profileRef = useRef<Profile>(emptyProfile());
  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setAnnouncement((i) => (i + 1) % ANNOUNCEMENTS.length), 6000);
    return () => clearInterval(t);
  }, []);

  const push = useCallback((role: "bot" | "user", text: string, editStep?: Step) => {
    idRef.current += 1;
    const msg: Msg = { id: idRef.current, role, text };
    if (editStep) msg.editStep = editStep;
    setMessages((m) => [...m, msg]);
  }, []);

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
    return id;
  }, []);

  const bot = useCallback(
    async (...lines: string[]) => {
      let lastId = 0;
      for (const line of lines) {
        lastId = await streamLine(line);
        await sleep(120);
      }
      return lastId;
    },
    [streamLine],
  );

  const attachTo = useCallback((id: number, extra: Partial<Msg>) => {
    setMessages((m) => m.map((x) => (x.id === id ? { ...x, ...extra } : x)));
  }, []);

  const askOptions = useCallback((next: Step, opts: Option[]) => {
    setStep(next);
    setOptions(opts);
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

  const showCategories = useCallback(async () => {
    const cats = getCategories();
    askOptions(
      "categories",
      cats.map((c) => ({ label: c.name, value: `cat:${c.id}` })),
    );
  }, [askOptions]);

  const showContinueOptions = useCallback(
    (extra: Option[] = []) => {
      askOptions("after_answer", [
        ...extra,
        { label: "Main Menu", value: MENU },
        { label: "Start New Conversation", value: NEW_CHAT },
      ]);
    },
    [askOptions],
  );

  const presentAnswer = useCallback(
    async (answer: Answer) => {
      const id = await bot(answer.text);
      const extra: Partial<Msg> = {};
      if (answer.sourceUrl) extra.sourceUrl = answer.sourceUrl;
      if (answer.sourceLabel) extra.sourceLabel = answer.sourceLabel;
      if (answer.cta?.label) extra.ctaLabel = answer.cta.label;
      if (answer.cta?.url) extra.ctaUrl = answer.cta.url;
      attachTo(id, extra);

      const related = getRelatedQuestions(answer.questionId, profileRef.current);
      if (related.length) await bot("You might also want to know:");
      showContinueOptions(related.map((q) => ({ label: q.question, value: `q:${q.id}` })));
    },
    [attachTo, bot, showContinueOptions],
  );

  const presentFallback = useCallback(async () => {
    const id = await bot(FALLBACK_MESSAGE);
    const cta = getCounsellorCta();
    const extra: Partial<Msg> = { ctaLabel: cta.label };
    if (cta.url) extra.ctaUrl = cta.url;
    attachTo(id, extra);
    showContinueOptions([{ label: COUNSELLOR_CTA_LABEL, value: COUNSELLOR }]);
  }, [attachTo, bot, showContinueOptions]);

  const rememberTopic = useCallback((topic: string, categoryId?: string, questionId?: string) => {
    const p = profileRef.current;
    p.lastTopic = topic;
    if (categoryId) p.lastCategoryId = categoryId;
    if (questionId) p.lastQuestionId = questionId;
    if (p.profileCompleted) saveProfile(p);
  }, []);

  const openCategory = useCallback(
    async (categoryId: string) => {
      const category = getCategory(categoryId);
      const questions = getQuestionsForCategory(categoryId, profileRef.current);
      if (!category || questions.length === 0) {
        await presentFallback();
        return;
      }
      rememberTopic(category.name, category.id);
      await bot(`Here are questions about ${category.name}.`);
      askOptions(
        "questions",
        questions.map((q) => ({ label: q.question, value: `q:${q.id}` })),
      );
    },
    [askOptions, bot, presentFallback, rememberTopic],
  );

  const openQuestion = useCallback(
    async (questionId: string) => {
      const answer = getAnswer(questionId);
      const question = getQuestion(questionId);
      if (!answer) {
        await presentFallback();
        return;
      }
      rememberTopic(question?.question ?? "a previous question", question?.categoryId, questionId);
      await presentAnswer(answer);
    },
    [presentAnswer, presentFallback, rememberTopic],
  );

  const showSuggestedPrompts = useCallback(async () => {
    const prompts = suggestedExploreOptions(profileRef.current);
    askOptions("prompts", [...prompts, { label: "❓ Ask me anything", value: ASK_ANYTHING }]);
  }, [askOptions]);

  const startOpening = useCallback(async () => {
    await bot(
      "👋 Hi! I'm your UPES Assistant.",
      "I can help you explore programs, understand eligibility, compare specializations, check fees, scholarships, admissions and much more.",
      "Welcome! 😊 Let's get to know what you're looking for so I can show you information that's actually relevant to you.",
      "What program are you interested in exploring?",
    );
    askOptions(
      "program",
      PROGRAMS.map((x) => ({ label: x.label, value: x.key })),
    );
  }, [askOptions, bot]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void startOpening();
  }, [startOpening]);

  const startNewConversation = useCallback(async () => {
    setMessages([]);
    setOptions([]);
    setTyping(false);
    setDraft("");
    setMode("none");
    setShowResumeCta(true);
    if (profileRef.current.profileCompleted) {
      setProfileDone(true);
      await bot("What would you like to explore first?");
      await showSuggestedPrompts();
      return;
    }
    setProfileDone(false);
    setStep("program");
    void startOpening();
  }, [bot, showSuggestedPrompts, startOpening]);

  const onClearChat = useCallback(() => {
    void startNewConversation();
  }, [startNewConversation]);

  const handleFreeText = useCallback(
    async (value: string) => {
      const lower = value.trim().toLowerCase();
      if (lower === "main menu") {
        await showCategories();
        return;
      }
      if (lower === "start new conversation") {
        await startNewConversation();
        return;
      }

      const match = matchFreeText(value, profileRef.current);
      if (match.kind === "category") {
        await openCategory(match.category.id);
        return;
      }
      if (match.kind === "question") {
        await openQuestion(match.question.id);
        return;
      }
      await presentFallback();
    },
    [openCategory, openQuestion, presentFallback, showCategories, startNewConversation],
  );

  const handleOther = useCallback(async () => {
    await bot("Sure — go ahead and type your question in your own words. 😊");
    askText("free", "Ask me anything about UPES…");
  }, [askText, bot]);

  const askName = useCallback(async () => {
    await bot("What should I call you?");
    askText("name", "Your name");
  }, [askText, bot]);

  const completeProfile = useCallback(async () => {
    const p = profileRef.current;
    p.profileCompleted = true;
    saveProfile(p);
    setProfileDone(true);
    await bot(
      `✅ You're all set, ${p.firstName || "there"}!`,
      "I've saved your conversation so you can pick up where you left off if you come back later.",
      "What would you like to explore first?",
    );
    await showSuggestedPrompts();
  }, [bot, showSuggestedPrompts]);

  const restoreExistingUser = useCallback(
    async (saved: Profile) => {
      profileRef.current = { ...saved, profileCompleted: true };
      setProfileDone(true);
      const exploring = programSubject(saved);
      await bot(
        `Welcome back, ${saved.firstName || "there"}! 👋 You were previously exploring ${exploring}. Would you like to continue where you left off?`,
      );
      askOptions("resume", [
        { label: "▶️ Continue where I left off", value: "continue" },
        { label: "🔄 Start something new", value: "new" },
        { label: "❓ Ask me something else", value: ASK_ANYTHING },
      ]);
    },
    [askOptions, bot],
  );

  const handleValue = useCallback(
    async (value: string, currentStep: Step) => {
      const p = profileRef.current;

      switch (currentStep) {
        case "program": {
          const key = value as ProgramKey;
          p.program = key;
          p.programLabel = PROGRAMS.find((x) => x.key === key)?.label ?? null;
          p.specialization = null;
          syncQaContext(p);
          if (key === UNSURE) {
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
              { label: "🤔 I'm not sure yet", value: UNSURE },
            ],
          );
          return;
        }
        case "specialization": {
          if (value === UNSURE) {
            await bot(
              "No problem at all. I can help you figure that out. 😊",
              "I'll ask you a couple of quick questions later and recommend options based on your interests.",
            );
          } else {
            p.specialization = value;
          }
          syncQaContext(p);
          await askName();
          return;
        }
        case "name": {
          if (!value.trim()) {
            await bot("Your name is required — please enter it so I can personalise this for you.");
            askText("name", "Your name");
            return;
          }
          const parts = value.trim().split(/\s+/);
          p.firstName = parts[0] ?? value.trim();
          p.lastName = parts.slice(1).join(" ");
          await bot(
            `Nice to meet you, ${p.firstName}! 👋`,
            "One more thing — I can use your email to share useful information from our conversation, such as program details, eligibility or recommendations.",
            "What's the best email address for you?",
          );
          askText("email", "you@example.com");
          return;
        }
        case "email": {
          if (!value.trim()) {
            await bot("An email address is required. What's the best email for you?");
            askText("email", "you@example.com");
            return;
          }
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
          if (!value.trim()) {
            await bot("A mobile number is required to link your conversation.");
            askText("phone", "Enter your 10-digit mobile number");
            return;
          }
          const digits = value.replace(/\D/g, "");
          if (digits.length < 10) {
            await bot("That number looks incomplete — could you share a 10-digit mobile number?");
            askText("phone", "Enter your 10-digit mobile number");
            return;
          }
          p.mobile = digits;
          await bot(
            `Thanks! I've sent a quick OTP to ${maskPhone(digits)}.`,
            "Please enter the 6-digit OTP to verify your number.",
          );
          askText("otp", "6-digit OTP", true);
          return;
        }
        case "otp": {
          if (!value.trim()) {
            await bot("Please enter the 6-digit OTP sent to your number.");
            askText("otp", "6-digit OTP", true);
            return;
          }
          if (!/^\d{6}$/.test(value.trim())) {
            await bot("That OTP doesn't look right. Please enter the 6-digit code.");
            askText("otp", "6-digit OTP", true);
            return;
          }
          await completeProfile();
          return;
        }
        case "existing_phone": {
          if (!value.trim()) {
            await bot("A mobile number is required to find your earlier conversation.");
            askText("existing_phone", "Enter your 10-digit mobile number");
            return;
          }
          const digits = value.replace(/\D/g, "");
          if (digits.length < 10) {
            await bot("Could you share the full 10-digit mobile number you used earlier?");
            askText("existing_phone", "Enter your 10-digit mobile number");
            return;
          }
          p.mobile = digits;
          await bot(
            `Great. I'm sending a quick OTP to ${maskPhone(digits)} to verify it's you.`,
            "Please enter the 6-digit OTP.",
          );
          askText("existing_otp", "6-digit OTP", true);
          return;
        }
        case "existing_otp": {
          if (!value.trim()) {
            await bot("Please enter the 6-digit OTP sent to your number.");
            askText("existing_otp", "6-digit OTP", true);
            return;
          }
          if (!/^\d{6}$/.test(value.trim())) {
            await bot("That OTP doesn't look right. Please enter the 6-digit code.");
            askText("existing_otp", "6-digit OTP", true);
            return;
          }
          const saved = findProfileByMobile(p.mobile);
          if (!saved || !saved.profileCompleted) {
            await bot(
              "I couldn't find an earlier conversation linked to this number. You can continue as a new visitor — I won't create a duplicate profile.",
            );
            setShowResumeCta(true);
            await bot("What program are you interested in exploring?");
            askOptions(
              "program",
              PROGRAMS.map((x) => ({ label: x.label, value: x.key })),
            );
            return;
          }
          await restoreExistingUser(saved);
          return;
        }
        case "resume": {
          if (value === ASK_ANYTHING) {
            await handleOther();
            return;
          }
          if (value === "new") {
            await bot("Absolutely! What would you like to explore?");
            await showSuggestedPrompts();
            return;
          }
          const last = profileRef.current;
          if (last.lastQuestionId && getAnswer(last.lastQuestionId)) {
            await openQuestion(last.lastQuestionId);
            return;
          }
          if (last.lastCategoryId) {
            await openCategory(last.lastCategoryId);
            return;
          }
          await showSuggestedPrompts();
          return;
        }
        case "prompts":
        case "free": {
          if (value === ASK_ANYTHING) {
            await handleOther();
            return;
          }
          if (value.startsWith("q:")) {
            await openQuestion(value.slice(2));
            return;
          }
          if (value.startsWith("cat:")) {
            await openCategory(value.slice(4));
            return;
          }
          await handleFreeText(value);
          return;
        }
        case "categories": {
          if (value === MENU) {
            await showCategories();
            return;
          }
          if (value.startsWith("cat:")) {
            await openCategory(value.slice(4));
            return;
          }
          await handleFreeText(value);
          return;
        }
        case "questions":
        case "after_answer": {
          if (value === MENU) {
            await showCategories();
            return;
          }
          if (value === NEW_CHAT) {
            await startNewConversation();
            return;
          }
          if (value === COUNSELLOR) {
            const cta = getCounsellorCta();
            if (cta.url) {
              window.open(cta.url, "_blank", "noopener,noreferrer");
            }
            await presentFallback();
            return;
          }
          if (value.startsWith("q:")) {
            await openQuestion(value.slice(2));
            return;
          }
          if (value.startsWith("cat:")) {
            await openCategory(value.slice(4));
            return;
          }
          await handleFreeText(value);
          return;
        }
      }
    },
    [
      askName,
      askOptions,
      askText,
      bot,
      completeProfile,
      handleFreeText,
      handleOther,
      openCategory,
      openQuestion,
      presentFallback,
      restoreExistingUser,
      showCategories,
      showSuggestedPrompts,
      startNewConversation,
    ],
  );

  const reAsk = useCallback(
    async (s: Step) => {
      switch (s) {
        case "program":
          await bot("What program are you interested in exploring?");
          askOptions(
            "program",
            PROGRAMS.map((x) => ({ label: x.label, value: x.key })),
          );
          return;
        case "specialization": {
          const spec = SPECIALIZATIONS[profileRef.current.program ?? "unsure"];
          if (!spec.items.length) {
            await reAsk("program");
            return;
          }
          await bot("Great choice. Do you already have a specialization in mind?", spec.title);
          askOptions(
            "specialization",
            [
              ...spec.items.map((x) => ({ label: x, value: x })),
              { label: "🤔 I'm not sure yet", value: UNSURE },
            ],
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
    [askOptions, askText, bot],
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

  const onOption = async (opt: Option) => {
    if (mode !== "options") return;
    const current = step;
    push("user", opt.label, EDITABLE.includes(current) ? current : undefined);
    setOptions([]);
    setMode("none");
    await handleValue(opt.value, current);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = draft.trim();
    if (!value) return;
    if (mode === "text" || mode === "otp") {
      const current = step;
      push(
        "user",
        mode === "otp" ? "••••••" : value,
        EDITABLE.includes(current) ? current : undefined,
      );
      setDraft("");
      setMode("none");
      await handleValue(value, current);
      return;
    }
    if (profileDone && (mode === "options" || mode === "none") && !typing) {
      push("user", value);
      setDraft("");
      setOptions([]);
      setMode("none");
      await handleFreeText(value);
    }
  };

  const busy = mode === "none" || typing;
  const inputLocked = typing || mode === "none" || (mode === "options" && !profileDone);
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
            title="Start New Conversation"
            aria-label="Start New Conversation"
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
                {m.role === "bot" && (m.sourceUrl || m.ctaLabel) && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {isHttpUrl(m.sourceUrl) && (
                      <a
                        href={m.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center rounded-full border border-primary/25 bg-background px-3 py-1 text-xs font-medium text-primary hover:border-primary"
                      >
                        {m.sourceLabel || "Know More"}
                      </a>
                    )}
                    {m.ctaLabel && isHttpUrl(m.ctaUrl) && (
                      <a
                        href={m.ctaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center rounded-full border border-primary/25 bg-background px-3 py-1 text-xs font-medium text-primary hover:border-primary"
                      >
                        {m.ctaLabel}
                      </a>
                    )}
                    {m.ctaLabel && !isHttpUrl(m.ctaUrl) && (
                      <span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                        {m.ctaLabel}
                      </span>
                    )}
                  </div>
                )}
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

        {showResumeCta &&
          !profileDone &&
          mode === "options" &&
          ["program", "specialization", "prompts"].includes(step) && (
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
          disabled={inputLocked}
          inputMode={mode === "otp" ? "numeric" : "text"}
          maxLength={mode === "otp" ? 6 : 300}
          placeholder={
            mode === "options" && !profileDone
              ? "Pick an option above"
              : mode === "options" && profileDone
                ? "Pick an option, or type a question"
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
          disabled={inputLocked || !draft.trim()}
          className="size-11 shrink-0 rounded-full"
        >
          <Send className="size-4" />
          <span className="sr-only">Send</span>
        </Button>
      </form>
    </div>
  );
}
