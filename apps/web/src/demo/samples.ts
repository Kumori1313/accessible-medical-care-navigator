import type { Answer, Explanation, OcrResult } from "@amcn/core";
import {
  AUTHORIZATION_CONFIDENCE,
  AUTHORIZATION_TEXT,
  EOB_CONFIDENCE,
  EOB_TEXT,
  VACCINE_CONFIDENCE,
  VACCINE_TEXT,
} from "./sampleText";

/**
 * Built-in sample documents so the app works with no server, no API key and no network.
 * The OCR text is real pipeline output. The explanations are PRE-WRITTEN (not live model output)
 * and the UI says so. Every `quote` must appear word for word in the OCR text; a test enforces it.
 */
/** A pre-written question and answer, so "ask a question" works with no server. */
export interface CannedQuestion {
  /** Shown as a suggestion the user can pick. */
  question: string;
  /** The question matches if ALL words in ANY one group appear in it (case-insensitive). */
  match: string[][];
  answer: Answer;
}

export interface DemoSample {
  id: string;
  title: string;
  blurb: string;
  /** Where the document comes from, shown to the user. */
  source: string;
  ocr: OcrResult;
  explanation: Explanation;
  questions: CannedQuestion[];
}

const ocr = (text: string, confidence: number): OcrResult => ({
  text,
  confidence,
  low_confidence: confidence < 70,
});

export const DEMO_SAMPLES: DemoSample[] = [
  {
    id: "eob",
    title: "Insurance statement (Explanation of Benefits)",
    blurb:
      "What did the doctor charge, what did my plan pay, and what do I owe?",
    source:
      "Sample from the US Centers for Medicare & Medicaid Services (public domain)",
    ocr: ocr(EOB_TEXT, EOB_CONFIDENCE),
    explanation: {
      document_type: "Explanation of Benefits (EOB) from a health plan",
      summary:
        "This is an example insurance statement. It is not a bill. It shows what a provider charged for a visit, what your health plan agreed to pay, and what you may still owe.",
      sections: [
        {
          title: "This is not a bill",
          what_it_asks:
            "Nothing. An EOB is a statement, not a request for payment. You may get a separate bill from your provider.",
          required: null,
          quote: "An EOB is NOT A BILL",
        },
        {
          title: "Phone number for questions",
          what_it_asks:
            "Call this number if you have questions about your coverage or about finding a provider.",
          required: null,
          quote: "Customer Service Number: 1-800-123-4567",
        },
        {
          title: "Provider charges",
          what_it_asks:
            "The full amount your provider billed for the visit. In this example the total is $406.60.",
          required: null,
          quote: "4. Provider Charges",
        },
        {
          title: "Allowed charges",
          what_it_asks:
            "The amount your plan agreed the service is worth. It can be lower than what was billed. In this example the total is $120.27.",
          required: null,
          quote: "5. Allowed Charges",
        },
        {
          title: "Paid by insurer",
          what_it_asks:
            "The amount your health plan pays to your provider. In this example the total is $85.27.",
          required: null,
          quote: "6. Paid by Insurer",
        },
        {
          title: "What you owe",
          what_it_asks:
            "The amount left for you to pay after your plan has paid its share. In this example it is $35.00. Money you already paid your provider may not be taken off this number.",
          required: null,
          quote: "7.What You Owe is the amount you owe after",
        },
        {
          title: "Remark code",
          what_it_asks:
            "A short code with a note from your plan that explains the charges. In this example the code is PDC.",
          required: null,
          quote: "8.Remark Code",
        },
        {
          title: "If you disagree",
          what_it_asks:
            "You may be able to appeal a coverage or payment decision. Keep the bill and call your health plan right away.",
          required: null,
          quote:
            "If you disagree with a coverage or payment decision by your health",
        },
      ],
      uncertain: [
        "The table in the photo was hard to read, so some numbers may be wrong. Check the totals against your paper copy.",
      ],
    },
    questions: [
      {
        question: "Is this a bill?",
        match: [["bill"]],
        answer: {
          answer:
            "No. The document says an EOB is not a bill. You may get a separate bill from your provider.",
          found: true,
          quote: "An EOB is NOT A BILL",
        },
      },
      {
        question: "How much do I owe?",
        match: [["owe"], ["balance"], ["how", "much", "pay"]],
        answer: {
          answer:
            "In this example, the amount you owe is $35.00. That is what is left after your plan has paid its share.",
          found: true,
          quote: "7.What You Owe is the amount you owe after",
        },
      },
      {
        question: "Who do I call with questions?",
        match: [["call"], ["phone"], ["number"], ["contact"]],
        answer: {
          answer:
            "The customer service number in this example is 1-800-123-4567. You can call it with questions about your coverage.",
          found: true,
          quote: "Customer Service Number: 1-800-123-4567",
        },
      },
      {
        question: "Can I appeal?",
        match: [["appeal"], ["disagree"], ["dispute"]],
        answer: {
          answer:
            "Yes, you may be able to appeal. If you disagree with a coverage or payment decision, keep the bill and call your health plan right away.",
          found: true,
          quote:
            "If you disagree with a coverage or payment decision by your health",
        },
      },
    ],
  },
  {
    id: "authorization",
    title: "Permission form (Medicare authorization)",
    blurb: "A form that lets someone else get your health information.",
    source:
      "Sample from the US Centers for Medicare & Medicaid Services (public domain)",
    ocr: ocr(AUTHORIZATION_TEXT, AUTHORIZATION_CONFIDENCE),
    explanation: {
      document_type:
        "Medicare form giving someone permission to see your health information",
      summary:
        "You fill in this form to let 1-800-MEDICARE share your personal health information with another person or organization, such as a family member. This is the first page; the signature part is on the next pages.",
      sections: [
        {
          title: "About you",
          what_it_asks:
            "Your name, Medicare number, date of birth, address, phone number and email.",
          required: null,
          quote: "Information about the person with Medicare",
        },
        {
          title: "Who can get your information",
          what_it_asks:
            "The name and address of each person or organization you want to share with. There is room for two. For more, list them on the back of the form.",
          required: null,
          quote:
            "To share with more than 2 people or organizations, list their name and address on the back of this form.",
        },
        {
          title: "How much to share",
          what_it_asks:
            "Choose one box: any information, or only limited information. You can only pick one.",
          required: true,
          quote: "Check only one box:",
        },
        {
          title: "Which types of information (if limited)",
          what_it_asks:
            "If you chose limited, tick every type you are willing to share, such as eligibility, claims, plan enrollment or premium payments. You can also write in something else.",
          required: null,
          quote: "Check all that apply:",
        },
      ],
      uncertain: [
        "This is only page 1 of the form. How long the permission lasts, the signature and where to send the form are on the next pages.",
        "The text in the boxes for your name and number is blank in this sample.",
      ],
    },
    questions: [
      {
        question: "Who can see my information?",
        match: [["who"], ["share"], ["see"]],
        answer: {
          answer:
            "Only the people or organizations you list on the form. There is room for two names, and you can list more on the back of the form.",
          found: true,
          quote:
            "To share with more than 2 people or organizations, list their name and address on the back of this form.",
        },
      },
      {
        question: "Can I choose what is shared?",
        match: [
          ["choose"],
          ["limit"],
          ["what", "shared"],
          ["which", "information"],
        ],
        answer: {
          answer:
            "Yes. You choose one box: any information, or limited information. If you choose limited, you tick the types you want to share.",
          found: true,
          quote: "Check only one box:",
        },
      },
      {
        question: "Can I cancel it later?",
        match: [["cancel"], ["revoke"], ["change", "mind"], ["take", "back"]],
        answer: {
          answer:
            "This page does not say. The rules for cancelling may be on another page of the form, so ask 1-800-MEDICARE.",
          found: false,
          quote: "",
        },
      },
    ],
  },
  {
    id: "vaccine",
    title: "Health handout (flu vaccine information)",
    blurb: "A dense handout, rewritten in plain steps.",
    source:
      "Sample from the US Centers for Disease Control and Prevention (public domain)",
    ocr: ocr(VACCINE_TEXT, VACCINE_CONFIDENCE),
    explanation: {
      document_type: "Vaccine Information Statement for the flu shot",
      summary:
        "A handout that explains why the flu shot is recommended, who should get it and what to tell your provider first. It is information, not a form to fill in.",
      sections: [
        {
          title: "Why get the flu shot",
          what_it_asks:
            "The flu can make some people very sick, especially young children, people 65 and older, pregnant women and people with certain health conditions. The shot can prevent it.",
          required: null,
          quote: "Influenza vaccine can prevent influenza (flu).",
        },
        {
          title: "Who should get it, and how often",
          what_it_asks:
            "The CDC recommends everyone 6 months and older get the shot every flu season. Some young children may need 2 doses in one season. Everyone else needs 1.",
          required: null,
          quote: "CDC recommends everyone 6 months and older",
        },
        {
          title: "How long it takes to work",
          what_it_asks:
            "Protection takes about 2 weeks to develop after the shot.",
          required: null,
          quote: "It takes about 2 weeks for protection to develop",
        },
        {
          title: "A common worry",
          what_it_asks: "The flu shot does not give you the flu.",
          required: null,
          quote: "Influenza vaccine does not cause flu.",
        },
        {
          title: "What to tell your provider first",
          what_it_asks:
            "Tell them if you have had an allergic reaction to a flu shot before, have any severe allergies, or have ever had Guillain-Barré Syndrome. If you are only mildly ill, such as a cold, you can still get it.",
          required: null,
          quote: "Tell your vaccination provider if the person getting",
        },
      ],
      uncertain: [],
    },
    questions: [
      {
        question: "Who should get the flu shot?",
        match: [["who"], ["should"]],
        answer: {
          answer:
            "The CDC recommends that everyone 6 months and older get vaccinated every flu season.",
          found: true,
          quote: "CDC recommends everyone 6 months and older",
        },
      },
      {
        question: "Does the shot give you the flu?",
        match: [["give", "flu"], ["cause"], ["catch", "flu"]],
        answer: {
          answer: "No. The handout says the flu vaccine does not cause flu.",
          found: true,
          quote: "Influenza vaccine does not cause flu.",
        },
      },
      {
        question: "How long until it works?",
        match: [["how", "long"], ["work"], ["protect"]],
        answer: {
          answer:
            "It takes about 2 weeks for protection to develop after the shot.",
          found: true,
          quote: "It takes about 2 weeks for protection to develop",
        },
      },
      {
        question: "How many doses do I need?",
        match: [["dose"], ["how", "many"]],
        answer: {
          answer:
            "Children 6 months through 8 years may need 2 doses in one flu season. Everyone else needs 1 dose each flu season.",
          found: true,
          quote: "Children 6 months",
        },
      },
    ],
  },
];

const words = (text: string) => text.toLowerCase().match(/[a-z0-9$-]+/g) ?? [];

/**
 * Finds a pre-written answer for a question asked in the user's own words, or undefined.
 * Words match as prefixes, so "owe" also catches "owed" and "paying" matches "pay". When several
 * questions fit, the most specific one (the group that matched the most words) wins.
 */
export function matchCanned(
  sample: DemoSample,
  question: string,
): CannedQuestion | undefined {
  const asked = words(question);
  const has = (w: string) =>
    asked.some((a) => a.startsWith(w) || (w.startsWith(a) && a.length >= 3));
  let best: CannedQuestion | undefined;
  let bestScore = 0;
  for (const q of sample.questions) {
    for (const group of q.match) {
      if (group.length > bestScore && group.every(has)) {
        best = q;
        bestScore = group.length;
      }
    }
  }
  return best;
}

export function findSample(id: string): DemoSample | undefined {
  return DEMO_SAMPLES.find((s) => s.id === id);
}
