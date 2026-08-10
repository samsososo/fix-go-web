"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";

import { createRequestAction } from "@/lib/actions";
import { useHydrated } from "@/hooks/use-hydrated";
import { formatHongKongPhone } from "@/lib/formatters";
import { formatAreaName, formatDistrictName } from "@/lib/hk-locale";
import { type DistrictAreaSeed } from "@/types/domain";
import {
  requestFormSchema,
  type RequestFormInput,
  type RequestFormValues,
} from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function RequestForm({
  locale,
  customerPhone,
  categoryOptions,
  districts,
}: {
  locale: string;
  customerPhone: string;
  categoryOptions: {
    id: string;
    label: string;
    subcategories: { id: string; label: string }[];
  }[];
  districts: DistrictAreaSeed[];
}) {
  const router = useRouter();
  const isHydrated = useHydrated();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<RequestFormValues, unknown, RequestFormInput>({
    resolver: zodResolver(requestFormSchema),
    defaultValues: {
      title: "",
      description: "",
      categoryId: categoryOptions[0]?.id ?? "",
      subcategoryId: categoryOptions[0]?.subcategories[0]?.id ?? "",
      urgency: "asap",
      scheduledDate: "",
      budgetMin: undefined,
      budgetMax: undefined,
      accessNotes: "",
      attachmentNames: [],
      address: {
        district: districts[0]?.district ?? "",
        area: districts[0]?.areas[0] ?? "",
        buildingEstate: "",
        block: "",
        floor: "",
        flatRoom: "",
        landmarkNotes: "",
      },
    },
  });

  const selectedCategoryId = useWatch({
    control: form.control,
    name: "categoryId",
  });
  const selectedDistrict = useWatch({
    control: form.control,
    name: "address.district",
  });
  const subcategoryOptions = useMemo(
    () =>
      categoryOptions.find((entry) => entry.id === selectedCategoryId)
        ?.subcategories ?? [],
    [categoryOptions, selectedCategoryId],
  );
  const areaOptions = useMemo(
    () =>
      districts.find((entry) => entry.district === selectedDistrict)?.areas ??
      [],
    [districts, selectedDistrict],
  );

  const onSubmit = (values: RequestFormInput) => {
    setServerError(null);
    startTransition(async () => {
      const result = await createRequestAction({ locale, values });
      if (!result.ok) {
        setServerError(result.error ?? "Unable to create request.");
        return;
      }

      router.push(result.target ?? `/customer`);
    });
  };

  return (
    <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="rounded-2xl border border-line bg-soft-accent/45 p-4 text-sm">
        <p className="font-semibold">
          {locale === "en" ? "WhatsApp contact" : "WhatsApp 聯絡電話"}
        </p>
        <p className="mt-1 text-muted">
          {formatHongKongPhone(customerPhone)} ·{" "}
          {locale === "en"
            ? "Pros can use this number to contact you about this request. Email is optional."
            : "師傅可用此電話 WhatsApp 聯絡你跟進需求；電郵可留空。"}
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Field
          label={locale === "en" ? "Request title" : "請求標題"}
          error={form.formState.errors.title?.message}
        >
          <Input {...form.register("title")} />
        </Field>
        <Field
          label={locale === "en" ? "Urgency" : "緊急程度"}
          error={form.formState.errors.urgency?.message}
        >
          <Select {...form.register("urgency")}>
            <option value="asap">{locale === "en" ? "ASAP" : "盡快"}</option>
            <option value="today">{locale === "en" ? "Today" : "今天"}</option>
            <option value="tomorrow">
              {locale === "en" ? "Tomorrow" : "明天"}
            </option>
            <option value="scheduled">
              {locale === "en" ? "Scheduled" : "預約時間"}
            </option>
          </Select>
        </Field>
      </div>

      <Field
        label={locale === "en" ? "Description" : "問題描述"}
        error={form.formState.errors.description?.message}
      >
        <Textarea {...form.register("description")} />
      </Field>

      <div className="grid gap-5 md:grid-cols-2">
        <Field
          label={locale === "en" ? "Category" : "服務分類"}
          error={form.formState.errors.categoryId?.message}
        >
          <Select
            {...form.register("categoryId")}
            onChange={(event) => {
              form.setValue("categoryId", event.target.value);
              form.setValue(
                "subcategoryId",
                categoryOptions.find((entry) => entry.id === event.target.value)
                  ?.subcategories[0]?.id ?? "",
              );
            }}
          >
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={locale === "en" ? "Subcategory" : "子分類"}
          error={form.formState.errors.subcategoryId?.message}
        >
          <Select {...form.register("subcategoryId")}>
            {subcategoryOptions.map((subcategory) => (
              <option key={subcategory.id} value={subcategory.id}>
                {subcategory.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Field
          label={locale === "en" ? "District" : "地區"}
          error={form.formState.errors.address?.district?.message}
        >
          <Select
            {...form.register("address.district")}
            onChange={(event) => {
              form.setValue("address.district", event.target.value);
              form.setValue(
                "address.area",
                districts.find((entry) => entry.district === event.target.value)
                  ?.areas[0] ?? "",
              );
            }}
          >
            {districts.map((district) => (
              <option key={district.district} value={district.district}>
                {formatDistrictName(district.district, locale)}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={locale === "en" ? "Area" : "分區"}
          error={form.formState.errors.address?.area?.message}
        >
          <Select {...form.register("address.area")}>
            {areaOptions.map((area) => (
              <option key={area} value={area}>
                {formatAreaName(area, locale)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Field
          label={locale === "en" ? "Building / Estate" : "屋苑 / 大廈"}
          error={form.formState.errors.address?.buildingEstate?.message}
        >
          <Input {...form.register("address.buildingEstate")} />
        </Field>
        <Field label={locale === "en" ? "Block" : "座數"}>
          <Input {...form.register("address.block")} />
        </Field>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <Field label={locale === "en" ? "Floor" : "樓層"}>
          <Input {...form.register("address.floor")} />
        </Field>
        <Field label={locale === "en" ? "Flat / Room" : "室 / 單位"}>
          <Input {...form.register("address.flatRoom")} />
        </Field>
        <Field label={locale === "en" ? "Scheduled date" : "預約日期"}>
          <Input {...form.register("scheduledDate")} type="datetime-local" />
        </Field>
      </div>

      <Field label={locale === "en" ? "Access notes" : "出入備註"}>
        <Textarea {...form.register("accessNotes")} className="min-h-20" />
      </Field>

      <Field
        label={locale === "en" ? "Landmark / access notes" : "地標 / 路線提示"}
      >
        <Input {...form.register("address.landmarkNotes")} />
      </Field>

      <div className="grid gap-5 md:grid-cols-2">
        <Field label={locale === "en" ? "Budget min" : "預算下限"}>
          <Input {...form.register("budgetMin")} type="number" />
        </Field>
        <Field label={locale === "en" ? "Budget max" : "預算上限"}>
          <Input {...form.register("budgetMax")} type="number" />
        </Field>
      </div>

      {serverError ? (
        <p className="text-sm text-danger">{serverError}</p>
      ) : null}
      <Button
        className="w-full md:w-auto"
        type="submit"
        disabled={!isHydrated || isPending}
      >
        {isPending
          ? "..."
          : locale === "en"
            ? "Submit request"
            : "提交服務請求"}
      </Button>
    </form>
  );
}
