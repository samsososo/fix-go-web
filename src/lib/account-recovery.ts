import type { Locale } from "@/types/domain";

export const securityQuestionIds = [
  "childhood_nickname",
  "first_school",
  "childhood_character",
] as const;

export type SecurityQuestionId = (typeof securityQuestionIds)[number];

export type AccountRecoverySetup = {
  dateOfBirth: string;
  securityQuestionId: SecurityQuestionId;
  securityAnswer: string;
};

export type PasswordResetRequest = AccountRecoverySetup & {
  phone: string;
  newPassword: string;
};

export const securityQuestions: Array<{
  id: SecurityQuestionId;
  label: Record<Locale, string>;
}> = [
  {
    id: "childhood_nickname",
    label: {
      "zh-HK": "你細個屋企人點叫你？",
      en: "What did your family call you as a child?",
    },
  },
  {
    id: "first_school",
    label: {
      "zh-HK": "你讀第一間學校叫咩名？",
      en: "What was the name of your first school?",
    },
  },
  {
    id: "childhood_character",
    label: {
      "zh-HK": "你細個最鍾意嘅卡通人物係邊個？",
      en: "Who was your favourite cartoon character as a child?",
    },
  },
];

export function normalizeSecurityAnswer(answer: string) {
  return answer.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}
