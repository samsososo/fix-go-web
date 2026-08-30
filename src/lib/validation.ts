import { z } from "zod";

import { securityQuestionIds } from "@/lib/account-recovery";

const hkPhoneRegex = /^(5|6|8|9)\d{7}$/;

const strongPasswordSchema = z
  .string()
  .min(10, "Minimum 10 characters")
  .regex(/[A-Z]/, "Must contain an uppercase letter")
  .regex(/[a-z]/, "Must contain a lowercase letter")
  .regex(/\d/, "Must contain a number");

const dateOfBirthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date of birth")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day &&
      date.getTime() <= Date.now()
    );
  }, "Invalid date of birth");

export const loginSchema = z.object({
  identifier: z.string().min(4, "Required"),
  password: z.string().min(10, "Minimum 10 characters"),
});

export const signupSchema = z
  .object({
    fullName: z.string().min(2, "Required"),
    phone: z.string().regex(hkPhoneRegex, "Invalid Hong Kong mobile number"),
    email: z.string().email().optional().or(z.literal("")),
    role: z.enum(["customer", "pro"]),
    serviceCategoryIds: z.array(z.string()).default([]),
    locale: z.enum(["zh-HK"]),
    dateOfBirth: dateOfBirthSchema,
    securityQuestionId: z.enum(securityQuestionIds),
    securityAnswer: z.string().trim().min(1, "Required").max(100),
    password: strongPasswordSchema,
    confirmPassword: z.string().min(10, "Confirm your password"),
  })
  .refine(
    (value) => value.role !== "pro" || value.serviceCategoryIds.length > 0,
    {
      message: "Select at least one specialty",
      path: ["serviceCategoryIds"],
    },
  )
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const passwordResetSchema = z
  .object({
    phone: z.string().regex(hkPhoneRegex, "Invalid Hong Kong mobile number"),
    dateOfBirth: dateOfBirthSchema,
    securityQuestionId: z.enum(securityQuestionIds),
    securityAnswer: z.string().trim().min(1, "Required").max(100),
    newPassword: strongPasswordSchema,
    confirmPassword: z.string().min(10, "Confirm your password"),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const addressSchema = z.object({
  district: z.string().trim().min(1),
  area: z.string().trim().min(1),
  buildingEstate: z.string().trim().min(1),
  block: z.string().optional(),
  floor: z.string().optional(),
  flatRoom: z.string().optional(),
  landmarkNotes: z.string().optional(),
});

export const requestFormSchema = z
  .object({
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
    categoryId: z.string().min(1),
    subcategoryId: z.string().min(1),
    urgency: z.enum(["asap", "today", "tomorrow", "scheduled"]),
    scheduledDate: z.string().optional(),
    budgetMin: z.coerce.number().min(0).optional(),
    budgetMax: z.coerce.number().min(0).optional(),
    accessNotes: z.string().optional(),
    address: addressSchema,
    attachmentNames: z.array(z.string()).default([]),
  })
  .superRefine((value, context) => {
    if (value.urgency === "scheduled" && !value.scheduledDate) {
      context.addIssue({
        code: "custom",
        message: "Scheduled date required",
        path: ["scheduledDate"],
      });
    }

    if (
      value.budgetMin !== undefined &&
      value.budgetMax !== undefined &&
      value.budgetMin > value.budgetMax
    ) {
      context.addIssue({
        code: "custom",
        message: "Maximum budget must not be below minimum budget",
        path: ["budgetMax"],
      });
    }
  });

export const quoteFormSchema = z.object({
  quoteAmount: z.coerce.number().min(1),
  labourEstimate: z.coerce.number().min(0),
  partsEstimate: z.coerce.number().min(0),
  callOutFee: z.coerce.number().min(0),
  total: z.coerce.number().min(1),
  includedWork: z.string().min(10),
  exclusions: z.string().min(5),
  earliestAvailability: z.string().min(1),
  estimatedDurationMinutes: z.coerce.number().min(30).max(480),
  noteToCustomer: z.string().min(10),
});

export const proProfileSchema = z.object({
  displayName: z.string().min(2),
  yearsOfExperience: z.coerce.number().min(0).max(50),
  serviceCategoryIds: z.array(z.string()).default([]),
  serviceAreaDistricts: z.array(z.string()).default([]),
  languagesSpoken: z.array(z.enum(["zh-HK", "en", "yue"])).min(1),
  introduction: z.string().min(30),
  emergencyAvailability: z.boolean(),
  documentPlaceholders: z.array(z.string()).default([]),
});

export const adminStatusSchema = z.object({
  requestStatus: z.enum([
    "draft",
    "submitted",
    "awaiting_quotes",
    "quoted",
    "accepted",
    "scheduled",
    "in_progress",
    "completed",
    "cancelled",
  ]),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type LoginFormValues = z.input<typeof loginSchema>;
export type SignupFormValues = z.input<typeof signupSchema>;
export type SignupInput = z.output<typeof signupSchema>;
export type PasswordResetFormValues = z.input<typeof passwordResetSchema>;
export type PasswordResetInput = z.output<typeof passwordResetSchema>;
export type RequestFormValues = z.input<typeof requestFormSchema>;
export type RequestFormInput = z.output<typeof requestFormSchema>;
export type QuoteFormValues = z.input<typeof quoteFormSchema>;
export type QuoteFormInput = z.output<typeof quoteFormSchema>;
export type ProProfileFormValues = z.input<typeof proProfileSchema>;
export type ProProfileInput = z.output<typeof proProfileSchema>;
