import { z } from "zod";

const hkPhoneRegex = /^(5|6|8|9)\d{7}$/;

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
    locale: z.enum(["zh-HK"]),
    password: z
      .string()
      .min(10, "Minimum 10 characters")
      .regex(/[A-Z]/, "Must contain an uppercase letter")
      .regex(/[a-z]/, "Must contain a lowercase letter")
      .regex(/\d/, "Must contain a number"),
    confirmPassword: z.string().min(10, "Confirm your password"),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const addressSchema = z.object({
  district: z.string().min(2),
  area: z.string().min(2),
  buildingEstate: z.string().min(2),
  block: z.string().optional(),
  floor: z.string().optional(),
  flatRoom: z.string().optional(),
  landmarkNotes: z.string().optional(),
});

export const requestFormSchema = z.object({
  title: z.string().min(5),
  description: z.string().min(20),
  categoryId: z.string().min(1),
  subcategoryId: z.string().min(1),
  urgency: z.enum(["asap", "today", "tomorrow", "scheduled"]),
  scheduledDate: z.string().optional(),
  budgetMin: z.coerce.number().min(0).optional(),
  budgetMax: z.coerce.number().min(0).optional(),
  accessNotes: z.string().optional(),
  address: addressSchema,
  attachmentNames: z.array(z.string()).default([]),
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
  noteToCustomer: z.string().min(10),
});

export const proProfileSchema = z.object({
  displayName: z.string().min(2),
  yearsOfExperience: z.coerce.number().min(0).max(50),
  serviceCategoryIds: z.array(z.string()).min(1),
  serviceAreaDistricts: z.array(z.string()).min(1),
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
export type RequestFormValues = z.input<typeof requestFormSchema>;
export type RequestFormInput = z.output<typeof requestFormSchema>;
export type QuoteFormValues = z.input<typeof quoteFormSchema>;
export type QuoteFormInput = z.output<typeof quoteFormSchema>;
export type ProProfileFormValues = z.input<typeof proProfileSchema>;
export type ProProfileInput = z.output<typeof proProfileSchema>;
