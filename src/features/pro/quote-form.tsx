"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { submitQuoteAction } from "@/lib/actions";
import { useHydrated } from "@/hooks/use-hydrated";
import {
  quoteFormSchema,
  type QuoteFormInput,
  type QuoteFormValues,
} from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const durationOptions = [
  { value: 30, zh: "30 分鐘", en: "30 min" },
  { value: 60, zh: "1 小時", en: "1h" },
  { value: 90, zh: "1.5 小時", en: "1.5h" },
  { value: 120, zh: "2 小時", en: "2h" },
  { value: 180, zh: "3 小時", en: "3h" },
  { value: 240, zh: "4 小時", en: "4h" },
  { value: 480, zh: "全日", en: "Full day" },
];

export function QuoteForm({
  locale,
  requestId,
  initialValues,
}: {
  locale: string;
  requestId: string;
  initialValues?: Partial<QuoteFormInput>;
}) {
  const router = useRouter();
  const isHydrated = useHydrated();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<QuoteFormValues, unknown, QuoteFormInput>({
    resolver: zodResolver(quoteFormSchema),
    defaultValues: {
      quoteAmount: initialValues?.quoteAmount ?? 0,
      labourEstimate: initialValues?.labourEstimate ?? 0,
      partsEstimate: initialValues?.partsEstimate ?? 0,
      callOutFee: initialValues?.callOutFee ?? 0,
      total: initialValues?.total ?? 0,
      includedWork: initialValues?.includedWork ?? "",
      exclusions: initialValues?.exclusions ?? "",
      earliestAvailability: initialValues?.earliestAvailability ?? "",
      estimatedDurationMinutes: initialValues?.estimatedDurationMinutes ?? 120,
      noteToCustomer: initialValues?.noteToCustomer ?? "",
    },
  });

  const onSubmit = (values: QuoteFormInput) => {
    setServerError(null);
    startTransition(async () => {
      const result = await submitQuoteAction({
        locale,
        requestId,
        values,
      });
      if (!result.ok) {
        setServerError(result.error ?? "Unable to submit quote.");
        return;
      }
      router.refresh();
    });
  };

  return (
    <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="grid gap-5 md:grid-cols-2">
        <Field label={locale === "en" ? "Quote amount" : "報價金額"}>
          <Input {...form.register("quoteAmount")} type="number" />
        </Field>
        <Field label={locale === "en" ? "Total" : "總額"}>
          <Input {...form.register("total")} type="number" />
        </Field>
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        <Field label={locale === "en" ? "Labour" : "人工"}>
          <Input {...form.register("labourEstimate")} type="number" />
        </Field>
        <Field label={locale === "en" ? "Parts" : "零件 / 物料"}>
          <Input {...form.register("partsEstimate")} type="number" />
        </Field>
        <Field label={locale === "en" ? "Call-out fee" : "上門費"}>
          <Input {...form.register("callOutFee")} type="number" />
        </Field>
      </div>
      <Field label={locale === "en" ? "Included work" : "包含項目"}>
        <Textarea {...form.register("includedWork")} className="min-h-20" />
      </Field>
      <Field label={locale === "en" ? "Exclusions" : "不包括項目"}>
        <Textarea {...form.register("exclusions")} className="min-h-20" />
      </Field>
      <div className="grid gap-5 md:grid-cols-2">
        <Field
          label={locale === "en" ? "Earliest availability" : "最早可上門時間"}
        >
          <Input
            {...form.register("earliestAvailability")}
            type="datetime-local"
          />
        </Field>
        <Field label={locale === "en" ? "Estimated duration" : "預計需時"}>
          <Select {...form.register("estimatedDurationMinutes")}>
            {durationOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {locale === "en" ? option.en : option.zh}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label={locale === "en" ? "Note to customer" : "給客戶的備註"}>
        <Textarea {...form.register("noteToCustomer")} className="min-h-20" />
      </Field>
      {serverError ? (
        <p className="text-sm text-danger">{serverError}</p>
      ) : null}
      <Button type="submit" disabled={!isHydrated || isPending}>
        {isPending
          ? "..."
          : initialValues
            ? locale === "en"
              ? "Update quote"
              : "更新報價"
            : locale === "en"
              ? "Send quote"
              : "提交報價"}
      </Button>
    </form>
  );
}
