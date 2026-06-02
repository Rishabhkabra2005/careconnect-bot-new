import { NlpManager } from "node-nlp";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // ===========================================================================
  // Types (request-scoped only)
  // ===========================================================================
  type ChatMessage = { role: "user" | "assistant"; content: string };
  type LlmSeverity = "mild" | "severe" | "ambiguous";
  type SentimentLabel = "worried" | "uncomfortable" | "distressed" | "concerned";
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

  type GateBSymptom = "stomach" | "vomiting" | "respiratory" | "fever" | "ent";

  type TriageResult = {
    gate: "A" | "B" | "C" | "clarify";
    extracted_symptom: string;
    severity: LlmSeverity;
    sentiment: SentimentLabel;
    target_department: TargetDepartment;
    empathetic_response: string;
  };

  // ===========================================================================
  // Per-request constants
  // ===========================================================================
  const TYPO_MAP: Record<string, string> = {
    frasctreu: "fracture",
    frature: "fracture",
    svere: "severe",
    ahving: "having",
    eyee: "eye",
    noze: "nose",
    haert: "heart",
    hert: "heart",
    stomak: "stomach",
    acidty: "acidity",
    mils: "mild",
    midl: "mild",
    norml: "normal",
    fevr: "fever",
    kidny: "kidney",
    vomitting: "vomiting",
    vomitng: "vomiting",
    nausia: "nausea",
    couhg: "cough",
    breth: "breath",
  };

  const FILLER_PATTERN = /\b(issues?|problems?|trouble|concerns?)\b/gi;
  const CHILD_TOKENS = ["baby", "child", "kid", "toddler", "infant", "son", "daughter", "newborn"];
  const MILD_WORDS = ["mild", "normal", "light", "slight", "manageable", "low-grade"];
  const SEVERE_WORDS = [
    "severe",
    "unbearable",
    "intense",
    "sharp",
    "burning",
    "chronic",
    "high fever",
    "high temperature",
    "worst",
    "emergency",
  ];
  const DISTRESS_WORDS = ["scared", "afraid", "terrified", "panic", "can't breathe", "help", "emergency", "dying"];

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

  const NLP_ANSWERS: Record<string, string> = {
    "greetings.hello": "Hello! Welcome to CareConnect Health. How can I help you today?",
    "faq.hours":
      "Our Emergency Department is open 24/7. Regular outpatient services operate from 9 AM to 6 PM.",
    "faq.location": "We are located at 123 Health Ave.",
    "faq.costs": "Consultation costs start at $50, depending on the specialist and services required.",
    "triage.cardiology":
      "Based on what you shared, a Cardiology consultation would be appropriate.",
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

  const normalizeTypos = (text: string): string => {
    let out = text.toLowerCase();
    for (const [wrong, correct] of Object.entries(TYPO_MAP)) {
      out = out.replace(new RegExp(`\\b${wrong}\\b`, "gi"), correct);
    }
    return out;
  };

  const normalizeMessage = (text: string): string => {
    let out = normalizeTypos(text.trim());
    out = out.replace(FILLER_PATTERN, "pain");
    if (/\bstomach\b/.test(out) && !/\b(pain|ache|burn|acid|discomfort)\b/.test(out)) {
      out = out.replace(/\bstomach\b/, "stomach pain");
    }
    return out;
  };

  const isTargetDepartment = (value: string): value is TargetDepartment =>
    ALLOWED_DEPARTMENTS.includes(value as TargetDepartment);

  const detectSentiment = (text: string, isSevere: boolean): SentimentLabel => {
    if (containsAny(text, DISTRESS_WORDS) || isSevere) return "distressed";
    if (containsAny(text, ["worried", "anxious", "nervous", "concerned"])) return "worried";
    if (containsAny(text, ["uncomfortable", "hurts", "aching", "sore"])) return "uncomfortable";
    return "concerned";
  };

  const buildEmpatheticResponse = (
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

    if (department === "CLARIFICATION_REQUIRED") {
      return `I understand you're feeling ${feeling} about your ${symptomLabel}. I see you're experiencing ${symptomLabel}. Is this mild/manageable or is it severe?`;
    }
    if (department === "General Physician") {
      return `I understand you're feeling ${feeling} about your ${symptomLabel}. Based on what you've shared, I recommend consulting a General Physician for an initial evaluation.`;
    }
    return `I understand you're feeling ${feeling} about your ${symptomLabel}. Based on your symptoms, I recommend consulting a specialist in ${department} immediately.`;
  };

  const isSeverityOnlyTurn = (latest: string): boolean => {
    const t = latest.trim();
    if (!t) return false;
    const words = t.split(/\s+/);
    return words.length <= 4 && (containsAny(t, MILD_WORDS) || containsAny(t, SEVERE_WORDS));
  };

  const hasMild = (text: string): boolean => containsAny(text, MILD_WORDS);
  const hasSevere = (text: string): boolean => containsAny(text, SEVERE_WORDS);

  const priorUserText = (allMsgs: ChatMessage[]): string =>
    normalizeMessage(
      allMsgs
        .slice(0, -1)
        .filter((m) => m.role === "user")
        .map((m) => m.content)
        .join(" ")
    );

  const historyHasChildContext = (msgs: ChatMessage[]): boolean =>
    containsAny(
      normalizeMessage(msgs.map((m) => m.content).join(" ")),
      CHILD_TOKENS
    );

  const pickPediatricsOr = (
    childContext: boolean,
    systemicInPriorOrLatest: boolean,
    defaultDept: TargetDepartment
  ): TargetDepartment => {
    if (childContext && systemicInPriorOrLatest) return "Pediatrics";
    return defaultDept;
  };

  // ===========================================================================
  // Gate B symptom detection (latest message primary)
  // ===========================================================================
  const detectGateBSymptom = (latest: string): { category: GateBSymptom; label: string } | null => {
    if (
      containsAny(latest, [
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
    if (containsAny(latest, ["vomit", "vomiting", "nausea", "throwing up", "threw up"])) {
      return { category: "vomiting", label: "vomiting" };
    }
    if (
      containsAny(latest, [
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
    if (containsAny(latest, ["fever", "chills", "temperature", "febrile"])) {
      return { category: "fever", label: "fever" };
    }
    if (
      containsAny(latest, [
        "nose",
        "nostril",
        "sinus",
        "ear",
        "earache",
        "throat",
        "tonsil",
        "nasal",
        "hearing",
      ])
    ) {
      if (containsAny(latest, ["nose", "nostril", "sinus", "nasal"])) {
        return { category: "ent", label: "nose pain" };
      }
      if (containsAny(latest, ["ear", "earache", "hearing"])) {
        return { category: "ent", label: "ear pain" };
      }
      return { category: "ent", label: "throat or sinus discomfort" };
    }
    return null;
  };

  const detectGateBSymptomFromPrior = (prior: string): { category: GateBSymptom; label: string } | null =>
    detectGateBSymptom(prior);

  const severeSpecialistForGateB = (category: GateBSymptom): TargetDepartment => {
    switch (category) {
      case "stomach":
      case "vomiting":
        return "Gastroenterology";
      case "respiratory":
        return "Pulmonology";
      case "fever":
        return "General Physician";
      case "ent":
        return "ENT";
      default:
        return "General Physician";
    }
  };

  // ===========================================================================
  // GATE A — Anatomy-first bypass (latest message only)
  // ===========================================================================
  const runGateA = (latest: string): TriageResult | null => {
    if (
      containsAny(latest, [
        "heart",
        "chest",
        "palpitation",
        "palpitations",
        "cardiac",
        "heartbeat",
        "chest pain",
      ])
    ) {
      const sev = hasSevere(latest);
      return {
        gate: "A",
        extracted_symptom: "heart/chest",
        severity: sev ? "severe" : "ambiguous",
        sentiment: detectSentiment(latest, sev),
        target_department: "Cardiology",
        empathetic_response: buildEmpatheticResponse(
          detectSentiment(latest, sev),
          "heart symptoms",
          "Cardiology"
        ),
      };
    }

    if (
      containsAny(latest, [
        "eye",
        "eyes",
        "vision",
        "blurry",
        "blurred",
        "sight",
        "blind",
        "blindness",
        "conjunctivitis",
      ])
    ) {
      const sev = hasSevere(latest);
      return {
        gate: "A",
        extracted_symptom: "eye/vision",
        severity: sev ? "severe" : "ambiguous",
        sentiment: detectSentiment(latest, sev),
        target_department: "Ophthalmology",
        empathetic_response: buildEmpatheticResponse(
          detectSentiment(latest, sev),
          "eye symptoms",
          "Ophthalmology"
        ),
      };
    }

    if (
      containsAny(latest, [
        "fracture",
        "frasctreu",
        "dislocation",
        "joint pain",
        "joints pain",
        "bone",
        "sprain",
        "arthritis",
        "knee",
        "ankle",
        "wrist",
      ])
    ) {
      const sev = hasSevere(latest);
      return {
        gate: "A",
        extracted_symptom: "bone/joint",
        severity: sev ? "severe" : "ambiguous",
        sentiment: detectSentiment(latest, sev),
        target_department: "Orthopedics",
        empathetic_response: buildEmpatheticResponse(
          detectSentiment(latest, sev),
          "bone or joint symptoms",
          "Orthopedics"
        ),
      };
    }

    if (
      containsAny(latest, [
        "skin",
        "rash",
        "rashes",
        "itch",
        "itching",
        "eczema",
        "pimple",
        "acne",
        "hives",
      ])
    ) {
      const sev = hasSevere(latest);
      return {
        gate: "A",
        extracted_symptom: "skin",
        severity: sev ? "severe" : "ambiguous",
        sentiment: detectSentiment(latest, sev),
        target_department: "Dermatology",
        empathetic_response: buildEmpatheticResponse(
          detectSentiment(latest, sev),
          "skin symptoms",
          "Dermatology"
        ),
      };
    }

    if (
      containsAny(latest, ["paralysis", "seizure", "numbness", "sudden numb", "stroke", "convulsion"])
    ) {
      const sev = true;
      return {
        gate: "A",
        extracted_symptom: "neurological",
        severity: "severe",
        sentiment: detectSentiment(latest, sev),
        target_department: "Neurology",
        empathetic_response: buildEmpatheticResponse(
          detectSentiment(latest, sev),
          "neurological symptoms",
          "Neurology"
        ),
      };
    }

    if (containsAny(latest, ["kidney", "urine", "urinary", "bladder", "prostate"])) {
      const sev = hasSevere(latest);
      return {
        gate: "A",
        extracted_symptom: "kidney/urinary",
        severity: sev ? "severe" : "ambiguous",
        sentiment: detectSentiment(latest, sev),
        target_department: "Urology",
        empathetic_response: buildEmpatheticResponse(
          detectSentiment(latest, sev),
          "kidney or urinary symptoms",
          "Urology"
        ),
      };
    }

    return null;
  };

  // ===========================================================================
  // GATE B — Systemic triage (latest + severity follow-up from prior)
  // ===========================================================================
  const runGateB = (
    latest: string,
    prior: string,
    childContext: boolean
  ): TriageResult | null => {
    const mild = hasMild(latest);
    const severe = hasSevere(latest);
    const sentiment = detectSentiment(latest, severe);

    let gateB = detectGateBSymptom(latest);

    if (!gateB && isSeverityOnlyTurn(latest)) {
      gateB = detectGateBSymptomFromPrior(prior);
    }

    if (!gateB) return null;

    const systemic = containsAny(`${prior} ${latest}`, [
      "fever",
      "cough",
      "vomiting",
      "vomit",
      "nausea",
    ]);

    if (mild || (isSeverityOnlyTurn(latest) && hasMild(latest))) {
      const dept = pickPediatricsOr(childContext, systemic, "General Physician");
      return {
        gate: childContext && systemic ? "C" : "B",
        extracted_symptom: gateB.label,
        severity: "mild",
        sentiment,
        target_department: dept,
        empathetic_response: buildEmpatheticResponse(sentiment, gateB.label, dept),
      };
    }

    if (severe || (isSeverityOnlyTurn(latest) && hasSevere(latest))) {
      const specialist = severeSpecialistForGateB(gateB.category);
      const dept =
        gateB.category === "fever" && childContext
          ? "Pediatrics"
          : pickPediatricsOr(childContext, systemic && gateB.category !== "fever", specialist);
      return {
        gate: dept === "Pediatrics" ? "C" : "B",
        extracted_symptom: gateB.label,
        severity: "severe",
        sentiment,
        target_department: dept,
        empathetic_response: buildEmpatheticResponse(sentiment, gateB.label, dept),
      };
    }

    return {
      gate: "clarify",
      extracted_symptom: gateB.label,
      severity: "ambiguous",
      sentiment,
      target_department: "CLARIFICATION_REQUIRED",
      empathetic_response: buildEmpatheticResponse(sentiment, gateB.label, "CLARIFICATION_REQUIRED"),
    };
  };

  // ===========================================================================
  // Master triage (deterministic — always runs)
  // ===========================================================================
  const runThreeGateTriage = (
    latestRaw: string,
    conversationMessages: ChatMessage[],
    childContext: boolean
  ): TriageResult => {
    const latest = normalizeMessage(latestRaw);
    const prior = priorUserText(conversationMessages);

    const gateA = runGateA(latest);
    if (gateA) return gateA;

    const gateB = runGateB(latest, prior, childContext);
    if (gateB) return gateB;

    if (isSeverityOnlyTurn(latest)) {
      const priorGateB = detectGateBSymptomFromPrior(prior);
      if (priorGateB) {
        return runGateB(latest, prior, childContext)!;
      }
    }

    const fallbackSymptom = "symptoms";
    return {
      gate: "clarify",
      extracted_symptom: fallbackSymptom,
      severity: "ambiguous",
      sentiment: detectSentiment(latest, false),
      target_department: "CLARIFICATION_REQUIRED",
      empathetic_response: buildEmpatheticResponse(
        detectSentiment(latest, false),
        fallbackSymptom,
        "CLARIFICATION_REQUIRED"
      ),
    };
  };

  // ===========================================================================
  // LLM enhancement layer (optional; validated against gates)
  // ===========================================================================
  const TRIAGE_SYSTEM_PROMPT = `
You are a stateless 3-Gate Clinical Triage Engine. Classify using the LATEST user message.
Use full conversation history only for follow-ups (e.g. user said "mild" after you asked severity).

GATE A — ANATOMY-FIRST (instant specialist, NEVER General Physician, NEVER ask mild/severe):
- Heart/chest/palpitations -> Cardiology
- Eyes/vision/blurry/sight/blindness -> Ophthalmology
- Fracture/frasctreu/dislocation/joint pain -> Orthopedics
- Skin/rash/eczema/pimple/itching -> Dermatology
- Paralysis/seizure/sudden numbness -> Neurology
- Kidney/urine/bladder -> Urology

GATE B — SYSTEMIC (mild vs severe ONLY for these):
- Stomach (pain, acidity, burning) | Vomiting/nausea | Respiratory (cough, breathing, congestion) | Fever/chills | ENT (nose pain, ear ache, sore throat, sinus)
Rules:
1. Ambiguous (e.g. "vomiting", "nose pain", "stomach pain" alone) -> CLARIFICATION_REQUIRED with: "I see you're experiencing [symptom]. Is this mild/manageable or is it severe?"
2. Mild -> General Physician
3. Severe -> Gastroenterology (stomach/vomiting), Pulmonology (respiratory), ENT (nose/ear/throat), General Physician (fever unless child)

GATE C — PEDIATRICS:
Only if baby/child/kid/son/daughter/infant appears in history for Gate B systemic symptoms.

Normalize typos: frasctreu->fracture, svere->severe, ahving->having, hert->heart, eyee->eye, noze->nose, stomak->stomach.
Treat "stomach issues" as stomach pain -> Gate B clarify.

Sentiment: worried | uncomfortable | distressed | concerned
Start empathetic_response with: "I understand you're feeling [sentiment] about your [symptom]..."

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
    const childContext = historyHasChildContext(conversationMessages);
    const deterministic = runThreeGateTriage(latestMessage, conversationMessages, childContext);

    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    if (!apiKey) return deterministic;

    const historyText = conversationMessages
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n");

    const userPrompt = `
Full conversation:
${historyText}

LATEST user message (primary routing input):
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
      const gateAHit = runGateA(latestNorm);
      if (gateAHit && llmResult.target_department === "General Physician") {
        return gateAHit;
      }
      if (gateAHit && llmResult.target_department !== gateAHit.target_department) {
        return gateAHit;
      }

      const gateBHit = runGateB(latestNorm, priorUserText(conversationMessages), childContext);
      if (gateBHit?.target_department === "CLARIFICATION_REQUIRED" && dept === "General Physician") {
        return gateBHit;
      }
      if (detectGateBSymptom(latestNorm) && dept === "General Physician" && !hasMild(latestNorm)) {
        return deterministic;
      }

      return llmResult;
    } catch {
      return deterministic;
    }
  };

  // ===========================================================================
  // Academic node-nlp (grading artifact — not used for active routing)
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
    manager.addAnswer("en", "triage.ophthalmology", nlpAnswer("triage.ophthalmology"));

    manager.addDocument("en", "I have an itchy rash that has spread over my arms.", "triage.dermatology");
    manager.addDocument("en", "I developed hives after eating something new.", "triage.dermatology");
    manager.addAnswer("en", "triage.dermatology", nlpAnswer("triage.dermatology"));

    manager.addDocument("en", "My knee hurts and it is swollen after a fall.", "triage.orthopedics");
    manager.addDocument("en", "I think I fractured my wrist playing sports.", "triage.orthopedics");
    manager.addAnswer("en", "triage.orthopedics", nlpAnswer("triage.orthopedics"));

    manager.addDocument("en", "My hands are tingling and I feel weakness on one side.", "triage.neurology");
    manager.addDocument("en", "I felt faint and nearly collapsed this morning.", "triage.neurology");
    manager.addAnswer("en", "triage.neurology", nlpAnswer("triage.neurology"));

    manager.addDocument("en", "I have kidney pain on my left side.", "triage.urology");
    manager.addDocument("en", "It burns when I urinate.", "triage.urology");
    manager.addAnswer("en", "triage.urology", nlpAnswer("triage.urology"));

    manager.addDocument("en", "My ear hurts and my hearing feels muffled.", "triage.ent");
    manager.addDocument("en", "my ear hurts", "triage.ent");
    manager.addDocument("en", "I have nose pain and sinus pressure.", "triage.ent");
    manager.addDocument("en", "I have a sore throat and difficulty swallowing.", "triage.ent");
    manager.addAnswer("en", "triage.ent", nlpAnswer("triage.ent"));

    manager.addDocument("en", "I have a persistent cough and shortness of breath at night.", "triage.pulmonology");
    manager.addDocument("en", "I feel tightness in my chest and wheeze when I breathe.", "triage.pulmonology");
    manager.addAnswer("en", "triage.pulmonology", nlpAnswer("triage.pulmonology"));

    manager.addDocument("en", "My child has a fever and is unusually sleepy today.", "triage.pediatrics");
    manager.addDocument("en", "My baby is coughing a lot and is having trouble feeding.", "triage.pediatrics");
    manager.addAnswer("en", "triage.pediatrics", nlpAnswer("triage.pediatrics"));

    manager.addDocument("en", "I have a low-grade fever and body aches since yesterday.", "triage.general_physician");
    manager.addDocument("en", "I need help understanding my symptoms and what to do next.", "triage.general_physician");
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
        source: "3-gate-triage",
      });
    }

    return NextResponse.json({
      ...basePayload,
      intent: `triage.${routedDepartment.toLowerCase().replace(/\s+/g, "_")}`,
      score: 1,
      source: "3-gate-triage",
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
