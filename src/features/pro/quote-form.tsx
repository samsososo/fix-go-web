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

function toHongKongDateTimeLocal(value: string | undefined) {
  if (!value) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

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
  const [isEditing, setIsEditing] = useState(!initialValues);
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
      earliestAvailability: toHongKongDateTimeLocal(
        initialValues?.earliestAvailability,
      ),
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
      setIsEditing(false);
      router.refresh();
    });
  };

  const errors = form.formState.errors;
  const moneyError =
    locale === "en" ? "Enter a valid amount." : "請輸入有效金額。";
  const textError =
    locale === "en" ? "Please add more detail." : "請補充詳細內容。";

  if (initialValues && !isEditing) {
    return (
      <Button
        type="button"
        variant="outline"
        className="w-full sm:w-auto"
        onClick={() => setIsEditing(true)}
      >
        {locale === "en" ? "Edit quote" : "修改報價"}
      </Button>
    );
  }

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
      <div>
        <p className="text-sm font-bold text-primary">
          {locale === "en" ? "Price breakdown" : "報價金額"}
        </p>
        <p className="mt-1 text-xs leading-5 text-muted">
          {locale === "en"
            ? "All amounts are in Hong Kong dollars."
            : "所有金額均以港幣計算。"}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-2 md:gap-5">
        <Field
          label={locale === "en" ? "Quote amount" : "工程報價"}
          error={errors.quoteAmount ? moneyError : undefined}
        >
          <Input
            {...form.register("quoteAmount")}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
          />
        </Field>
        <Field
          label={locale === "en" ? "Total" : "總額"}
          error={errors.total ? moneyError : undefined}
        >
          <Input
            {...form.register("total")}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5">
        <Field
          label={locale === "en" ? "Labour" : "人工"}
          error={errors.labourEstimate ? moneyError : undefined}
        >
          <Input
            {...form.register("labourEstimate")}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
          />
        </Field>
        <Field
          label={locale === "en" ? "Parts" : "零件 / 物料"}
          error={errors.partsEstimate ? moneyError : undefined}
        >
          <Input
            {...form.register("partsEstimate")}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
          />
        </Field>
        <Field
          label={locale === "en" ? "Call-out fee" : "上門費"}
          error={errors.callOutFee ? moneyError : undefined}
        >
          <Input
            {...form.register("callOutFee")}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
          />
        </Field>
      </div>
      <Field
        label={locale === "en" ? "Included work" : "包含項目"}
        error={errors.includedWork ? textError : undefined}
      >
        <Textarea {...form.register("includedWork")} className="min-h-20" />
      </Field>
      <Field
        label={locale === "en" ? "Exclusions" : "不包括項目"}
        error={errors.exclusions ? textError : undefined}
      >
        <Textarea {...form.register("exclusions")} className="min-h-20" />
      </Field>
      <div className="grid gap-4 md:grid-cols-2 md:gap-5">
        <Field
          label={locale === "en" ? "Earliest availability" : "最早可上門時間"}
          error={
            errors.earliestAvailability
              ? locale === "en"
                ? "Choose an available time."
                : "請選擇可上門時間。"
              : undefined
          }
        >
          <Input
            {...form.register("earliestAvailability")}
            type="datetime-local"
          />
        </Field>
        <Field
          label={locale === "en" ? "Estimated duration" : "預計需時"}
          error={errors.estimatedDurationMinutes ? textError : undefined}
        >
          <Select {...form.register("estimatedDurationMinutes")}>
            {durationOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {locale === "en" ? option.en : option.zh}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field
        label={locale === "en" ? "Note to customer" : "給客戶的備註"}
        error={errors.noteToCustomer ? textError : undefined}
      >
        <Textarea {...form.register("noteToCustomer")} className="min-h-20" />
      </Field>
      {serverError ? (
        <p className="text-sm text-danger" role="alert">
          {serverError}
        </p>
      ) : null}
      <div className="sticky bottom-20 z-20 flex gap-2 rounded-2xl border border-line/80 bg-card/96 p-3 shadow-[0_12px_30px_rgba(24,36,51,0.12)] backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
        {initialValues ? (
          <Button
            type="button"
            variant="outline"
            className="flex-1 lg:flex-none"
            onClick={() => setIsEditing(false)}
          >
            {locale === "en" ? "Cancel" : "取消修改"}
          </Button>
        ) : null}
        <Button
          type="submit"
          className="flex-1 lg:flex-none"
          disabled={!isHydrated || isPending}
        >
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
      </div>
    </form>
  );
}
