// CareConnect Bot - Healthcare chatbot using node-nlp
// Requirements: npm i node-nlp

const { NlpManager } = require('node-nlp');
const readline = require('readline');

async function main() {
  const manager = new NlpManager({ languages: ['en'], forceNER: true });

  // ---------------------------
  // Greetings
  // ---------------------------
  manager.addDocument('en', 'hello', 'greetings.hello');
  manager.addDocument('en', 'hi', 'greetings.hello');
  manager.addDocument('en', 'good morning', 'greetings.hello');
  manager.addAnswer(
    'en',
    'greetings.hello',
    "Hello! Welcome to CareConnect Health. How can I help you today?"
  );

  // ---------------------------
  // FAQs (3 distinct intents)
  // ---------------------------
  manager.addDocument('en', 'what are your hospital hours', 'faq.hours');
  manager.addDocument('en', 'when are you open', 'faq.hours');
  manager.addDocument('en', 'hours', 'faq.hours');
  manager.addAnswer(
    'en',
    'faq.hours',
    'Our Emergency Department is open 24/7. Regular outpatient services operate from 9 AM to 6 PM.'
  );

  manager.addDocument('en', 'where are you located', 'faq.location');
  manager.addDocument('en', 'what is your address', 'faq.location');
  manager.addDocument('en', 'location', 'faq.location');
  manager.addAnswer('en', 'faq.location', 'We are located at 123 Health Ave.');

  manager.addDocument('en', 'how much does a consultation cost', 'faq.costs');
  manager.addDocument('en', 'consultation fees', 'faq.costs');
  manager.addDocument('en', 'cost', 'faq.costs');
  manager.addAnswer(
    'en',
    'faq.costs',
    'Consultation costs start at $50, depending on the specialist and services required.'
  );

  // ---------------------------
  // Symptom triage (12 departments)
  // For each department:
  // - exactly 3 full-sentence documents
  // - exactly 5 single-keyword documents
  // - 1 professional answer recommending that specialist
  // ---------------------------

  // Cardiology
  manager.addDocument('en', 'I have chest pain when I walk up stairs.', 'triage.cardiology');
  manager.addDocument('en', 'My heart is racing and I feel short of breath.', 'triage.cardiology');
  manager.addDocument('en', 'I feel pressure in my chest that comes and goes.', 'triage.cardiology');
  manager.addDocument('en', 'chestpain', 'triage.cardiology');
  manager.addDocument('en', 'palpitations', 'triage.cardiology');
  manager.addDocument('en', 'arrhythmia', 'triage.cardiology');
  manager.addDocument('en', 'angina', 'triage.cardiology');
  manager.addDocument('en', 'tachycardia', 'triage.cardiology');
  manager.addAnswer(
    'en',
    'triage.cardiology',
    'Based on what you shared, a Cardiology consultation would be appropriate. A cardiologist can evaluate your symptoms and guide the next steps.'
  );

  // Neurology
  manager.addDocument('en', 'I have a severe headache that is getting worse.', 'triage.neurology');
  manager.addDocument('en', 'My hands are tingling and I feel weakness on one side.', 'triage.neurology');
  manager.addDocument('en', 'I am having frequent dizziness and balance problems.', 'triage.neurology');
  manager.addDocument('en', 'headache', 'triage.neurology');
  manager.addDocument('en', 'migraine', 'triage.neurology');
  manager.addDocument('en', 'seizure', 'triage.neurology');
  manager.addDocument('en', 'numbness', 'triage.neurology');
  manager.addDocument('en', 'vertigo', 'triage.neurology');
  manager.addAnswer(
    'en',
    'triage.neurology',
    'These symptoms fit a Neurology evaluation. I recommend seeing a neurologist for a focused assessment and appropriate testing.'
  );

  // Orthopedics
  manager.addDocument('en', 'My knee hurts and it is swollen after a fall.', 'triage.orthopedics');
  manager.addDocument('en', 'I have persistent back pain that worsens when I move.', 'triage.orthopedics');
  manager.addDocument('en', 'My shoulder pain limits my ability to lift my arm.', 'triage.orthopedics');
  manager.addDocument('en', 'fracture', 'triage.orthopedics');
  manager.addDocument('en', 'sprain', 'triage.orthopedics');
  manager.addDocument('en', 'jointpain', 'triage.orthopedics');
  manager.addDocument('en', 'backpain', 'triage.orthopedics');
  manager.addDocument('en', 'arthritis', 'triage.orthopedics');
  manager.addAnswer(
    'en',
    'triage.orthopedics',
    'An Orthopedics visit would be suitable. An orthopedic specialist can evaluate bones, joints, and soft-tissue injuries and recommend treatment.'
  );

  // Pediatrics
  manager.addDocument('en', 'My child has a fever and is unusually sleepy today.', 'triage.pediatrics');
  manager.addDocument('en', 'My baby is coughing a lot and is having trouble feeding.', 'triage.pediatrics');
  manager.addDocument('en', 'My child has a rash and seems very uncomfortable.', 'triage.pediatrics');
  manager.addDocument('en', 'fever', 'triage.pediatrics');
  manager.addDocument('en', 'cough', 'triage.pediatrics');
  manager.addDocument('en', 'rash', 'triage.pediatrics');
  manager.addDocument('en', 'vomiting', 'triage.pediatrics');
  manager.addDocument('en', 'diarrhea', 'triage.pediatrics');
  manager.addAnswer(
    'en',
    'triage.pediatrics',
    'For children’s health concerns, a Pediatrics consultation is recommended. A pediatrician can assess your child and advise the safest next steps.'
  );

  // General Physician
  manager.addDocument('en', 'I have been feeling tired for weeks and I do not know why.', 'triage.general_physician');
  manager.addDocument('en', 'I have a low-grade fever and body aches since yesterday.', 'triage.general_physician');
  manager.addDocument('en', 'I need help understanding my symptoms and what to do next.', 'triage.general_physician');
  manager.addDocument('en', 'fatigue', 'triage.general_physician');
  manager.addDocument('en', 'fever', 'triage.general_physician');
  manager.addDocument('en', 'weakness', 'triage.general_physician');
  manager.addDocument('en', 'checkup', 'triage.general_physician');
  manager.addDocument('en', 'flu', 'triage.general_physician');
  manager.addAnswer(
    'en',
    'triage.general_physician',
    'A General Physician is a great first step for broad or unclear symptoms. They can evaluate you and refer you to the right specialist if needed.'
  );

  // Gastroenterology
  manager.addDocument('en', 'I have stomach pain after meals and frequent bloating.', 'triage.gastroenterology');
  manager.addDocument('en', 'I have persistent heartburn and a sour taste in my mouth.', 'triage.gastroenterology');
  manager.addDocument('en', 'I have ongoing diarrhea and abdominal cramps.', 'triage.gastroenterology');
  manager.addDocument('en', 'heartburn', 'triage.gastroenterology');
  manager.addDocument('en', 'bloating', 'triage.gastroenterology');
  manager.addDocument('en', 'acidreflux', 'triage.gastroenterology');
  manager.addDocument('en', 'constipation', 'triage.gastroenterology');
  manager.addDocument('en', 'abdominalpain', 'triage.gastroenterology');
  manager.addAnswer(
    'en',
    'triage.gastroenterology',
    'A Gastroenterology consultation is recommended for digestive symptoms like these. A gastroenterologist can assess your GI health and plan treatment.'
  );

  // Dermatology
  manager.addDocument('en', 'I have an itchy rash that has spread over my arms.', 'triage.dermatology');
  manager.addDocument('en', 'I noticed a changing mole and I am concerned about it.', 'triage.dermatology');
  manager.addDocument('en', 'My skin is very dry and inflamed despite using moisturizer.', 'triage.dermatology');
  manager.addDocument('en', 'eczema', 'triage.dermatology');
  manager.addDocument('en', 'acne', 'triage.dermatology');
  manager.addDocument('en', 'psoriasis', 'triage.dermatology');
  manager.addDocument('en', 'hives', 'triage.dermatology');
  manager.addDocument('en', 'mole', 'triage.dermatology');
  manager.addAnswer(
    'en',
    'triage.dermatology',
    'A Dermatology appointment would be appropriate. A dermatologist can evaluate skin changes and recommend safe and effective treatment options.'
  );

  // ENT
  manager.addDocument('en', 'I have a sore throat and difficulty swallowing for two days.', 'triage.ent');
  manager.addDocument('en', 'My ear hurts and my hearing feels muffled.', 'triage.ent');
  manager.addDocument('en', 'I have ongoing sinus pressure and nasal congestion.', 'triage.ent');
  manager.addDocument('en', 'earache', 'triage.ent');
  manager.addDocument('en', 'sinus', 'triage.ent');
  manager.addDocument('en', 'tonsillitis', 'triage.ent');
  manager.addDocument('en', 'hoarseness', 'triage.ent');
  manager.addDocument('en', 'congestion', 'triage.ent');
  manager.addAnswer(
    'en',
    'triage.ent',
    'These concerns align with an ENT (Ear, Nose, and Throat) specialist. I recommend an ENT consultation for an accurate evaluation and treatment plan.'
  );

  // Psychiatry
  manager.addDocument('en', 'I have been feeling anxious every day and it is affecting my sleep.', 'triage.psychiatry');
  manager.addDocument('en', 'I feel persistently sad and have lost interest in things I enjoy.', 'triage.psychiatry');
  manager.addDocument('en', 'I am having panic episodes and I do not know how to manage them.', 'triage.psychiatry');
  manager.addDocument('en', 'anxiety', 'triage.psychiatry');
  manager.addDocument('en', 'depression', 'triage.psychiatry');
  manager.addDocument('en', 'panic', 'triage.psychiatry');
  manager.addDocument('en', 'stress', 'triage.psychiatry');
  manager.addDocument('en', 'insomnia', 'triage.psychiatry');
  manager.addAnswer(
    'en',
    'triage.psychiatry',
    'A Psychiatry consultation may help. A psychiatrist can assess mood and anxiety symptoms and discuss therapy options and, if appropriate, medication.'
  );

  // Pulmonology
  manager.addDocument('en', 'I have a persistent cough and shortness of breath at night.', 'triage.pulmonology');
  manager.addDocument('en', 'I feel tightness in my chest and wheeze when I breathe.', 'triage.pulmonology');
  manager.addDocument('en', 'I get breathless with minor activity and it is worsening.', 'triage.pulmonology');
  manager.addDocument('en', 'asthma', 'triage.pulmonology');
  manager.addDocument('en', 'wheezing', 'triage.pulmonology');
  manager.addDocument('en', 'cough', 'triage.pulmonology');
  manager.addDocument('en', 'breathless', 'triage.pulmonology');
  manager.addDocument('en', 'copd', 'triage.pulmonology');
  manager.addAnswer(
    'en',
    'triage.pulmonology',
    'A Pulmonology evaluation is recommended for breathing-related symptoms. A pulmonologist can assess lung function and guide further care.'
  );

  // Gynecology
  manager.addDocument('en', 'I have irregular periods and pelvic pain that concerns me.', 'triage.gynecology');
  manager.addDocument('en', 'I have unusual vaginal discharge and discomfort.', 'triage.gynecology');
  manager.addDocument('en', 'I have severe menstrual cramps that interfere with daily activities.', 'triage.gynecology');
  manager.addDocument('en', 'period', 'triage.gynecology');
  manager.addDocument('en', 'pelvicpain', 'triage.gynecology');
  manager.addDocument('en', 'cramps', 'triage.gynecology');
  manager.addDocument('en', 'discharge', 'triage.gynecology');
  manager.addDocument('en', 'pcos', 'triage.gynecology');
  manager.addAnswer(
    'en',
    'triage.gynecology',
    'A Gynecology consultation would be appropriate. A gynecologist can evaluate reproductive health symptoms and recommend the right next steps.'
  );

  // Ophthalmology
  manager.addDocument('en', 'My vision is blurry and I have trouble focusing on text.', 'triage.ophthalmology');
  manager.addDocument('en', 'I have eye pain and sensitivity to light since this morning.', 'triage.ophthalmology');
  manager.addDocument('en', 'My eyes are red and watery and it is not improving.', 'triage.ophthalmology');
  manager.addDocument('en', 'blurry', 'triage.ophthalmology');
  manager.addDocument('en', 'eyepain', 'triage.ophthalmology');
  manager.addDocument('en', 'redness', 'triage.ophthalmology');
  manager.addDocument('en', 'vision', 'triage.ophthalmology');
  manager.addDocument('en', 'conjunctivitis', 'triage.ophthalmology');
  manager.addAnswer(
    'en',
    'triage.ophthalmology',
    'For eye or vision concerns, an Ophthalmology visit is recommended. An ophthalmologist can evaluate eye health and provide appropriate treatment.'
  );

  // ---------------------------
  // Fallback (None)
  // ---------------------------
  manager.addAnswer(
    'en',
    'None',
    "I'm sorry—I didn't quite understand that. Could you rephrase your question or describe your symptoms in a bit more detail?"
  );

  // Train and save
  console.log('Training CareConnect Bot... (this may take a moment)');
  await manager.train();
  manager.save();

  // Interface (readline chat loop)
  console.log('\n==============================================');
  console.log(' CareConnect Bot is ready (English model trained)');
  console.log(' Type your message, or type "exit" to quit.');
  console.log('==============================================\n');

  // Simulate bot saying the first greeting before waiting for input
  console.log('CareConnect Bot: Hello! Welcome to CareConnect Health. How can I help you today?\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'You: ',
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const text = (line || '').trim();
    if (!text) {
      rl.prompt();
      return;
    }

    if (['exit', 'quit', 'bye'].includes(text.toLowerCase())) {
      console.log('CareConnect Bot: Take care. Wishing you good health!');
      rl.close();
      return;
    }

    try {
      const result = await manager.process('en', text);
      const response = result.answer || "I'm sorry—I didn't quite understand that.";
      console.log(`CareConnect Bot: ${response}`);
    } catch (err) {
      console.log('CareConnect Bot: Sorry—something went wrong while processing your message.');
    }

    rl.prompt();
  });

  rl.on('close', () => {
    process.exit(0);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error starting CareConnect Bot:', err);
  process.exit(1);
});

