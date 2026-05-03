"use server";

import { revalidatePath } from "next/cache";

import {
  clearSession,
  localizedRoleHomePath,
  signInAs,
  signInWithCredentials,
} from "@/lib/auth";
import { enableDemoLogin } from "@/lib/env";
import { createCredential } from "@/lib/mock/db";
import {
  acceptCustomerQuote,
  createCustomerRequest,
  createUserAccount,
  saveProProfile,
  submitProQuote,
  toggleProVerification,
  updateAdminRequestStatus,
  updateProBookingStatus,
} from "@/lib/mock/repositories";
import { BookingStatus, RequestStatus } from "@/types/domain";
import {
  ProProfileInput,
  QuoteFormInput,
  RequestFormInput,
  SignupInput,
  loginSchema,
  proProfileSchema,
  quoteFormSchema,
  requestFormSchema,
  signupSchema,
} from "@/lib/validation";

export async function startLoginAction(input: {
  identifier: string;
  password: string;
  locale: string;
}) {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid login details." };
  }

  const result = await signInWithCredentials(
    parsed.data.identifier,
    parsed.data.password,
  );
  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    target: localizedRoleHomePath(result.user.role, input.locale),
  };
}

export async function signUpAction(input: SignupInput) {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please check the form fields." };
  }

  let user;
  try {
    user = await createUserAccount(parsed.data);
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to create account at this time.",
    };
  }
  await createCredential(user.id, parsed.data.password);
  await signInAs(user.id);

  revalidatePath(`/${parsed.data.locale}`);
  return {
    ok: true,
    target: localizedRoleHomePath(user.role, parsed.data.locale),
  };
}

export async function signInDemoAction(input: {
  userId: string;
  locale: string;
}) {
  if (!enableDemoLogin) {
    return { ok: false, error: "Demo login is disabled." };
  }

  const user = await signInAs(input.userId);
  return { ok: true, target: localizedRoleHomePath(user.role, input.locale) };
}

export async function logoutAction(input: { locale: string }) {
  await clearSession();
  return { ok: true, target: `/${input.locale}` };
}

export async function createRequestAction(input: {
  customerId: string;
  locale: string;
  values: RequestFormInput;
}) {
  const parsed = requestFormSchema.safeParse(input.values);
  if (!parsed.success) {
    return { ok: false, error: "Please review the request details." };
  }

  const request = await createCustomerRequest(
    input.customerId,
    parsed.data,
    input.locale,
  );
  revalidatePath(`/${input.locale}/customer`);
  revalidatePath(`/${input.locale}/pro/leads`);
  return {
    ok: true,
    target: `/${input.locale}/customer/requests/${request.id}`,
  };
}

export async function acceptQuoteAction(input: {
  customerId: string;
  locale: string;
  requestId: string;
  quoteId: string;
}) {
  try {
    const quote = await acceptCustomerQuote(
      input.customerId,
      input.requestId,
      input.quoteId,
      input.locale,
    );
    revalidatePath(`/${input.locale}/customer/requests/${input.requestId}`);
    revalidatePath(`/${input.locale}/customer/orders`);
    revalidatePath(`/${input.locale}/pro/jobs`);
    if (quote) {
      revalidatePath(`/${input.locale}/pro/leads/${input.requestId}`);
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to accept quote.",
    };
  }
}

export async function saveProProfileAction(input: {
  userId: string;
  locale: string;
  values: ProProfileInput;
}) {
  const parsed = proProfileSchema.safeParse(input.values);
  if (!parsed.success) {
    return { ok: false, error: "Please complete the required profile fields." };
  }

  await saveProProfile(input.userId, parsed.data);
  revalidatePath(`/${input.locale}/pro`);
  revalidatePath(`/${input.locale}/pro/profile`);
  return { ok: true };
}

export async function submitQuoteAction(input: {
  proId: string;
  locale: string;
  requestId: string;
  values: QuoteFormInput;
}) {
  const parsed = quoteFormSchema.safeParse(input.values);
  if (!parsed.success) {
    return { ok: false, error: "Please review the quote details." };
  }

  await submitProQuote(input.proId, input.requestId, parsed.data, input.locale);
  revalidatePath(`/${input.locale}/pro/leads`);
  revalidatePath(`/${input.locale}/pro/leads/${input.requestId}`);
  revalidatePath(`/${input.locale}/customer/requests/${input.requestId}`);
  return { ok: true };
}

export async function updateBookingStatusAction(input: {
  proId: string;
  locale: string;
  bookingId: string;
  status: BookingStatus;
}) {
  try {
    const booking = await updateProBookingStatus(
      input.proId,
      input.bookingId,
      input.status,
      input.locale,
    );
    revalidatePath(`/${input.locale}/pro/jobs`);
    revalidatePath(`/${input.locale}/pro/jobs/${input.bookingId}`);
    revalidatePath(`/${input.locale}/customer/orders`);
    revalidatePath(`/${input.locale}/customer/orders/${input.bookingId}`);
    if (booking) {
      revalidatePath(`/${input.locale}/customer/requests/${booking.requestId}`);
      revalidatePath(`/${input.locale}/admin/requests/${booking.requestId}`);
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Unable to update booking.",
    };
  }
}

export async function updateAdminRequestStatusAction(input: {
  locale: string;
  requestId: string;
  status: RequestStatus;
  adminId: string;
  note?: string;
}) {
  try {
    const request = await updateAdminRequestStatus(
      input.requestId,
      input.status,
      input.adminId,
      input.note,
      input.locale,
    );
    revalidatePath(`/${input.locale}/admin`);
    revalidatePath(`/${input.locale}/admin/requests`);
    revalidatePath(`/${input.locale}/admin/requests/${input.requestId}`);
    revalidatePath(`/${input.locale}/customer`);
    revalidatePath(`/${input.locale}/customer/orders`);
    revalidatePath(`/${input.locale}/pro/jobs`);
    if (request) {
      revalidatePath(`/${input.locale}/customer/requests/${request.id}`);
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Unable to update request.",
    };
  }
}

export async function toggleProVerificationAction(input: {
  locale: string;
  userId: string;
  verified: boolean;
}) {
  await toggleProVerification(input.userId, input.verified);
  revalidatePath(`/${input.locale}/admin/pros`);
  revalidatePath(`/${input.locale}/admin/pros/${input.userId}`);
  return { ok: true };
}
