export type CourseType = "UG" | "PG" | "BOTH";

export type ContentType = "Placeholder" | "Generic" | "Dynamic" | "Programme Specific";

export type ProgramKey = "undergraduate" | "postgraduate" | "doctoral" | "online" | "unsure";

export type Profile = {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  courseType: "UG" | "PG" | null;
  programmeId: string | null;
  programmeName: string | null;
  role: "student" | "parent" | null;
  program: ProgramKey | null;
  programLabel: string | null;
  specialization: string | null;
  lastTopic: string | null;
  lastCategoryId: string | null;
  lastQuestionId: string | null;
  profileCompleted: boolean;
};

export type Category = {
  id: string;
  name: string;
  displayOrder: number;
  description: string;
  active: boolean;
};

export type Programme = {
  id: string;
  name: string;
  courseType: CourseType;
  school: string;
  active: boolean;
  placeholder: boolean;
};

export type Question = {
  id: string;
  categoryId: string;
  courseType: CourseType;
  programmeId: string | null;
  programmeName: string | null;
  question: string;
  approvedAnswer: string | null;
  sourceUrl: string | null;
  sourceLabel: string | null;
  relatedQuestionIds: string[];
  ctaLabel: string | null;
  ctaUrl: string | null;
  displayOrder: number;
  active: boolean;
  contentType: ContentType;
};

export type CTA = {
  id: string;
  label: string;
  url: string | null;
};

export type Answer = {
  questionId: string;
  text: string;
  sourceUrl: string | null;
  sourceLabel: string | null;
  cta: CTA | null;
};

export type RelatedQuestionLink = {
  parentQuestionId: string;
  relatedQuestionId: string;
  priority: number;
  programmeContext: string | null;
  active: boolean;
};

export type Message = {
  id: number;
  role: "bot" | "user";
  text: string;
  sourceUrl?: string;
  sourceLabel?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  editStep?: string;
};

export type Session = {
  profile: Profile;
  messages: Message[];
  selectedCategoryId: string | null;
  selectedQuestionId: string | null;
};

export type CatalogCta = {
  id: string;
  label: string;
  purpose: string;
  destinationUrl: string;
  applicableCategory: string;
  applicableProgramme: string;
  active: boolean;
};

export type ChatbotCatalog = {
  categories: Category[];
  programmes: Programme[];
  questions: Question[];
  relatedQuestions: RelatedQuestionLink[];
  ctas: CatalogCta[];
};

export type FreeTextMatch =
  | { kind: "question"; question: Question }
  | { kind: "category"; category: Category }
  | { kind: "fallback" };
