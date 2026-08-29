"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";

import { saveProProfileAction } from "@/lib/actions";
import { useHydrated } from "@/hooks/use-hydrated";
import { type ProProfile } from "@/types/domain";
import {
  proProfileSchema,
  type ProProfileFormValues,
  type ProProfileInput,
} from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const languageOptions = [
  { value: "yue", en: "Cantonese", zh: "廣東話" },
  { value: "zh-HK", en: "Chinese", zh: "中文" },
  { value: "en", en: "English", zh: "英文" },
] as const;

export function ProProfileForm({
  locale,
  profile,
  categoryOptions,
  districtOptions,
}: {
  locale: string;
  profile: ProProfile;
  categoryOptions: { id: string; label: string }[];
  districtOptions: { value: string; label: string }[];
}) {
  const isHydrated = useHydrated();
  const [isPending, startTransition] = useTransition();
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const form = useForm<ProProfileFormValues, unknown, ProProfileInput>({
    resolver: zodResolver(proProfileSchema),
    defaultValues: {
      displayName: profile.displayName,
      yearsOfExperience: profile.yearsOfExperience,
      serviceCategoryIds: profile.serviceCategoryIds,
      serviceAreaDistricts: profile.serviceAreaDistricts,
      languagesSpoken: profile.languagesSpoken,
      introduction: profile.introduction,
      emergencyAvailability: profile.emergencyAvailability,
      documentPlaceholders: profile.documentPlaceholders,
    },
  });
  const emergencyAvailability = useWatch({
    control: form.control,
    name: "emergencyAvailability",
  });
  const serviceCategoryIds =
    useWatch({ control: form.control, name: "serviceCategoryIds" }) ?? [];
  const serviceAreaDistricts =
    useWatch({ control: form.control, name: "serviceAreaDistricts" }) ?? [];
  const languagesSpoken =
    useWatch({ control: form.control, name: "languagesSpoken" }) ?? [];

  function toggleArrayValue(
    field: "serviceCategoryIds" | "serviceAreaDistricts" | "languagesSpoken",
    current: string[],
    value: string,
  ) {
    const next = current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value];
    form.setValue(field, next as never, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  const onSubmit = (values: ProProfileInput) => {
    setServerMessage(null);
    startTransition(async () => {
      const result = await saveProProfileAction({ locale, values });
      setServerMessage(
        result.ok
          ? locale === "en"
            ? "Profile saved."
            : "已儲存檔案。"
          : (result.error ?? "Unable to save profile."),
      );
    });
  };

  return (
    <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="grid gap-4 md:grid-cols-2 md:gap-5">
        <Field
          label={
            locale === "en" ? "Display / business name" : "顯示名稱 / 商業名稱"
          }
          error={
            form.formState.errors.displayName
              ? locale === "en"
                ? "Enter your display name."
                : "請輸入顯示名稱。"
              : undefined
          }
        >
          <Input {...form.register("displayName")} />
        </Field>
        <Field
          label={locale === "en" ? "Years of experience" : "年資"}
          error={
            form.formState.errors.yearsOfExperience
              ? locale === "en"
                ? "Enter 0 to 50 years."
                : "請輸入 0 至 50 年。"
              : undefined
          }
        >
          <Input
            {...form.register("yearsOfExperience")}
            type="number"
            inputMode="numeric"
            min={0}
            max={50}
          />
        </Field>
      </div>

      <Field
        label={locale === "en" ? "Service categories" : "服務分類"}
        hint={
          locale === "en"
            ? "Used to match suitable job leads."
            : "系統會按你選擇嘅分類配對工作機會。"
        }
      >
        <div className="flex flex-wrap gap-2">
          {categoryOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={serviceCategoryIds.includes(option.id)}
              onClick={() =>
                toggleArrayValue(
                  "serviceCategoryIds",
                  serviceCategoryIds,
                  option.id,
                )
              }
              className={cn(
                "min-h-11 rounded-full border px-4 text-sm font-semibold transition",
                serviceCategoryIds.includes(option.id)
                  ? "border-primary bg-primary text-white"
                  : "border-line bg-white text-foreground/72",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Field>

      <Field
        label={locale === "en" ? "Service areas" : "服務地區"}
        hint={
          locale === "en"
            ? "Choose every district you can serve."
            : "選擇你可以上門服務嘅地區。"
        }
      >
        <div className="flex flex-wrap gap-2">
          {districtOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={serviceAreaDistricts.includes(option.value)}
              onClick={() =>
                toggleArrayValue(
                  "serviceAreaDistricts",
                  serviceAreaDistricts,
                  option.value,
                )
              }
              className={cn(
                "min-h-11 rounded-full border px-4 text-sm font-semibold transition",
                serviceAreaDistricts.includes(option.value)
                  ? "border-primary bg-primary text-white"
                  : "border-line bg-white text-foreground/72",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Field>

      <Field
        label={locale === "en" ? "Languages spoken" : "可使用語言"}
        error={
          form.formState.errors.languagesSpoken
            ? locale === "en"
              ? "Choose at least one language."
              : "請選擇最少一種語言。"
            : undefined
        }
      >
        <div className="grid grid-cols-3 gap-2">
          {languageOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={languagesSpoken.includes(option.value)}
              onClick={() =>
                toggleArrayValue(
                  "languagesSpoken",
                  languagesSpoken,
                  option.value,
                )
              }
              className={cn(
                "min-h-11 rounded-xl border px-2 text-sm font-semibold transition",
                languagesSpoken.includes(option.value)
                  ? "border-primary bg-primary text-white"
                  : "border-line bg-white text-foreground/72",
              )}
            >
              {locale === "en" ? option.en : option.zh}
            </button>
          ))}
        </div>
      </Field>

      <Field
        label={locale === "en" ? "Introduction" : "自我介紹"}
        error={
          form.formState.errors.introduction
            ? locale === "en"
              ? "Write at least 30 characters."
              : "請填寫最少 30 個字。"
            : undefined
        }
      >
        <Textarea {...form.register("introduction")} />
      </Field>

      <Field
        label={locale === "en" ? "Document references" : "文件參考資料"}
        hint={
          locale === "en"
            ? "Enter reference names separated by commas."
            : "如有文件參考名稱，請用逗號分隔。"
        }
      >
        <Input
          defaultValue={profile.documentPlaceholders.join(", ")}
          onChange={(event) =>
            form.setValue(
              "documentPlaceholders",
              event.target.value
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean),
              { shouldDirty: true },
            )
          }
        />
      </Field>

      <label className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-sm">
        <input
          type="checkbox"
          className="h-5 w-5 shrink-0 accent-primary"
          checked={emergencyAvailability}
          onChange={(event) =>
            form.setValue("emergencyAvailability", event.target.checked)
          }
        />
        {locale === "en" ? "Available for emergency jobs" : "可接緊急工作"}
      </label>

      {serverMessage ? (
        <p className="text-sm text-muted" role="status">
          {serverMessage}
        </p>
      ) : null}
      <div
        className={cn(
          "rounded-2xl lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none",
          form.formState.isDirty
            ? "fixed inset-x-4 bottom-20 z-40 border border-line/80 bg-card/96 p-3 shadow-[0_12px_30px_rgba(24,36,51,0.12)] backdrop-blur"
            : "mt-2",
        )}
      >
        <Button
          type="submit"
          className="w-full lg:w-auto"
          disabled={!isHydrated || isPending}
        >
          {isPending ? "..." : locale === "en" ? "Save profile" : "儲存檔案"}
        </Button>
      </div>
    </form>
  );
}
