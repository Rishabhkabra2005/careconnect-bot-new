import { NlpManager } from "node-nlp";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Generic words — never route a department on these alone
// ---------------------------------------------------------------------------
const GENERIC_WORDS = new Set([
  "pain",
  "ache",
  "aching",
  "feel",
  "feeling",
  "severe",
  "bad",
  "hurt",
  "hurts",
  "hurting",
  "really",
  "very",
  "much",
  "lot",
  "some",
  "getting",
  "worse",
  "since",
  "days",
  "day",
  "week",
  "weeks",
  "problem",
  "issues",
  "issue",
  "symptom",
  "symptoms",
  "help",
  "need",
  "having",
  "have",
  "has",
  "had",
  "been",
  "today",
  "yesterday",
  "my",
  "me",
  "i",
  "am",
  "is",
  "are",
  "was",
  "the",
  "a",
  "an",
  "and",
  "or",
  "for",
  "with",
  "about",
  "brother",
  "sister",
  "mother",
  "father",
  "parent",
  "parents",
  "family",
]);

// Pediatrics ONLY when one of these appears as its own word
const CHILD_TRIGGER_WORDS = [
  "baby",
  "child",
  "children",
  "kid",
  "kids",
  "toddler",
  "infant",
  "son",
  "daughter",
  "newborn",
  "pediatric",
];
const CHILD_TRIGGER_TYPOS = ["babby", "childern", "infnat", "todler", "newbron"];

// ---------------------------------------------------------------------------
// Department rules (priority order)
// ---------------------------------------------------------------------------
type DepartmentRule = {
  intent: string;
  keywords: string[];
  typos: string[];
  answer: string;
  /** Only match when a child-trigger word is present in the message */
  childOnly?: boolean;
};

const DEPARTMENT_RULES: DepartmentRule[] = [
  {
    intent: "triage.gastroenterology",
    keywords: [
      "stomach",
      "acidity",
      "acid",
      "heartburn",
      "reflux",
      "nausea",
      "vomit",
      "vomiting",
      "gas",
      "indigestion",
      "belly",
      "abdomen",
      "abdominal",
      "diarrhea",
      "constipation",
      "bloating",
    ],
    typos: ["stomak", "acidty", "stomachh", "gass", "heartbrn"],
    answer:
      "A Gastroenterology consultation is recommended for digestive symptoms like these. A gastroenterologist can assess your GI health and plan treatment.",
  },
  {
    intent: "triage.cardiology",
    keywords: ["chest", "heart", "cardio", "cardiac", "palpitation", "palpitations", "heartbeat"],
    typos: ["chestt", "chset", "haert", "hert", "palpitaton"],
    answer:
      "Based on what you shared, a Cardiology consultation would be appropriate. A cardiologist can evaluate your symptoms and guide the next steps.",
  },
  {
    intent: "triage.dermatology",
    keywords: ["skin", "rash", "itch", "itchy", "spots", "pimple", "acne", "eczema", "hives", "mole"],
    typos: ["skinn", "rashe", "itche"],
    answer:
      "A Dermatology appointment would be appropriate. A dermatologist can evaluate skin changes and recommend safe and effective treatment options.",
  },
  {
    intent: "triage.pulmonology",
    keywords: ["cough", "coughing", "breath", "breathless", "breathing", "lung", "lungs", "wheezing", "wheeze", "asthma"],
    typos: ["coug", "breth", "wheez"],
    answer:
      "A Pulmonology evaluation is recommended for breathing-related symptoms. A pulmonologist can assess lung function and guide further care.",
  },
  {
    intent: "triage.neurology",
    keywords: ["headache", "dizzy", "dizziness", "migraine", "brain", "faint", "fainting", "paralysis", "seizure", "vertigo"],
    typos: ["headak", "migrain", "dizz", "seizur"],
    answer:
      "These symptoms fit a Neurology evaluation. I recommend seeing a neurologist for a focused assessment and appropriate testing.",
  },
  {
    intent: "triage.orthopedics",
    keywords: ["bone", "fracture", "joint", "knee", "backache", "sprain", "arthritis", "shoulder", "ankle", "wrist"],
    typos: ["frature", "kne", "bonee", "sprainn"],
    answer:
      "An Orthopedics visit would be suitable. An orthopedic specialist can evaluate bones, joints, and soft-tissue injuries and recommend treatment.",
  },
  {
    intent: "triage.ent",
    keywords: ["ear", "nose", "throat", "hearing", "sinus", "tonsil", "earache", "nasal", "nostril"],
    typos: ["eer", "noze", "throte", "earach", "sinuss"],
    answer:
      "These concerns align with an ENT (Ear, Nose, and Throat) specialist. I recommend an ENT consultation for an accurate evaluation and treatment plan.",
  },
  {
    intent: "triage.psychiatry",
    keywords: ["anxiety", "anxious", "depression", "depressed", "panic", "stress", "insomnia", "mental", "mood"],
    typos: ["anxity", "depresion", "panick", "insomia"],
    answer:
      "A Psychiatry consultation may help. A psychiatrist can assess mood and anxiety symptoms and discuss therapy options and, if appropriate, medication.",
  },
  {
    intent: "triage.gynecology",
    keywords: ["period", "menstrual", "menstruation", "pelvic", "ovary", "ovarian", "pcos", "uterus", "vaginal", "menopause"],
    typos: ["menstral", "pelvc"],
    answer:
      "A Gynecology consultation would be appropriate. A gynecologist can evaluate reproductive health symptoms and recommend the right next steps.",
  },
  {
    intent: "triage.ophthalmology",
    keywords: ["eye", "eyes", "vision", "blurry", "blurred", "conjunctivitis", "cataract", "glaucoma"],
    typos: ["vison", "blury", "conjuctivitis"],
    answer:
      "For eye or vision concerns, an Ophthalmology visit is recommended. An ophthalmologist can evaluate eye health and provide appropriate treatment.",
  },
  {
    intent: "triage.pediatrics",
    keywords: CHILD_TRIGGER_WORDS,
    typos: CHILD_TRIGGER_TYPOS,
    childOnly: true,
    answer:
      "For children's health concerns, a Pediatrics consultation is recommended. A pediatrician can assess your child and advise the safest next steps.",
  },
  {
    intent: "triage.general_physician",
    keywords: ["fever", "fatigue", "tired", "weakness", "checkup", "flu", "unwell", "ill", "sick"],
    typos: ["fevr", "fatgue", "checkp"],
    answer:
      "A General Physician is a great first step for broad or unclear symptoms. They can evaluate you and refer you to the right specialist if needed.",
  },
];

// ---------------------------------------------------------------------------
// Text utilities — word-by-word ONLY (no full-sentence substring matching)
// ---------------------------------------------------------------------------
function cleanInput(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/**
 * Compare ONE user token against ONE keyword/typo.
 * Never matches substrings inside other words — exact token equality or fuzzy edit distance only.
 */
function tokenMatchesTarget(token: string, target: string): boolean {
  if (!token || !target) return false;
  if (GENERIC_WORDS.has(token)) return false;

  if (token === target) return true;

  const minLen = Math.min(token.length, target.length);
  const maxLen = Math.max(token.length, target.length);

  if (minLen < 3) return false;

  if (minLen <= 4) {
    return levenshtein(token, target) <= 1;
  }

  return levenshtein(token, target) <= (maxLen <= 6 ? 1 : 2);
}

function wordMatchesDepartment(token: string, dept: DepartmentRule): boolean {
  const allTargets = [...dept.keywords, ...dept.typos];
  return allTargets.some((target) => tokenMatchesTarget(token, target));
}

function messageHasChildWord(words: string[]): boolean {
  const childTargets = [...CHILD_TRIGGER_WORDS, ...CHILD_TRIGGER_TYPOS];
  return words.some((token) => childTargets.some((target) => tokenMatchesTarget(token, target)));
}

/**
 * Tokenized priority scan — each word checked individually against department keywords.
 */
function matchDepartmentByKeywords(cleanedMessage: string): DepartmentRule | null {
  if (!cleanedMessage) return null;

  const words = cleanedMessage.split(/\s+/).filter((w) => w.length > 0);
  const hasChild = messageHasChildWord(words);

  for (const dept of DEPARTMENT_RULES) {
    if (dept.childOnly) {
      if (!hasChild) continue;
      return dept;
    }

    for (const token of words) {
      if (GENERIC_WORDS.has(token)) continue;
      if (wordMatchesDepartment(token, dept)) {
        return dept;
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// NLP training (fallback layer — kept active for presentation)
// ---------------------------------------------------------------------------
let managerPromise: Promise<NlpManager> | null = null;

function getAnswer(intent: string): string {
  return DEPARTMENT_RULES.find((d) => d.intent === intent)!.answer;
}

function trainManager() {
  const manager = new NlpManager({ languages: ["en"], forceNER: true, autoSave: false });

  manager.addDocument("en", "hello", "greetings.hello");
  manager.addDocument("en", "hi", "greetings.hello");
  manager.addDocument("en", "hey", "greetings.hello");
  manager.addDocument("en", "good morning", "greetings.hello");
  manager.addDocument("en", "good afternoon", "greetings.hello");
  manager.addAnswer(
    "en",
    "greetings.hello",
    "Hello! Welcome to CareConnect Health. How can I help you today?"
  );

  manager.addDocument("en", "what are your hospital hours", "faq.hours");
  manager.addDocument("en", "when are you open", "faq.hours");
  manager.addDocument("en", "what time do you close", "faq.hours");
  manager.addDocument("en", "hours", "faq.hours");
  manager.addAnswer(
    "en",
    "faq.hours",
    "Our Emergency Department is open 24/7. Regular outpatient services operate from 9 AM to 6 PM."
  );

  manager.addDocument("en", "where are you located", "faq.location");
  manager.addDocument("en", "what is your address", "faq.location");
  manager.addDocument("en", "how do I get to the hospital", "faq.location");
  manager.addDocument("en", "location", "faq.location");
  manager.addAnswer("en", "faq.location", "We are located at 123 Health Ave.");

  manager.addDocument("en", "how much does a consultation cost", "faq.costs");
  manager.addDocument("en", "what are the consultation fees", "faq.costs");
  manager.addDocument("en", "how much do you charge", "faq.costs");
  manager.addDocument("en", "cost", "faq.costs");
  manager.addAnswer(
    "en",
    "faq.costs",
    "Consultation costs start at $50, depending on the specialist and services required."
  );

  manager.addDocument("en", "I have chest pain when I walk up stairs.", "triage.cardiology");
  manager.addDocument("en", "My heart is racing and I feel short of breath.", "triage.cardiology");
  manager.addDocument("en", "I feel pressure in my chest that comes and goes.", "triage.cardiology");
  manager.addDocument("en", "I get palpitations after drinking coffee.", "triage.cardiology");
  manager.addDocument("en", "My heartbeat feels irregular and it worries me.", "triage.cardiology");
  manager.addAnswer("en", "triage.cardiology", getAnswer("triage.cardiology"));

  manager.addDocument("en", "I have a severe headache that is getting worse.", "triage.neurology");
  manager.addDocument("en", "My hands are tingling and I feel weakness on one side.", "triage.neurology");
  manager.addDocument("en", "I am having frequent dizziness and balance problems.", "triage.neurology");
  manager.addDocument("en", "I keep getting migraines that last all day.", "triage.neurology");
  manager.addDocument("en", "I felt faint and nearly collapsed this morning.", "triage.neurology");
  manager.addAnswer("en", "triage.neurology", getAnswer("triage.neurology"));

  manager.addDocument("en", "My knee hurts and it is swollen after a fall.", "triage.orthopedics");
  manager.addDocument("en", "I have persistent back pain that worsens when I move.", "triage.orthopedics");
  manager.addDocument("en", "My shoulder pain limits my ability to lift my arm.", "triage.orthopedics");
  manager.addDocument("en", "I think I fractured my wrist playing sports.", "triage.orthopedics");
  manager.addDocument("en", "My joint pain is worse in the mornings.", "triage.orthopedics");
  manager.addAnswer("en", "triage.orthopedics", getAnswer("triage.orthopedics"));

  manager.addDocument("en", "My child has a fever and is unusually sleepy today.", "triage.pediatrics");
  manager.addDocument("en", "My baby is coughing a lot and is having trouble feeding.", "triage.pediatrics");
  manager.addDocument("en", "My toddler has been vomiting since last night.", "triage.pediatrics");
  manager.addDocument("en", "My infant is not feeding well and seems weak.", "triage.pediatrics");
  manager.addDocument("en", "My baby has fever and will not stop crying.", "triage.pediatrics");
  manager.addAnswer("en", "triage.pediatrics", getAnswer("triage.pediatrics"));

  manager.addDocument("en", "I have been feeling tired for weeks and I do not know why.", "triage.general_physician");
  manager.addDocument("en", "I have a low-grade fever and body aches since yesterday.", "triage.general_physician");
  manager.addDocument("en", "I need help understanding my symptoms and what to do next.", "triage.general_physician");
  manager.addDocument("en", "My brother has fever and I am worried about him.", "triage.general_physician");
  manager.addDocument("en", "I think I have the flu and need medical advice.", "triage.general_physician");
  manager.addAnswer("en", "triage.general_physician", getAnswer("triage.general_physician"));

  manager.addDocument("en", "I have stomach pain after meals and frequent bloating.", "triage.gastroenterology");
  manager.addDocument("en", "I have persistent heartburn and a sour taste in my mouth.", "triage.gastroenterology");
  manager.addDocument("en", "I have ongoing diarrhea and abdominal cramps.", "triage.gastroenterology");
  manager.addDocument("en", "I suffer from acidity and indigestion every night.", "triage.gastroenterology");
  manager.addDocument("en", "My belly feels bloated and I have a lot of gas.", "triage.gastroenterology");
  manager.addAnswer("en", "triage.gastroenterology", getAnswer("triage.gastroenterology"));

  manager.addDocument("en", "I have an itchy rash that has spread over my arms.", "triage.dermatology");
  manager.addDocument("en", "I noticed a changing mole and I am concerned about it.", "triage.dermatology");
  manager.addDocument("en", "My skin is very dry and inflamed despite using moisturizer.", "triage.dermatology");
  manager.addDocument("en", "I have acne breakouts that are not going away.", "triage.dermatology");
  manager.addDocument("en", "I developed hives after eating something new.", "triage.dermatology");
  manager.addAnswer("en", "triage.dermatology", getAnswer("triage.dermatology"));

  manager.addDocument("en", "I have a sore throat and difficulty swallowing for two days.", "triage.ent");
  manager.addDocument("en", "My ear hurts and my hearing feels muffled.", "triage.ent");
  manager.addDocument("en", "my ear hurts", "triage.ent");
  manager.addDocument("en", "I have ongoing sinus pressure and nasal congestion.", "triage.ent");
  manager.addDocument("en", "My nose is blocked and my throat feels sore.", "triage.ent");
  manager.addAnswer("en", "triage.ent", getAnswer("triage.ent"));

  manager.addDocument("en", "I have been feeling anxious every day and it is affecting my sleep.", "triage.psychiatry");
  manager.addDocument("en", "I feel persistently sad and have lost interest in things I enjoy.", "triage.psychiatry");
  manager.addDocument("en", "I am having panic episodes and I do not know how to manage them.", "triage.psychiatry");
  manager.addDocument("en", "I cannot sleep at night due to stress and worry.", "triage.psychiatry");
  manager.addDocument("en", "I feel depressed and unmotivated for several weeks.", "triage.psychiatry");
  manager.addAnswer("en", "triage.psychiatry", getAnswer("triage.psychiatry"));

  manager.addDocument("en", "I have a persistent cough and shortness of breath at night.", "triage.pulmonology");
  manager.addDocument("en", "I feel tightness in my chest and wheeze when I breathe.", "triage.pulmonology");
  manager.addDocument("en", "I get breathless with minor activity and it is worsening.", "triage.pulmonology");
  manager.addDocument("en", "My asthma has been flaring up for the past week.", "triage.pulmonology");
  manager.addDocument("en", "I have a chronic cough that will not go away.", "triage.pulmonology");
  manager.addAnswer("en", "triage.pulmonology", getAnswer("triage.pulmonology"));

  manager.addDocument("en", "I have irregular periods and pelvic pain that concerns me.", "triage.gynecology");
  manager.addDocument("en", "I have unusual vaginal discharge and discomfort.", "triage.gynecology");
  manager.addDocument("en", "I have severe menstrual cramps that interfere with daily activities.", "triage.gynecology");
  manager.addDocument("en", "I think I may have PCOS and need a specialist opinion.", "triage.gynecology");
  manager.addDocument("en", "I have pelvic pain during my menstrual cycle.", "triage.gynecology");
  manager.addAnswer("en", "triage.gynecology", getAnswer("triage.gynecology"));

  manager.addDocument("en", "My vision is blurry and I have trouble focusing on text.", "triage.ophthalmology");
  manager.addDocument("en", "I have eye pain and sensitivity to light since this morning.", "triage.ophthalmology");
  manager.addDocument("en", "My eyes are red and watery and it is not improving.", "triage.ophthalmology");
  manager.addDocument("en", "I think I have conjunctivitis in both eyes.", "triage.ophthalmology");
  manager.addDocument("en", "My eyesight has been getting worse over the past month.", "triage.ophthalmology");
  manager.addAnswer("en", "triage.ophthalmology", getAnswer("triage.ophthalmology"));

  manager.addAnswer(
    "en",
    "None",
    "I'm sorry—I didn't quite understand that. Could you rephrase your question or describe your symptoms in a bit more detail?"
  );

  return manager.train().then(() => manager);
}

async function getManager() {
  if (!managerPromise) {
    managerPromise = trainManager();
  }
  return managerPromise;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
type ChatRequestBody = {
  message?: string;
};

export async function POST(request: Request) {
  try {
    const { message } = (await request.json()) as ChatRequestBody;
    const text = message?.trim();

    if (!text) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    const cleanedMessage = cleanInput(text);

    const keywordMatch = matchDepartmentByKeywords(cleanedMessage);
    if (keywordMatch) {
      return NextResponse.json({
        answer: keywordMatch.answer,
        intent: keywordMatch.intent,
        score: 1,
        source: "keyword",
      });
    }

    const manager = await getManager();
    const result = await manager.process("en", text);
    const answer =
      result.answer ||
      "I'm sorry—I didn't quite understand that. Could you rephrase your question or describe your symptoms in a bit more detail?";

    return NextResponse.json({
      answer,
      intent: result.intent,
      score: result.score,
      source: "nlp",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to process the message.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
