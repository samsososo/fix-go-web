import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = (await params).locale || (await getLocale());
  redirect(`/${locale}/auth/login`);
}
