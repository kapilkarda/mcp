/**
 * Static data copied from the QCall app (qcallai-app src/assets/data) so assistants
 * created through MCP get exactly the values the app would send.
 */

// language.json: label -> code
export const APP_LANGUAGES: Record<string, string> = {
  "English": "en",
  "Hindi": "hi",
  "Bengali": "bn",
  "Gujarati": "gu",
  "Kannada (India)": "kn",
  "Malayalam": "ml",
  "Marathi": "mr",
  "Tamil (India)": "ta",
  "Telugu (India)": "te",
  "Punjabi": "pa",
  "German": "de",
  "Dutch": "nl",
  "French": "fr",
  "Spanish": "es",
  "Italian": "it",
  "Portuguese": "pt",
  "Polish": "pl",
  "Arabic (Kuwait)": "ar-kw"
};

export const LANGUAGE_CODES = Object.values(APP_LANGUAGES) as [string, ...string[]];

// hangupMessage.json: end_call_message by first language
export const HANGUP_MESSAGES: Record<string, string> = {
  "en": "Thank you for your time. Have a great day!",
  "hi": "आपके समय के लिए धन्यवाद। आपका दिन शुभ हो!",
  "de": "Vielen Dank für Ihre Zeit. Einen schönen Tag noch!",
  "es": "Gracias por tu tiempo. ¡Que tengas un gran día!",
  "fr": "Merci pour votre temps. Passez une excellente journée!",
  "it": "Grazie per il tuo tempo. Buona giornata!",
  "te": "మీ సమయానికి ధన్యవాదాలు. మీకు శుభదినం!",
  "kn": "ನಿಮ್ಮ ಸಮಯಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು. ಶುಭ ದಿನ!",
  "ta": "உங்கள் நேரத்திற்கு நன்றி. உங்கள் நாள் நல்லதாக இருக்கட்டும்!",
  "gu": "તમારા સમય માટે આભાર. તમારો દિવસ શુભ રહો!",
  "bn": "আপনার সময়ের জন্য ধন্যবাদ। আপনার দিন শুভ হোক!",
  "as": "আপোনাৰ সময়ৰ বাবে ধন্যবাদ। আপোনাৰ দিনটো শুভ হওক।",
  "ml": "നിങ്ങളുടെ സമയത്തിന് നന്ദി. ശുഭദിനം നേരുന്നു!",
  "mr": "तुमच्या वेळेबद्दल धन्यवाद. तुमचा दिवस चांगला जावो!",
  "ne": "तपाईंको समयका लागि धन्यवाद। तपाईंको दिन शुभ रहोस्!",
  "or": "ଆପଣଙ୍କ ସମୟ ପାଇଁ ଧନ୍ୟବାଦ | ଆପଣଙ୍କ ଦିନ ଶୁଭ ହେଉ |",
  "pa": "ਤੁਹਾਡੇ ਸਮੇਂ ਲਈ ਧੰਨਵਾਦ। ਤੁਹਾਡਾ ਦਿਨ ਵਧੀਆ ਰਹੇ!",
  "nl": "Bedankt voor je tijd. Een fijne dag verder!",
  "pt": "Obrigado pelo seu tempo. Tenha um ótimo dia!",
  "pl": "Dziękujemy za poświęcony czas. Życzymy miłego dnia!",
  "ar-kw": "شكرا لوقتك. أتمنى لك يوما سعيدا!"
};

// assets/data/template.ts goal labels (anything else is sent as free text, like the app's "Other")
export const APP_GOALS = [
  "Lead Generation and Qualification",
  "Customer Engagement and Relationship Management",
  "Appointment Setting and Reminder Services",
  "Feedback and Survey Collection",
  "Sales and Upselling/Cross-Selling",
  "Retention and Win-Back Campaigns",
  "Market Research and Analysis",
  "Compliance and Verification Services"
];

// createAssistant/index.tsx sentiment defaults
export const DEFAULT_SENTIMENT = {
  general_prompt: "Analyze customer interactions",
  positive_prompt: "If the customer is happy with the service, classify it as positive",
  negative_prompt: "If the customer is complaining, classify it as negative",
  neutral_prompt: "If the conversation is just informational, classify it as neutral"
};
