import { NlpManager } from "node-nlp";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // ===========================================================================
  // Types (request-scoped only — no module-level state)
  // ===========================================================================
  type ChatMessage = { role: "user" | "assistant"; content: string };
  type LlmSeverity = "mild" | "severe" | "ambiguous";
  type SentimentLabel = "worried" | "uncomfortable" | "distressed" | "concerned";
  type ClarificationKind = "severity" | "unknown_symptom";
  type TargetDepartment =
    | "Dermatology"
    | "Cardiology"
    | "Gastroenterology"
    | "Orthopedics"
    | "Ophthalmology"
    | "Neurology"
    | "Urology"
    | "ENT"
    | "Pulmonology"
    | "General Physician"
    | "Pediatrics"
    | "CLARIFICATION_REQUIRED";

  type GateBCategory =
    | "musculoskeletal"
    | "cramps"
    | "stomach"
    | "vomiting"
    | "respiratory"
    | "headache"
    | "fever";

  type GateBContext = { category: GateBCategory; label: string };

  type TriageResult = {
    gate: "A" | "B" | "B-chronic" | "cold" | "fallback";
    clarification_kind?: ClarificationKind;
    extracted_symptom: string;
    severity: LlmSeverity;
    sentiment: SentimentLabel;
    target_department: TargetDepartment;
    empathetic_response: string;
  };

  type DurationTier = "chronic" | "acute" | "none";

  // ===========================================================================
  // Typo map & constants
  // ===========================================================================
  const TYPO_MAP: Record<string, string> = {
    frasctreu: "fracture",
    frature: "fracture",
    bak: "back",
    lig: "leg",
    sholder: "shoulder",
    hedake: "headache",
    hedache: "headache",
    pimpl: "pimple",
    pimplt: "pimple",
    rashe: "rash",
    alergie: "allergy",
    alergy: "allergy",
    iching: "itching",
    skinn: "skin",
    urn: "urine",
    urinn: "urine",
    kidny: "kidney",
    bladr: "bladder",
    svere: "severe",
    mil: "mild",
    mld: "mild",
    svr: "severe",
    sevr: "severe",
    sevear: "severe",
    ahving: "having",
    hert: "heart",
    haert: "heart",
    eyee: "eye",
    noze: "nose",
    eer: "ear",
    throte: "throat",
    stomak: "stomach",
    acidty: "acidity",
    mils: "mild",
    midl: "mild",
    norml: "normal",
    fevr: "fever",
    vomitting: "vomiting",
    vomitng: "vomiting",
    nausia: "nausea",
    couhg: "cough",
    breth: "breath",
    palpitaton: "palpitation",
    vison: "vision",
    blury: "blurry",
    muslce: "muscle",
    muslces: "muscles",
    crampe: "cramp",
  };

  const PHRASE_TYPO_REPLACEMENTS: Array<[RegExp, string]> = [
    [/cant\s+se\s+far/gi, "can't see far"],
    [/cant\s+see\s+far/gi, "can't see far"],
  ];

  const FILLER_PATTERN = /\b(issues?|problems?|trouble|concerns?)\b/gi;
  const MILD_WORDS = ["mild", "mil", "mld", "normal", "light", "slight", "manageable", "low-grade"];
  const SEVERE_WORDS = [
    "severe",
    "svr",
    "sevr",
    "sevear",
    "unbearable",
    "intense",
    "sharp",
    "chronic",
    "high fever",
    "worst",
    "emergency",
  ];
  const DISTRESS_WORDS = ["scared", "afraid", "terrified", "panic", "can't breathe", "help", "emergency", "dying"];

  const UNKNOWN_SYMPTOM_PATTERNS = [
    /^symptoms?\.?$/i,
    /^i feel weird\.?$/i,
    /^feel weird\.?$/i,
    /^i am not feeling well\.?$/i,
    /^not feeling well\.?$/i,
    /^something is wrong\.?$/i,
    /^i need help\.?$/i,
    /^help me\.?$/i,
    /^medical help\.?$/i,
  ];

  const ALLOWED_DEPARTMENTS: TargetDepartment[] = [
    "Dermatology",
    "Cardiology",
    "Gastroenterology",
    "Orthopedics",
    "Ophthalmology",
    "Neurology",
    "Urology",
    "ENT",
    "Pulmonology",
    "General Physician",
    "Pediatrics",
    "CLARIFICATION_REQUIRED",
  ];

  const UNKNOWN_SYMPTOM_RESPONSE =
    "I understand you are seeking medical guidance. I couldn't quite identify your specific symptom from your message. Could you please tell me which part of your body is affected or describe what you are feeling in more detail so I can guide you to the right department?";

  const NLP_ANSWERS: Record<string, string> = {
    "greetings.hello": "Hello! Welcome to CareConnect Health. How can I help you today?",
    "faq.hours":
      "Our Emergency Department is open 24/7. Regular outpatient services operate from 9 AM to 6 PM.",
    "faq.location": "We are located at 123 Health Ave.",
    "faq.costs": "Consultation costs start at $50, depending on the specialist and services required.",
    "triage.cardiology": "Based on what you shared, a Cardiology consultation would be appropriate.",
    "triage.gastroenterology":
      "A Gastroenterology consultation is recommended for digestive symptoms like these.",
    "triage.ophthalmology": "For eye or vision concerns, an Ophthalmology visit is recommended.",
    "triage.dermatology": "A Dermatology appointment would be appropriate for skin symptoms.",
    "triage.orthopedics": "An Orthopedics visit would be suitable for bone and joint concerns.",
    "triage.neurology": "A Neurology evaluation is recommended for these nervous-system symptoms.",
    "triage.urology": "A Urology consultation is appropriate for kidney and urinary symptoms.",
    "triage.ent": "An ENT specialist can evaluate ear, nose, and throat symptoms.",
    "triage.pulmonology": "A Pulmonology evaluation is recommended for breathing-related symptoms.",
    "triage.pediatrics": "A Pediatrics consultation is recommended for your child's symptoms.",
    "triage.general_physician":
      "A General Physician is a great first step for broad or mild systemic symptoms.",
    None: "I'm sorry—I didn't quite understand that. Could you describe your symptoms in more detail?",
  };

  const nlpAnswer = (intent: string): string => NLP_ANSWERS[intent] ?? NLP_ANSWERS.None;

  // ===========================================================================
  // Text utilities
  // ===========================================================================
  const containsAny = (text: string, needles: string[]): boolean =>
    needles.some((n) => text.includes(n));

  const hasWord = (text: string, word: string): boolean =>
    new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text);

  const normalizeTypos = (text: string): string => {
    let out = text.toLowerCase();
    const sortedKeys = Object.keys(TYPO_MAP).sort((a, b) => b.length - a.length);
    for (const wrong of sortedKeys) {
      const correct = TYPO_MAP[wrong];
      out = out.replace(new RegExp(`\\b${wrong}\\b`, "gi"), correct);
    }
    return out;
  };

  const normalizeMessage = (text: string): string => {
    let out = normalizeTypos(text.trim());
    for (const [pattern, replacement] of PHRASE_TYPO_REPLACEMENTS) {
      out = out.replace(pattern, replacement);
    }
    out = out.replace(FILLER_PATTERN, "pain");
    if (/\bstomach\b/.test(out) && !/\b(pain|ache|burn|acid|discomfort)\b/.test(out)) {
      out = out.replace(/\bstomach\b/, "stomach pain");
    }
    return out;
  };

  const isTargetDepartment = (value: string): value is TargetDepartment =>
    ALLOWED_DEPARTMENTS.includes(value as TargetDepartment);

  const hasMild = (text: string): boolean => containsAny(normalizeMessage(text), MILD_WORDS);
  const hasSevere = (text: string): boolean => containsAny(normalizeMessage(text), SEVERE_WORDS);

  const detectSentiment = (text: string, isSevere: boolean): SentimentLabel => {
    if (containsAny(text, DISTRESS_WORDS) || isSevere) return "distressed";
    if (containsAny(text, ["worried", "anxious", "nervous"])) return "worried";
    if (containsAny(text, ["uncomfortable", "hurts", "aching", "sore"])) return "uncomfortable";
    return "concerned";
  };

  const buildSeverityClarification = (sentiment: SentimentLabel, symptomLabel: string): string =>
    `I understand you're feeling ${sentiment === "distressed" ? "distressed" : sentiment === "worried" ? "worried" : sentiment === "uncomfortable" ? "uncomfortable" : "concerned"} about your ${symptomLabel}. I see you're experiencing ${symptomLabel}. Is this mild/manageable or is it severe?`;

  const buildRoutedResponse = (
    sentiment: SentimentLabel,
    symptomLabel: string,
    department: TargetDepartment
  ): string => {
    const feeling =
      sentiment === "distressed"
        ? "distressed"
        : sentiment === "worried"
          ? "worried"
          : sentiment === "uncomfortable"
            ? "uncomfortable"
            : "concerned";
    if (department === "General Physician") {
      return `I understand you're feeling ${feeling} about your ${symptomLabel}. Based on what you've shared, I recommend consulting a General Physician for an initial evaluation.`;
    }
    return `I understand you're feeling ${feeling} about your ${symptomLabel}. Based on your symptoms, I recommend consulting a specialist in ${department} immediately.`;
  };

  const isDurationTimelineTurn = (text: string): boolean => {
    const t = normalizeMessage(text.trim());
    if (!t) return false;
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length > 4) return false;
    if (/\b\d+\s*days?\b/.test(t)) return true;
    if (/\b\d+\s*weeks?\b/.test(t)) return true;
    if (containsAny(t, ["week", "weeks", "month", "months", "chronic"])) return true;
    if (words.length <= 3 && /\bdays?\b/.test(t)) return true;
    return false;
  };

  const isSeverityOnlyTurn = (latest: string): boolean => {
    const t = normalizeMessage(latest.trim());
    if (!t) return false;
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length > 4) return false;
    return hasMild(t) || hasSevere(t) || isDurationTimelineTurn(latest);
  };

  const isUnknownGenericInput = (latest: string): boolean => {
    const raw = latest.trim().toLowerCase();
    const normalized = normalizeMessage(raw);

    if (isSeverityOnlyTurn(raw)) return false;
    if (matchesCommonCold(normalized)) return false;

    if (UNKNOWN_SYMPTOM_PATTERNS.some((re) => re.test(raw))) return true;
    if (normalized.length < 4 && !isSeverityOnlyTurn(normalized)) return true;
    if (containsAny(raw, ["symptom", "weird", "unwell", "uncomfortable"]) && raw.split(/\s+/).length <= 5) {
      if (!containsAny(normalizeMessage(raw), [
        "pain",
        "ache",
        "fever",
        "cough",
        "vomit",
        "rash",
        "heart",
        "eye",
        "stomach",
        "headache",
        "muscle",
        "joint",
        "fracture",
        "nose",
        "ear",
        "throat",
        "sinus",
        "cold",
        "cramp",
        "cramps",
        "see far",
        "near objects",
      ])) {
        return true;
      }
    }
    return false;
  };

  // ===========================================================================
  // Duration scanning (chronic >5 days vs acute <=4 days)
  // ===========================================================================
  const detectDurationTier = (text: string): DurationTier => {
    const t = normalizeMessage(text);

    if (
      containsAny(t, [
        "month",
        "months",
        "week",
        "weeks",
        "chronic",
        "long time",
        "for a while",
        "for ages",
        "persistent",
        "ongoing",
      ])
    ) {
      return "chronic";
    }

    const dayMatches = [...t.matchAll(/\b(\d+)\s*days?\b/g)];
    for (const match of dayMatches) {
      const days = parseInt(match[1], 10);
      if (days >= 5) return "chronic";
      if (days >= 1 && days <= 4) return "acute";
    }

    const weekMatches = [...t.matchAll(/\b(\d+)\s*weeks?\b/g)];
    for (const match of weekMatches) {
      const weeks = parseInt(match[1], 10);
      if (weeks >= 1) return "chronic";
    }

    return "none";
  };

  const getGateBContextText = (
    latestNormalized: string,
    conversationMessages: ChatMessage[]
  ): string => {
    if (detectGateBSymptom(latestNormalized)) return latestNormalized;

    const priorUserTurns = conversationMessages
      .slice(0, -1)
      .filter((m) => m.role === "user")
      .map((m) => normalizeMessage(m.content))
      .reverse();

    for (const turn of priorUserTurns) {
      if (isSeverityOnlyTurn(turn)) continue;
      if (detectGateBSymptom(turn)) return `${turn} ${latestNormalized}`;
    }

    return latestNormalized;
  };

  const resolveDurationTier = (
    latestNormalized: string,
    conversationMessages: ChatMessage[]
  ): DurationTier => {
    const contextText = getGateBContextText(latestNormalized, conversationMessages);
    return detectDurationTier(contextText);
  };

  // ===========================================================================
  // Common cold — direct General Physician (no Gate B questions)
  // ===========================================================================
  const matchesCommonCold = (t: string): boolean => {
    if (containsAny(t, ["common cold"])) return true;
    if (/\b(i\s+)?(have|has|having|got|catch|caught|with)\s+(a\s+)?cold\b/.test(t)) return true;
    if (hasWord(t, "cold") && containsAny(t, ["runny", "sniffle", "sneeze", "congestion", "viral"])) {
      return true;
    }
    if (/^(i\s+)?(have\s+)?(a\s+)?cold\.?$/i.test(t.trim())) return true;
    return false;
  };

  const runCommonColdRoute = (latestNormalized: string): TriageResult => {
    const sentiment = detectSentiment(latestNormalized, false);
    return {
      gate: "cold",
      extracted_symptom: "common cold",
      severity: "mild",
      sentiment,
      target_department: "General Physician",
      empathetic_response: buildRoutedResponse(sentiment, "common cold", "General Physician"),
    };
  };

  const matchesVisionRangeIssue = (t: string): boolean =>
    containsAny(t, [
      "can't see far",
      "cant see far",
      "see far objects",
      "see far object",
      "far objects",
      "blurry far",
      "blur far",
      "near objects",
      "near object",
      "can't see near",
      "cant see near",
      "distance vision",
      "far away",
      "far clearly",
      "objects clearly",
    ]) ||
    (containsAny(t, ["see", "seeing", "vision"]) && containsAny(t, ["far", "distance"])) ||
    (containsAny(t, ["blurry", "blur", "blurred"]) && containsAny(t, ["far", "near"]));

  const buildCrampsClarification = (sentiment: SentimentLabel, symptomLabel: string): string =>
    `I understand you're feeling ${sentiment === "distressed" ? "distressed" : sentiment === "worried" ? "worried" : sentiment === "uncomfortable" ? "uncomfortable" : "concerned"} about your ${symptomLabel}. I see you're experiencing ${symptomLabel}. Is the pain mild or severe, and how long have you had this (for example, 2 days or 1 week)?`;

  // ===========================================================================
  // GATE A — Strict specialist bypass (latest turn only)
  // ===========================================================================
  const matchesGateA = (t: string): TriageResult | null => {
    if (
      containsAny(t, [
        "heart",
        "chest",
        "palpitation",
        "palpitations",
        "cardiac",
        "heartbeat",
        "chest pain",
      ])
    ) {
      const sentiment = detectSentiment(t, hasSevere(t));
      return {
        gate: "A",
        extracted_symptom: "heart/chest symptoms",
        severity: "severe",
        sentiment,
        target_department: "Cardiology",
        empathetic_response: buildRoutedResponse(sentiment, "heart/chest symptoms", "Cardiology"),
      };
    }

    if (
      matchesVisionRangeIssue(t) ||
      containsAny(t, [
        "eye",
        "eyes",
        "vision",
        "blurry",
        "blurred",
        "sight",
        "blind",
        "blindness",
      ])
    ) {
      const sentiment = detectSentiment(t, hasSevere(t));
      const visionLabel = matchesVisionRangeIssue(t)
        ? "distance or near vision difficulty"
        : "eye/vision symptoms";
      return {
        gate: "A",
        extracted_symptom: visionLabel,
        severity: "severe",
        sentiment,
        target_department: "Ophthalmology",
        empathetic_response: buildRoutedResponse(sentiment, visionLabel, "Ophthalmology"),
      };
    }

    if (
      containsAny(t, [
        "fracture",
        "dislocation",
        "dislocated",
        "joint pain",
        "joints pain",
        "joints ache",
      ]) ||
      (containsAny(t, ["joint", "joints"]) && containsAny(t, ["pain", "ache", "hurt"]))
    ) {
      const sentiment = detectSentiment(t, true);
      return {
        gate: "A",
        extracted_symptom: "joint or fracture symptoms",
        severity: "severe",
        sentiment,
        target_department: "Orthopedics",
        empathetic_response: buildRoutedResponse(sentiment, "joint or fracture symptoms", "Orthopedics"),
      };
    }

    if (
      containsAny(t, [
        "skin",
        "rash",
        "rashes",
        "itch",
        "itching",
        "eczema",
        "pimple",
        "acne",
        "hives",
        "allergy",
        "allergies",
      ])
    ) {
      const sentiment = detectSentiment(t, hasSevere(t));
      return {
        gate: "A",
        extracted_symptom: "skin or allergy symptoms",
        severity: "severe",
        sentiment,
        target_department: "Dermatology",
        empathetic_response: buildRoutedResponse(sentiment, "skin or allergy symptoms", "Dermatology"),
      };
    }

    if (
      containsAny(t, ["kidney pain", "kidney"]) ||
      containsAny(t, ["bladder"]) ||
      containsAny(t, ["burning urine", "burns when i urinate", "burns when i pee"]) ||
      (containsAny(t, ["urine", "urinary", "urinate"]) && containsAny(t, ["burn", "burning", "pain"]))
    ) {
      const sentiment = detectSentiment(t, hasSevere(t));
      return {
        gate: "A",
        extracted_symptom: "kidney or urinary symptoms",
        severity: "severe",
        sentiment,
        target_department: "Urology",
        empathetic_response: buildRoutedResponse(sentiment, "kidney or urinary symptoms", "Urology"),
      };
    }

    if (containsAny(t, ["paralysis", "seizure", "numbness", "sudden numb", "stroke", "convulsion"])) {
      const sentiment = detectSentiment(t, true);
      return {
        gate: "A",
        extracted_symptom: "neurological symptoms",
        severity: "severe",
        sentiment,
        target_department: "Neurology",
        empathetic_response: buildRoutedResponse(sentiment, "neurological symptoms", "Neurology"),
      };
    }

    if (
      hasWord(t, "nose") ||
      hasWord(t, "ear") ||
      containsAny(t, ["ear pain", "earache", "sore throat", "sinus", "nostril", "tonsil", "nasal"]) ||
      (hasWord(t, "throat") && containsAny(t, ["pain", "ache", "sore", "hurt"]))
    ) {
      const sentiment = detectSentiment(t, hasSevere(t));
      const entLabel = containsAny(t, ["nose", "nostril", "sinus", "nasal"])
        ? "nose or sinus symptoms"
        : hasWord(t, "ear") || containsAny(t, ["earache", "ear pain"])
          ? "ear symptoms"
          : "throat symptoms";
      return {
        gate: "A",
        extracted_symptom: entLabel,
        severity: "severe",
        sentiment,
        target_department: "ENT",
        empathetic_response: buildRoutedResponse(sentiment, entLabel, "ENT"),
      };
    }

    return null;
  };

  // ===========================================================================
  // GATE B — Interactive musculoskeletal / systemic (NOT joints/fractures)
  // ===========================================================================
  const detectGateBSymptom = (text: string): GateBContext | null => {
    const t = normalizeMessage(text);
    if (!t) return null;

    if (containsAny(t, ["cramp", "cramps", "cramping"])) {
      if (containsAny(t, ["leg", "legs"])) {
        return { category: "cramps", label: "leg cramps" };
      }
      if (containsAny(t, ["muscle", "muscles"])) {
        return { category: "cramps", label: "muscle cramps" };
      }
      if (containsAny(t, ["arm", "hand", "foot", "feet", "back", "neck"])) {
        return { category: "cramps", label: "muscle cramps" };
      }
      return { category: "cramps", label: "cramps" };
    }

    if (
      containsAny(t, [
        "back pain",
        "leg pain",
        "hand pain",
        "arm pain",
        "shoulder pain",
        "neck pain",
        "body ache",
        "muscle pain",
        "muscle ache",
        "muscles ache",
        "body pain",
      ]) ||
      (containsAny(t, ["back", "leg", "hand", "arm", "shoulder", "neck"]) &&
        containsAny(t, ["pain", "ache", "hurt", "sore"])) ||
      containsAny(t, ["muscle", "muscles"])
    ) {
      if (containsAny(t, ["muscle", "muscles"])) {
        return { category: "musculoskeletal", label: "muscle pain" };
      }
      if (containsAny(t, ["back"])) return { category: "musculoskeletal", label: "back pain" };
      if (containsAny(t, ["leg"])) return { category: "musculoskeletal", label: "leg pain" };
      if (containsAny(t, ["hand", "arm"])) return { category: "musculoskeletal", label: "hand or arm pain" };
      if (containsAny(t, ["shoulder"])) return { category: "musculoskeletal", label: "shoulder pain" };
      if (containsAny(t, ["neck"])) return { category: "musculoskeletal", label: "neck pain" };
      return { category: "musculoskeletal", label: "musculoskeletal ache" };
    }

    if (
      containsAny(t, [
        "stomach",
        "belly",
        "abdomen",
        "abdominal",
        "acidity",
        "acid",
        "heartburn",
        "indigestion",
      ])
    ) {
      return { category: "stomach", label: "stomach discomfort" };
    }

    if (containsAny(t, ["vomit", "vomiting", "nausea", "throwing up"])) {
      return { category: "vomiting", label: "vomiting or nausea" };
    }

    if (
      containsAny(t, [
        "cough",
        "breath",
        "breathing",
        "breathless",
        "wheeze",
        "wheezing",
        "congestion",
        "lung",
        "asthma",
      ])
    ) {
      return { category: "respiratory", label: "breathing difficulty" };
    }

    if (containsAny(t, ["headache", "migraine"])) {
      return { category: "headache", label: "headache" };
    }

    if (containsAny(t, ["fever", "chills", "temperature", "febrile"])) {
      return { category: "fever", label: "fever" };
    }

    return null;
  };

  const findGateBSymptomInHistory = (conversationMessages: ChatMessage[]): GateBContext | null => {
    const priorUserTurns = conversationMessages
      .slice(0, -1)
      .filter((m) => m.role === "user")
      .map((m) => normalizeMessage(m.content))
      .reverse();

    for (const turn of priorUserTurns) {
      if (isSeverityOnlyTurn(turn)) continue;
      const hit = detectGateBSymptom(turn);
      if (hit) return hit;
    }
    return null;
  };

  const resolveGateBContext = (
    latestNormalized: string,
    conversationMessages: ChatMessage[]
  ): GateBContext | null => {
    const fromLatest = detectGateBSymptom(latestNormalized);
    if (fromLatest) return fromLatest;
    if (
      isSeverityOnlyTurn(latestNormalized) ||
      detectDurationTier(latestNormalized) !== "none"
    ) {
      return findGateBSymptomInHistory(conversationMessages);
    }
    return null;
  };

  const runCrampsMatrix = (
    gateB: GateBContext,
    latestNormalized: string,
    conversationMessages: ChatMessage[],
    sentiment: SentimentLabel
  ): TriageResult => {
    const contextText = getGateBContextText(latestNormalized, conversationMessages);
    const mild = hasMild(contextText);
    const severe = hasSevere(contextText);
    const durationTier = detectDurationTier(contextText);

    if (severe || durationTier === "chronic") {
      return {
        gate: "B-chronic",
        extracted_symptom: gateB.label,
        severity: "severe",
        sentiment,
        target_department: "Orthopedics",
        empathetic_response: buildRoutedResponse(sentiment, gateB.label, "Orthopedics"),
      };
    }

    if (mild && (durationTier === "acute" || durationTier === "none")) {
      return {
        gate: "B",
        extracted_symptom: gateB.label,
        severity: "mild",
        sentiment,
        target_department: "General Physician",
        empathetic_response: buildRoutedResponse(sentiment, gateB.label, "General Physician"),
      };
    }

    if (durationTier === "acute" && !mild && !severe) {
      return {
        gate: "B",
        clarification_kind: "severity",
        extracted_symptom: gateB.label,
        severity: "ambiguous",
        sentiment,
        target_department: "CLARIFICATION_REQUIRED",
        empathetic_response: buildSeverityClarification(sentiment, gateB.label),
      };
    }

    return {
      gate: "B",
      clarification_kind: "severity",
      extracted_symptom: gateB.label,
      severity: "ambiguous",
      sentiment,
      target_department: "CLARIFICATION_REQUIRED",
      empathetic_response: buildCrampsClarification(sentiment, gateB.label),
    };
  };

  const severeDeptForGateB = (category: GateBCategory): TargetDepartment => {
    switch (category) {
      case "musculoskeletal":
      case "cramps":
        return "Orthopedics";
      case "stomach":
      case "vomiting":
        return "Gastroenterology";
      case "respiratory":
        return "Pulmonology";
      case "headache":
        return "Neurology";
      case "fever":
        return "General Physician";
      default:
        return "General Physician";
    }
  };

  const runGateB = (latestNormalized: string, conversationMessages: ChatMessage[]): TriageResult | null => {
    const gateB = resolveGateBContext(latestNormalized, conversationMessages);
    if (!gateB) return null;

    const mild = hasMild(latestNormalized);
    const severe = hasSevere(latestNormalized);
    const durationTier = resolveDurationTier(latestNormalized, conversationMessages);
    const sentiment = detectSentiment(latestNormalized, severe || durationTier === "chronic");

    if (gateB.category === "fever") {
      return {
        gate: "B",
        extracted_symptom: gateB.label,
        severity: "ambiguous",
        sentiment,
        target_department: "General Physician",
        empathetic_response: buildRoutedResponse(sentiment, gateB.label, "General Physician"),
      };
    }

    if (gateB.category === "cramps") {
      return runCrampsMatrix(gateB, latestNormalized, conversationMessages, sentiment);
    }

    // Chronic escalation: >5 days / weeks / months — skip mild/severe question
    if (durationTier === "chronic") {
      const dept = severeDeptForGateB(gateB.category);
      return {
        gate: "B-chronic",
        extracted_symptom: gateB.label,
        severity: "severe",
        sentiment,
        target_department: dept,
        empathetic_response: buildRoutedResponse(sentiment, gateB.label, dept),
      };
    }

    if (mild) {
      return {
        gate: "B",
        extracted_symptom: gateB.label,
        severity: "mild",
        sentiment,
        target_department: "General Physician",
        empathetic_response: buildRoutedResponse(sentiment, gateB.label, "General Physician"),
      };
    }

    if (severe) {
      const dept = severeDeptForGateB(gateB.category);
      return {
        gate: "B",
        extracted_symptom: gateB.label,
        severity: "severe",
        sentiment,
        target_department: dept,
        empathetic_response: buildRoutedResponse(sentiment, gateB.label, dept),
      };
    }

    return {
      gate: "B",
      clarification_kind: "severity",
      extracted_symptom: gateB.label,
      severity: "ambiguous",
      sentiment,
      target_department: "CLARIFICATION_REQUIRED",
      empathetic_response: buildSeverityClarification(sentiment, gateB.label),
    };
  };

  const runUnknownFallback = (latestNormalized: string): TriageResult => {
    const sentiment = detectSentiment(latestNormalized, false);
    return {
      gate: "fallback",
      clarification_kind: "unknown_symptom",
      extracted_symptom: "unspecified",
      severity: "ambiguous",
      sentiment,
      target_department: "CLARIFICATION_REQUIRED",
      empathetic_response: UNKNOWN_SYMPTOM_RESPONSE,
    };
  };

  // ===========================================================================
  // Master triage
  // ===========================================================================
  const runClinicalTriage = (latestRaw: string, conversationMessages: ChatMessage[]): TriageResult => {
    const latest = normalizeMessage(latestRaw);

    if (isSeverityOnlyTurn(latestRaw)) {
      const gateBFromSeverity = runGateB(latest, conversationMessages);
      if (gateBFromSeverity) return gateBFromSeverity;
    }

    if (matchesCommonCold(latest)) {
      return runCommonColdRoute(latest);
    }

    const gateA = matchesGateA(latest);
    if (gateA) return gateA;

    if (!isSeverityOnlyTurn(latestRaw) && isUnknownGenericInput(latestRaw)) {
      return runUnknownFallback(latest);
    }

    const gateB = runGateB(latest, conversationMessages);
    if (gateB) return gateB;

    if (isSeverityOnlyTurn(latest)) {
      const historical = findGateBSymptomInHistory(conversationMessages);
      if (historical) {
        const retry = runGateB(latest, conversationMessages);
        if (retry) return retry;
      }
    }

    return runUnknownFallback(latest);
  };

  // ===========================================================================
  // LLM layer (aligned with gates; code validation wins)
  // ===========================================================================
  const TRIAGE_SYSTEM_PROMPT = `
You are a stateless split clinical triage engine. Apply typo normalization first.

SEVERITY SHORTHAND (valid Gate B follow-up answers after a mild/severe question):
- Mild: mild, mil, mld (typos map to mild)
- Severe: severe, svr, sevr, sevear, svere
Treat these as complete severity replies — use conversation history to find the active Gate B symptom.

TIME-BASED CHRONIC ESCALATION (bypass mild/severe question for Gate B):
- Duration >5 days, or weeks/months/chronic/long time/persistent/ongoing -> route DIRECTLY to specialist:
  * Stomach/vomiting -> Gastroenterology | Muscle/back/leg pain -> Orthopedics
  * Headache -> Neurology | Respiratory -> Pulmonology | Fever -> General Physician
- Duration <=4 days (e.g. 2/3/4 days) or no time mentioned -> normal Gate B mild vs severe flow

COMMON COLD (instant, no questions):
- "cold" or "common cold" (e.g. "I have a cold") -> General Physician immediately

GATE A — STRICT SPECIALIST BYPASS (latest message only; NEVER ask mild/severe; NEVER General Physician):
- Heart/chest/palpitations -> Cardiology
- Eyes/vision/blurry AND vision-range issues -> Ophthalmology instantly:
  * "can't see far", "cant se far" (typos), "see far objects", "blurry far", "near objects"
  * e.g. "Can't see far objects clearly" -> Ophthalmology (no questions)
- Fracture/dislocation/joint pain/joints pain ONLY -> Orthopedics (NOT back pain, leg pain, or muscle pain)
- Skin/rash/allergies/pimples/itching -> Dermatology
- Burning urine/kidney pain/bladder issues -> Urology
- Paralysis/seizure/sudden numbness -> Neurology
- ENT instant bypass: nose/noze, ear/ear pain/earache, throat/sore throat, sinus -> ENT (turn 1, no severity question)

GATE B — INTERACTIVE (ask mild vs severe when ambiguous):
CRAMPS MATRIX (cramps, muscle cramps, leg cramps):
  - Duration <=4 days AND mild -> General Physician | Duration >=5 days OR severe -> Orthopedics
  - Ambiguous (e.g. "cramps in legs" only) -> ask mild/severe AND how long; then apply matrix
Musculoskeletal aches ONLY: back pain, leg pain, hand pain, arm, shoulder, neck, muscle, muscles, body ache
  - Mild (or mil/mld) -> General Physician | Severe (or svr/sevr/sevear) -> Orthopedics
Stomach pain, acidity, nausea, vomiting -> Gastroenterology (severe) or General Physician (mild)
Respiratory: breathing, cough, congestion -> Pulmonology (severe) or General Physician (mild)
Headache, migraine -> Neurology (severe) or General Physician (mild)
Fever/chills -> General Physician directly (no severity question)

When latest is only a severity shorthand (mil, mld, mild, svr, sevr, severe), read conversation history to find the active Gate B symptom (e.g. breathing difficulty, muscle pain).

UNKNOWN / UNMAPPED (e.g. "symptoms", "i feel weird"):
- target_department: CLARIFICATION_REQUIRED
- Do NOT ask mild vs severe. Use exactly:
"I understand you are seeking medical guidance. I couldn't quite identify your specific symptom from your message. Could you please tell me which part of your body is affected or describe what you are feeling in more detail so I can guide you to the right department?"

Return ONLY JSON:
{"extracted_symptom":"string","severity":"mild|severe|ambiguous","sentiment":"worried|uncomfortable|distressed|concerned","target_department":"...","empathetic_response":"string"}
`.trim();

  const extractJsonObject = (text: string): string | null => {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    return text.slice(start, end + 1);
  };

  const classifyWithLLM = async (
    latestMessage: string,
    conversationMessages: ChatMessage[]
  ): Promise<TriageResult> => {
    const deterministic = runClinicalTriage(latestMessage, conversationMessages);

    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    if (!apiKey) return deterministic;

    const historyText = conversationMessages
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n");

    const userPrompt = `
Full conversation (required for mild/severe follow-ups):
${historyText}

LATEST user message:
${latestMessage}

Normalized latest:
${normalizeMessage(latestMessage)}
`.trim();

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: TRIAGE_SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
        }),
      });

      if (!response.ok) return deterministic;

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content || "";
      const jsonString = extractJsonObject(content);
      if (!jsonString) return deterministic;

      const parsed = JSON.parse(jsonString) as Partial<TriageResult & { target_department?: string }>;
      const deptRaw = String(parsed.target_department || "");
      const dept = isTargetDepartment(deptRaw) ? deptRaw : deterministic.target_department;

      const sentiment: SentimentLabel =
        parsed.sentiment === "worried" ||
        parsed.sentiment === "uncomfortable" ||
        parsed.sentiment === "distressed" ||
        parsed.sentiment === "concerned"
          ? parsed.sentiment
          : deterministic.sentiment;

      const llmResult: TriageResult = {
        gate: deterministic.gate,
        clarification_kind: deterministic.clarification_kind,
        extracted_symptom:
          typeof parsed.extracted_symptom === "string" && parsed.extracted_symptom.trim()
            ? parsed.extracted_symptom
            : deterministic.extracted_symptom,
        severity:
          parsed.severity === "mild" || parsed.severity === "severe" || parsed.severity === "ambiguous"
            ? parsed.severity
            : deterministic.severity,
        sentiment,
        target_department: dept,
        empathetic_response:
          typeof parsed.empathetic_response === "string" && parsed.empathetic_response.trim()
            ? parsed.empathetic_response
            : deterministic.empathetic_response,
      };

      const latestNorm = normalizeMessage(latestMessage);
      if (matchesCommonCold(latestNorm)) return runCommonColdRoute(latestNorm);

      const gateAHit = matchesGateA(latestNorm);
      if (gateAHit) return gateAHit;

      if (matchesVisionRangeIssue(latestNorm)) {
        const sentiment = detectSentiment(latestNorm, false);
        return {
          gate: "A",
          extracted_symptom: "distance or near vision difficulty",
          severity: "severe",
          sentiment,
          target_department: "Ophthalmology",
          empathetic_response: buildRoutedResponse(
            sentiment,
            "distance or near vision difficulty",
            "Ophthalmology"
          ),
        };
      }

      const detGateB = runGateB(latestNorm, conversationMessages);
      if (detGateB) {
        if (detGateB.gate === "B-chronic") return detGateB;
        const crampsCtx = resolveGateBContext(latestNorm, conversationMessages);
        if (crampsCtx?.category === "cramps") {
          return runCrampsMatrix(
            crampsCtx,
            latestNorm,
            conversationMessages,
            detGateB.sentiment
          );
        }
        if (detGateB.clarification_kind === "severity") return detGateB;
        if (isSeverityOnlyTurn(latestNorm)) return detGateB;
        if (detGateB.target_department !== "CLARIFICATION_REQUIRED") return detGateB;
      }

      if (deterministic.clarification_kind === "unknown_symptom") {
        return { ...deterministic, empathetic_response: UNKNOWN_SYMPTOM_RESPONSE };
      }

      if (resolveGateBContext(latestNorm, conversationMessages) && !hasMild(latestNorm) && !hasSevere(latestNorm)) {
        const ctx = resolveGateBContext(latestNorm, conversationMessages)!;
        return {
          gate: "B",
          clarification_kind: "severity",
          extracted_symptom: ctx.label,
          severity: "ambiguous",
          sentiment: deterministic.sentiment,
          target_department: "CLARIFICATION_REQUIRED",
          empathetic_response: buildSeverityClarification(deterministic.sentiment, ctx.label),
        };
      }

      return llmResult;
    } catch {
      return deterministic;
    }
  };

  // ===========================================================================
  // Academic node-nlp (grading artifact)
  // ===========================================================================
  const initializeAcademicNlpManager = async (): Promise<NlpManager> => {
    const manager = new NlpManager({ languages: ["en"], forceNER: true, autoSave: false });

    manager.addDocument("en", "hello", "greetings.hello");
    manager.addDocument("en", "hi", "greetings.hello");
    manager.addDocument("en", "good morning", "greetings.hello");
    manager.addAnswer("en", "greetings.hello", nlpAnswer("greetings.hello"));

    manager.addDocument("en", "what are your hospital hours", "faq.hours");
    manager.addDocument("en", "when are you open", "faq.hours");
    manager.addAnswer("en", "faq.hours", nlpAnswer("faq.hours"));

    manager.addDocument("en", "where are you located", "faq.location");
    manager.addDocument("en", "what is your address", "faq.location");
    manager.addAnswer("en", "faq.location", nlpAnswer("faq.location"));

    manager.addDocument("en", "how much does a consultation cost", "faq.costs");
    manager.addDocument("en", "what are the consultation fees", "faq.costs");
    manager.addAnswer("en", "faq.costs", nlpAnswer("faq.costs"));

    manager.addDocument("en", "I have chest pain when I walk up stairs.", "triage.cardiology");
    manager.addDocument("en", "My heart is racing and I feel short of breath.", "triage.cardiology");
    manager.addDocument("en", "I feel pressure in my chest that comes and goes.", "triage.cardiology");
    manager.addAnswer("en", "triage.cardiology", nlpAnswer("triage.cardiology"));

    manager.addDocument("en", "I have stomach pain after meals and frequent bloating.", "triage.gastroenterology");
    manager.addDocument("en", "I have ongoing diarrhea and abdominal cramps.", "triage.gastroenterology");
    manager.addDocument("en", "I am vomiting and cannot keep food down.", "triage.gastroenterology");
    manager.addAnswer("en", "triage.gastroenterology", nlpAnswer("triage.gastroenterology"));

    manager.addDocument("en", "I have eye pain and sensitivity to light since this morning.", "triage.ophthalmology");
    manager.addDocument("en", "My vision is blurry and I have trouble focusing on text.", "triage.ophthalmology");
    manager.addDocument("en", "I can't see far objects clearly.", "triage.ophthalmology");
    manager.addAnswer("en", "triage.ophthalmology", nlpAnswer("triage.ophthalmology"));

    manager.addDocument("en", "I have an itchy rash that has spread over my arms.", "triage.dermatology");
    manager.addDocument("en", "I developed hives after eating something new.", "triage.dermatology");
    manager.addAnswer("en", "triage.dermatology", nlpAnswer("triage.dermatology"));

    manager.addDocument("en", "My knee hurts and it is swollen after a fall.", "triage.orthopedics");
    manager.addDocument("en", "I think I fractured my wrist playing sports.", "triage.orthopedics");
    manager.addDocument("en", "I have joint pain that is getting worse.", "triage.orthopedics");
    manager.addAnswer("en", "triage.orthopedics", nlpAnswer("triage.orthopedics"));

    manager.addDocument("en", "I have a severe headache that is getting worse.", "triage.neurology");
    manager.addDocument("en", "My hands are tingling and I feel weakness on one side.", "triage.neurology");
    manager.addAnswer("en", "triage.neurology", nlpAnswer("triage.neurology"));

    manager.addDocument("en", "I have kidney pain on my left side.", "triage.urology");
    manager.addDocument("en", "It burns when I urinate.", "triage.urology");
    manager.addAnswer("en", "triage.urology", nlpAnswer("triage.urology"));

    manager.addDocument("en", "My ear hurts and my hearing feels muffled.", "triage.ent");
    manager.addDocument("en", "my ear hurts", "triage.ent");
    manager.addDocument("en", "I have nose pain and sinus pressure.", "triage.ent");
    manager.addAnswer("en", "triage.ent", nlpAnswer("triage.ent"));

    manager.addDocument("en", "I have a persistent cough and shortness of breath at night.", "triage.pulmonology");
    manager.addDocument("en", "I feel tightness in my chest and wheeze when I breathe.", "triage.pulmonology");
    manager.addAnswer("en", "triage.pulmonology", nlpAnswer("triage.pulmonology"));

    manager.addDocument("en", "My child has a fever and is unusually sleepy today.", "triage.pediatrics");
    manager.addDocument("en", "My baby is coughing a lot and is having trouble feeding.", "triage.pediatrics");
    manager.addAnswer("en", "triage.pediatrics", nlpAnswer("triage.pediatrics"));

    manager.addDocument("en", "I have a low-grade fever and body aches since yesterday.", "triage.general_physician");
    manager.addDocument("en", "I have muscle pain in my shoulders.", "triage.general_physician");
    manager.addDocument("en", "I am having cramps in my legs.", "triage.orthopedics");
    manager.addDocument("en", "I think I have a common cold.", "triage.general_physician");
    manager.addDocument("en", "I have a cold and runny nose.", "triage.general_physician");
    manager.addAnswer("en", "triage.general_physician", nlpAnswer("triage.general_physician"));

    manager.addAnswer("en", "None", nlpAnswer("None"));

    await manager.train();
    return manager;
  };

  // ===========================================================================
  // Handler
  // ===========================================================================
  try {
    const body = (await req.json()) as { messages?: ChatMessage[] };
    const messages: ChatMessage[] = Array.isArray(body.messages) ? body.messages : [];
    const latestMessage = messages[messages.length - 1]?.content?.trim() || "";

    if (!latestMessage) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    const conversationMessages: ChatMessage[] = messages.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content || "").trim(),
    }));

    const academicNlpManager = await initializeAcademicNlpManager();
    void academicNlpManager;

    const triage = await classifyWithLLM(latestMessage, conversationMessages);
    const routedDepartment = triage.target_department;
    const answer = triage.empathetic_response;

    const basePayload = {
      answer,
      routedDepartment,
      sentiment: triage.sentiment,
      gate: triage.gate,
      clarification_kind: triage.clarification_kind ?? null,
      classification: {
        extracted_symptom: triage.extracted_symptom,
        severity: triage.severity,
        target_department: routedDepartment,
        empathetic_response: answer,
      },
    };

    if (routedDepartment === "CLARIFICATION_REQUIRED") {
      return NextResponse.json({
        ...basePayload,
        intent: "triage.clarification",
        score: 1,
        source: "split-gate-triage",
      });
    }

    return NextResponse.json({
      ...basePayload,
      intent: `triage.${routedDepartment.toLowerCase().replace(/\s+/g, "_")}`,
      score: 1,
      source: "split-gate-triage",
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
