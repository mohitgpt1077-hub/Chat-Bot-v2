import { CHATBOT_CATALOG } from "./catalog";
import type {
  Answer,
  Category,
  CTA,
  FreeTextMatch,
  Profile,
  Programme,
  Question,
} from "./types";

/**
 * Local catalog adapter. Swap this module (or individual loaders) for HTTP
 * calls later without changing the chat UI:
 *   Chatbot UI → Service/API → Drupal/CMS/DB
 */
const catalog = CHATBOT_CATALOG;

const BBA_FAMILY = new Set(["PRG01", "PRG02"]);

export const FALLBACK_MESSAGE =
  "I couldn't find verified information for this query. Would you like to speak with an admissions counsellor?";

export const COUNSELLOR_CTA_LABEL = "Talk to a Counsellor";

export function emptyProfile(): Profile {
  return {
    firstName: "",
    lastName: "",
    email: "",
    mobile: "",
    courseType: null,
    programmeId: null,
    programmeName: null,
    role: null,
    program: null,
    programLabel: null,
    specialization: null,
    lastTopic: null,
    lastCategoryId: null,
    lastQuestionId: null,
    profileCompleted: false,
  };
}

export function isHttpUrl(value: string | null | undefined): value is string {
  return Boolean(value && /^https?:\/\//i.test(value));
}

export function isShippable(question: Question): boolean {
  return (
    question.active &&
    question.contentType !== "Placeholder" &&
    Boolean(question.approvedAnswer && question.approvedAnswer.trim())
  );
}

export function matchesProgrammeContext(question: Question, profile: Profile): boolean {
  if (question.courseType !== "BOTH" && profile.courseType && question.courseType !== profile.courseType) {
    return false;
  }
  if (!question.programmeId) return true;
  if (!profile.programmeId) return false;
  if (question.programmeId === profile.programmeId) return true;
  return BBA_FAMILY.has(question.programmeId) && BBA_FAMILY.has(profile.programmeId);
}

export function getCategories(): Category[] {
  return catalog.categories
    .filter((c) => c.active)
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

export function getProgrammes(courseType: "UG" | "PG"): Programme[] {
  return catalog.programmes.filter(
    (p) => p.active && !p.placeholder && (p.courseType === "BOTH" || p.courseType === courseType),
  );
}

export function getCategory(id: string): Category | null {
  return catalog.categories.find((c) => c.id === id) ?? null;
}

export function getQuestion(id: string): Question | null {
  return catalog.questions.find((q) => q.id === id) ?? null;
}

export function getQuestionsForCategory(categoryId: string, profile: Profile): Question[] {
  return catalog.questions
    .filter((q) => q.categoryId === categoryId && isShippable(q) && matchesProgrammeContext(q, profile))
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

function resolveCta(question: Question): CTA | null {
  if (!question.ctaLabel) return null;
  const listed = catalog.ctas.find((c) => c.active && c.label === question.ctaLabel);
  const rawUrl = question.ctaUrl || listed?.destinationUrl || null;
  return {
    id: listed?.id ?? question.ctaLabel,
    label: question.ctaLabel,
    url: isHttpUrl(rawUrl) ? rawUrl : null,
  };
}

export function getAnswer(questionId: string): Answer | null {
  const question = getQuestion(questionId);
  if (!question || !isShippable(question) || !question.approvedAnswer) return null;
  return {
    questionId: question.id,
    text: question.approvedAnswer,
    sourceUrl: isHttpUrl(question.sourceUrl) ? question.sourceUrl : null,
    sourceLabel: question.sourceLabel,
    cta: resolveCta(question),
  };
}

export function getRelatedQuestions(questionId: string, profile: Profile): Question[] {
  const question = getQuestion(questionId);
  const fromMaster = question?.relatedQuestionIds ?? [];
  const fromSheet = catalog.relatedQuestions
    .filter((link) => link.active && link.parentQuestionId === questionId)
    .sort((a, b) => a.priority - b.priority)
    .map((link) => link.relatedQuestionId);

  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const id of [...fromMaster, ...fromSheet]) {
    if (seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }

  const related: Question[] = [];
  for (const id of ordered) {
    const next = getQuestion(id);
    if (!next || !isShippable(next) || !matchesProgrammeContext(next, profile)) continue;
    related.push(next);
    if (related.length === 4) break;
  }
  return related;
}

const STOP_WORDS = new Set([
  "what",
  "is",
  "the",
  "a",
  "an",
  "of",
  "for",
  "to",
  "do",
  "i",
  "my",
  "me",
  "can",
  "you",
  "about",
  "tell",
  "how",
  "are",
  "in",
  "at",
  "on",
  "and",
  "or",
  "with",
  "does",
  "there",
  "please",
]);

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9%\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  return normalize(value)
    .split(" ")
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

function stripProgrammeName(text: string, profile: Profile, question: Question): string {
  let next = normalize(text);
  if (question.programmeName) next = next.replace(normalize(question.programmeName), " ");
  if (profile.programmeName) next = next.replace(normalize(profile.programmeName), " ");
  return next.replace(/\s+/g, " ").trim();
}

export function matchFreeText(input: string, profile: Profile): FreeTextMatch {
  const normalized = normalize(input);
  if (!normalized) return { kind: "fallback" };

  const categoryHit = getCategories().find((c) => normalize(c.name) === normalized);
  if (categoryHit) return { kind: "category", category: categoryHit };

  const candidates = catalog.questions.filter((q) => isShippable(q) && matchesProgrammeContext(q, profile));
  let best: { question: Question; score: number } | null = null;

  for (const question of candidates) {
    const qNorm = normalize(question.question);
    const qBare = stripProgrammeName(question.question, profile, question);
    const qTokens = tokens(question.question);
    const inTokens = tokens(input);
    if (inTokens.length === 0) continue;

    let score = 0;
    if (normalized === qNorm) score = 100;
    else if (normalized === qBare) score = 92;
    else if (qNorm.includes(normalized) && normalized.length >= 8) score = 80;
    else if (qBare && qBare.includes(normalized) && normalized.length >= 6) score = 78;
    else {
      const overlap = inTokens.filter((t) => qTokens.includes(t)).length;
      if (overlap === 0) continue;
      const coverage = overlap / inTokens.length;
      if (inTokens.length === 1 && overlap === 1 && inTokens[0] && inTokens[0].length >= 6) {
        score = 60;
      } else if (coverage >= 0.6 && overlap >= 2) {
        score = 50 + coverage * 20;
      } else {
        continue;
      }
    }

    if (question.contentType === "Programme Specific") score += 4;
    if (!best || score > best.score) best = { question, score };
  }

  if (best && best.score >= 60) return { kind: "question", question: best.question };
  return { kind: "fallback" };
}

export function getCounsellorCta(): CTA {
  const listed = catalog.ctas.find((c) => c.label === COUNSELLOR_CTA_LABEL);
  const rawUrl = listed?.destinationUrl ?? null;
  return {
    id: listed?.id ?? "CTA03",
    label: COUNSELLOR_CTA_LABEL,
    url: isHttpUrl(rawUrl) ? rawUrl : null,
  };
}
