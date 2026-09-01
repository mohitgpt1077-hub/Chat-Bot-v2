export type ProgramKey =
  | "undergraduate"
  | "postgraduate"
  | "doctoral"
  | "online"
  | "unsure";

export const PROGRAMS: { key: ProgramKey; label: string }[] = [
  { key: "undergraduate", label: "🎓 Undergraduate" },
  { key: "postgraduate", label: "📚 Postgraduate" },
  { key: "doctoral", label: "🔬 Doctoral (PhD)" },
  { key: "online", label: "💻 Online Programs" },
  { key: "unsure", label: "🤔 I'm not sure yet" },
];

export const SPECIALIZATIONS: Record<ProgramKey, { title: string; items: string[] }> = {
  undergraduate: {
    title: "Which undergraduate area interests you?",
    items: [
      "Computer Science & Engineering",
      "Design",
      "Law",
      "Business (BBA)",
      "Health Sciences",
    ],
  },
  postgraduate: {
    title: "Which MBA specialization interests you?",
    items: [
      "Business Analytics",
      "Finance",
      "Marketing",
      "Human Resource Management",
      "Operations",
    ],
  },
  doctoral: {
    title: "Which doctoral research area interests you?",
    items: ["Engineering", "Management", "Law", "Computer Science", "Applied Sciences"],
  },
  online: {
    title: "Which online program interests you?",
    items: ["Online MBA", "Online BBA", "Online BCA", "Online MCA"],
  },
  unsure: { title: "", items: [] },
};

export type Announcement = { icon: string; title: string; detail: string };

// Highlighted strip content — update these as dates / events change.
export const ANNOUNCEMENTS: Announcement[] = [
  {
    icon: "⏳",
    title: "Last date to apply",
    detail: "Applications for the upcoming intake close on 31 May.",
  },
  {
    icon: "🎤",
    title: "Upcoming event",
    detail: "Virtual Open Day with deans & students — this Saturday, 11 AM IST.",
  },
  {
    icon: "🏆",
    title: "Scholarships",
    detail: "Merit scholarships of up to 50% available on early applications.",
  },
];

export function idleNudges(p: Profile): string[] {
  const s = subject(p);
  const you = p.name ? `${p.name}, s` : "S";
  return [
    `${you}till here? 😊 A quick one about ${s}: UPES has 500+ recruiters on campus and a 90%+ placement record. Want the details?`,
    `${you}hall I show you the scholarship bands for ${s}? Many students qualify for up to 50% off tuition.`,
    `${you}ome students find the eligibility criteria for ${s} easier than expected — want me to check yours?`,
  ];
}

export type Profile = {
  role: "student" | "parent" | null;
  program: ProgramKey | null;
  programLabel: string | null;
  specialization: string | null;
  name: string;
  email: string;
  phone: string;
  lastTopic: string | null;
};

export const PROFILE_KEY = "upes_assistant_profile";

export function loadProfile(): Profile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

export function saveProfile(p: Profile) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
}

export function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "your number";
  return `${"•".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

const subject = (p: Profile) =>
  p.specialization || p.programLabel?.replace(/^[^\w]+\s*/, "") || "your programs of interest";

export function topicPrompts(p: Profile): string[] {
  const s = subject(p);
  return [
    `🎓 Tell me about my ${s} options`,
    "✅ Check my eligibility",
    "💰 Fees & scholarships",
    "💼 Career & placement opportunities",
    "📝 How do I apply?",
  ];
}

export function answerFor(prompt: string, p: Profile): string {
  const s = subject(p);
  const who = p.role === "parent" ? "your child" : "you";
  if (/options/i.test(prompt))
    return `Here's a quick look at ${s} at UPES:\n\n• Industry-aligned curriculum co-designed with recruiters\n• Choice of electives and minors from the second year\n• Live projects, internships and a capstone with partner organisations\n• Global exchange and semester-abroad pathways\n\nWant me to compare two specializations side by side?`;
  if (/eligibility/i.test(prompt))
    return `Eligibility for ${s} (indicative):\n\n• Minimum 50% aggregate in the qualifying examination\n• A valid national entrance score or UPES's own entrance test (UPESEAT / UPESMET / ULSAT depending on the school)\n• Personal interview for select programs\n\nTell me ${who === "your child" ? "their" : "your"} board percentage and I'll tell you where ${who} stand${who === "your child" ? "s" : ""}.`;
  if (/fees|scholarship/i.test(prompt))
    return `Fees & scholarships for ${s}:\n\n• Tuition is charged per semester, with easy instalment and education-loan tie-ups\n• Merit scholarships of up to 50% based on board / entrance performance\n• Dedicated scholarships for girl students, sports achievers and defence backgrounds\n\nShould I estimate a likely scholarship band for ${who}?`;
  if (/career|placement/i.test(prompt))
    return `Careers after ${s}:\n\n• 90%+ placement record across schools with 500+ recruiters on campus\n• Recruiters include leading consulting, technology, energy and BFSI organisations\n• Pre-placement training, mock interviews and a dedicated career services team\n\nWant typical roles and salary ranges for this specialization?`;
  if (/apply/i.test(prompt))
    return `Applying for ${s} is straightforward:\n\n1. Fill the online application form\n2. Pick your entrance route (UPES test or accepted national score)\n3. Appear for the test / interview\n4. Accept the offer and pay the admission fee to block your seat\n\nWould you like me to email the application checklist?`;
  return `Thanks for asking about "${prompt}". Here's what I can tell you about ${s}: our admissions team covers curriculum, eligibility, fees, scholarships, hostel life and placements. Pick any of those and I'll go deeper — or ask me anything else in your own words.`;
}
