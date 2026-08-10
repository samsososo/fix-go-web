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

export function ProProfileForm({
  locale,
  profile,
}: {
  locale: string;
  profile: ProProfile;
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
      <div className="grid gap-5 md:grid-cols-2">
        <Field
          label={
            locale === "en" ? "Display / business name" : "顯示名稱 / 商業名稱"
          }
        >
          <Input {...form.register("displayName")} />
        </Field>
        <Field label={locale === "en" ? "Years of experience" : "年資"}>
          <Input {...form.register("yearsOfExperience")} type="number" />
        </Field>
      </div>

      <Field
        label={locale === "en" ? "Languages spoken" : "可使用語言"}
        hint="zh-HK, en, yue"
      >
        <Input
          defaultValue={profile.languagesSpoken.join(", ")}
          onChange={(event) =>
            form.setValue(
              "languagesSpoken",
              event.target.value
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean) as ProProfileInput["languagesSpoken"],
            )
          }
        />
      </Field>

      <Field label={locale === "en" ? "Introduction" : "自我介紹"}>
        <Textarea {...form.register("introduction")} />
      </Field>

      <Field label={locale === "en" ? "Document references" : "文件參考資料"}>
        <Input
          defaultValue={profile.documentPlaceholders.join(", ")}
          onChange={(event) =>
            form.setValue(
              "documentPlaceholders",
              event.target.value
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean),
            )
          }
        />
      </Field>

      <label className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-sm">
        <input
          type="checkbox"
          checked={emergencyAvailability}
          onChange={(event) =>
            form.setValue("emergencyAvailability", event.target.checked)
          }
        />
        {locale === "en" ? "Available for emergency jobs" : "可接緊急工作"}
      </label>

      {serverMessage ? (
        <p className="text-sm text-muted">{serverMessage}</p>
      ) : null}
      <Button type="submit" disabled={!isHydrated || isPending}>
        {isPending ? "..." : locale === "en" ? "Save profile" : "儲存檔案"}
      </Button>
    </form>
  );
}
