import {
  emptyProfile,
  getCategories,
  getProgrammes,
  getQuestionsForCategory,
  type Profile,
  type ProgramKey,
} from "@/lib/chatbot";

export type { Profile, ProgramKey };

export type Announcement = { icon: string; title: string; detail: string };

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

export const PROFILE_KEY = "upes_assistant_profile_v1";

function isProfile(value: unknown): value is Profile {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return typeof p["email"] === "string" || typeof p["mobile"] === "string" || typeof p["firstName"] === "string";
}

export function loadProfile(): Profile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isProfile(parsed)) return null;
    const profile = { ...emptyProfile(), ...parsed };
    if (profile.email && profile.mobile) profile.profileCompleted = true;
    return profile;
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

export function findProfileByMobile(mobile: string): Profile | null {
  const saved = loadProfile();
  if (!saved) return null;
  const want = mobile.replace(/\D/g, "");
  if (!want || saved.mobile.replace(/\D/g, "") !== want) return null;
  return saved;
}

export function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "your number";
  return `${"•".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

export function programSubject(p: Profile): string {
  return (
    p.specialization ||
    p.programmeName ||
    p.programLabel?.replace(/^[^\w]+\s*/, "") ||
    "your programmes of interest"
  );
}

/** Map onboarding programme/specialization onto the existing Q&A catalogue context. */
export function syncQaContext(p: Profile) {
  if (p.program === "undergraduate") p.courseType = "UG";
  else if (p.program === "postgraduate") p.courseType = "PG";
  else p.courseType = null;

  const hay = `${p.specialization ?? ""} ${p.programmeName ?? ""} ${p.programLabel ?? ""}`.toLowerCase();
  const listed = [...getProgrammes("UG"), ...getProgrammes("PG")].sort(
    (a, b) => b.name.length - a.name.length,
  );
  const hit = listed.find((pr) => hay.includes(pr.name.toLowerCase()));
  if (hit) {
    p.programmeId = hit.id;
    p.programmeName = hit.name;
  }
}

export function suggestedExploreOptions(p: Profile): { label: string; value: string }[] {
  const cats = getCategories();
  const byName = (name: string) => cats.find((c) => c.name === name);
  const subject = programSubject(p);
  const options: { label: string; value: string }[] = [];

  const programs = byName("Programs");
  if (programs) {
    const specific = getQuestionsForCategory(programs.id, p)[0];
    if (specific) options.push({ label: specific.question, value: `q:${specific.id}` });
    else options.push({ label: `🎓 Tell me about my ${subject} options`, value: `cat:${programs.id}` });
  }

  const mapped: { label: string; name: string }[] = [
    { label: "✅ Check my eligibility", name: "Eligibility Criteria" },
    { label: "💰 Fees & scholarships", name: "Fee Structure" },
    { label: "💼 Career & placement opportunities", name: "Placements" },
    { label: "📝 How do I apply?", name: "Admission Process" },
  ];
  for (const item of mapped) {
    const cat = byName(item.name);
    if (cat) options.push({ label: item.label, value: `cat:${cat.id}` });
  }
  return options;
}
