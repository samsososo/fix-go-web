"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { type FieldPath, useForm, useWatch } from "react-hook-form";

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

const REQUEST_STEPS = ["job", "address", "review"] as const;

function requestError(
  locale: string,
  field: string,
  error?: { message?: string },
) {
  if (!error) {
    return undefined;
  }

  const messages =
    locale === "en"
      ? {
          title: "Enter a title with at least 5 characters.",
          description: "Describe the problem in at least 20 characters.",
          buildingEstate: "Enter the building or estate name.",
          scheduledDate: "Choose a preferred appointment date and time.",
          budget: "Enter an amount of zero or above.",
          generic: "Check this field and try again.",
        }
      : {
          title: "請輸入至少 5 個字嘅標題。",
          description: "請用至少 20 個字描述問題。",
          buildingEstate: "請輸入屋苑或大廈名稱。",
          scheduledDate: "請選擇預約日期及時間。",
          budget: "請輸入零或以上嘅金額。",
          generic: "請檢查呢一欄再試。",
        };

  if (field === "title") return messages.title;
  if (field === "description") return messages.description;
  if (field === "buildingEstate") return messages.buildingEstate;
  if (field === "scheduledDate") return messages.scheduledDate;
  if (field === "budgetMax" && error.message?.includes("Maximum budget")) {
    return locale === "en"
      ? "The maximum budget must be the same as or above the minimum."
      : "預算上限唔可以低過預算下限。";
  }
  if (field === "budgetMin" || field === "budgetMax") return messages.budget;
  return messages.generic;
}

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
  const [step, setStep] = useState(0);
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
  const selectedUrgency = useWatch({
    control: form.control,
    name: "urgency",
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
  const stepTitles =
    locale === "en"
      ? ["Job", "Address", "Review"]
      : ["工作資料", "地址", "確認"];
  const stepLabels =
    locale === "en" ? ["Job", "Address", "Review"] : ["工作", "地址", "確認"];
  const optionalLabel = locale === "en" ? "Optional" : "選填";

  const moveToStep = (nextStep: number) => {
    setStep(nextStep);
    window.requestAnimationFrame(() => {
      document
        .getElementById("request-form-progress")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const goToNextStep = async () => {
    const fieldsByStep: FieldPath<RequestFormValues>[][] = [
      ["title", "urgency", "description", "categoryId", "subcategoryId"],
      [
        "address.district",
        "address.area",
        "address.buildingEstate",
        "address.block",
        "address.floor",
        "address.flatRoom",
      ],
    ];
    const fields = fieldsByStep[step] ?? [];
    let isValid = await form.trigger(fields, { shouldFocus: true });

    if (
      step === 0 &&
      selectedUrgency === "scheduled" &&
      !form.getValues("scheduledDate")
    ) {
      form.setError("scheduledDate", {
        type: "manual",
        message: "Scheduled date required",
      });
      isValid = false;
    }

    if (isValid) {
      moveToStep(Math.min(step + 1, REQUEST_STEPS.length - 1));
    }
  };

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

  const reviewValues = form.getValues();
  const reviewCategory = categoryOptions.find(
    (entry) => entry.id === reviewValues.categoryId,
  );
  const reviewSubcategory = reviewCategory?.subcategories.find(
    (entry) => entry.id === reviewValues.subcategoryId,
  );
  const urgencyRegistration = form.register("urgency");

  return (
    <form
      className="space-y-4"
      aria-label={locale === "en" ? "Service request form" : "服務請求表格"}
      onSubmit={(event) => {
        if (step < REQUEST_STEPS.length - 1) {
          event.preventDefault();
          void goToNextStep();
          return;
        }
        void form.handleSubmit(onSubmit)(event);
      }}
    >
      <div className="rounded-[24px] border border-line/70 bg-card/90 p-4 shadow-[0_12px_34px_rgba(24,36,51,0.06)] sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
        <div id="request-form-progress" className="scroll-mt-24">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                {locale === "en"
                  ? `Step ${step + 1} of ${REQUEST_STEPS.length}`
                  : `第 ${step + 1} 步，共 ${REQUEST_STEPS.length} 步`}
              </p>
              <h2 className="mt-1 font-display text-xl font-bold sm:text-2xl">
                {stepTitles[step]}
              </h2>
            </div>
            <span className="text-sm font-semibold text-muted">
              {Math.round(((step + 1) / REQUEST_STEPS.length) * 100)}%
            </span>
          </div>
          <ol
            className="mt-4 grid grid-cols-3 gap-2"
            aria-label={locale === "en" ? "Request progress" : "請求進度"}
          >
            {REQUEST_STEPS.map((requestStep, index) => (
              <li
                key={requestStep}
                aria-current={index === step ? "step" : undefined}
              >
                <span
                  className={`flex min-h-10 items-center justify-center gap-1 rounded-xl px-2 text-[11px] font-semibold transition sm:text-sm ${
                    index === step
                      ? "bg-primary text-white"
                      : index < step
                        ? "bg-primary/12 text-primary"
                        : "bg-soft-accent/55 text-muted"
                  }`}
                >
                  {index < step ? (
                    <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                  <span className="truncate">{stepLabels[index]}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        {step === 0 ? (
          <div className="mt-6 space-y-5">
            <Field
              label={locale === "en" ? "Request title" : "請求標題"}
              hint={
                locale === "en"
                  ? "Example: Living-room air conditioner is leaking"
                  : "例如：客廳冷氣機滴水"
              }
              error={requestError(locale, "title", form.formState.errors.title)}
              required
            >
              <Input
                {...form.register("title")}
                autoComplete="off"
                placeholder={
                  locale === "en" ? "What needs fixing?" : "有咩需要維修？"
                }
              />
            </Field>

            <Field
              label={locale === "en" ? "Description" : "問題描述"}
              hint={
                locale === "en"
                  ? "Include what happened, when it started and anything the pro should know."
                  : "可以講埋幾時開始、目前情況，同師傅要注意嘅地方。"
              }
              error={requestError(
                locale,
                "description",
                form.formState.errors.description,
              )}
              required
            >
              <Textarea
                {...form.register("description")}
                placeholder={
                  locale === "en"
                    ? "Describe the problem in detail"
                    : "詳細描述問題"
                }
              />
            </Field>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <Field
                label={locale === "en" ? "Category" : "服務分類"}
                error={requestError(
                  locale,
                  "categoryId",
                  form.formState.errors.categoryId,
                )}
                required
              >
                <Select
                  {...form.register("categoryId")}
                  onChange={(event) => {
                    form.setValue("categoryId", event.target.value);
                    form.setValue(
                      "subcategoryId",
                      categoryOptions.find(
                        (entry) => entry.id === event.target.value,
                      )?.subcategories[0]?.id ?? "",
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
                label={locale === "en" ? "Type of work" : "工作種類"}
                error={requestError(
                  locale,
                  "subcategoryId",
                  form.formState.errors.subcategoryId,
                )}
                required
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

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={locale === "en" ? "Urgency" : "幾時需要"}
                error={requestError(
                  locale,
                  "urgency",
                  form.formState.errors.urgency,
                )}
                required
              >
                <Select
                  {...urgencyRegistration}
                  onChange={(event) => {
                    void urgencyRegistration.onChange(event);
                    if (event.target.value !== "scheduled") {
                      form.setValue("scheduledDate", "");
                      form.clearErrors("scheduledDate");
                    }
                  }}
                >
                  <option value="asap">
                    {locale === "en" ? "As soon as possible" : "盡快"}
                  </option>
                  <option value="today">
                    {locale === "en" ? "Today" : "今天"}
                  </option>
                  <option value="tomorrow">
                    {locale === "en" ? "Tomorrow" : "明天"}
                  </option>
                  <option value="scheduled">
                    {locale === "en" ? "Choose a date" : "選擇日期"}
                  </option>
                </Select>
              </Field>

              {selectedUrgency === "scheduled" ? (
                <Field
                  label={locale === "en" ? "Preferred date" : "預約日期"}
                  error={requestError(
                    locale,
                    "scheduledDate",
                    form.formState.errors.scheduledDate,
                  )}
                  required
                >
                  <Input
                    {...form.register("scheduledDate")}
                    type="datetime-local"
                  />
                </Field>
              ) : null}
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="mt-6 space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <Field
                label={locale === "en" ? "District" : "地區"}
                error={requestError(
                  locale,
                  "district",
                  form.formState.errors.address?.district,
                )}
                required
              >
                <Select
                  {...form.register("address.district")}
                  onChange={(event) => {
                    form.setValue("address.district", event.target.value);
                    form.setValue(
                      "address.area",
                      districts.find(
                        (entry) => entry.district === event.target.value,
                      )?.areas[0] ?? "",
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
                error={requestError(
                  locale,
                  "area",
                  form.formState.errors.address?.area,
                )}
                required
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

            <div className="grid gap-4 sm:grid-cols-[1.4fr_0.6fr]">
              <Field
                label={locale === "en" ? "Building / Estate" : "屋苑 / 大廈"}
                error={requestError(
                  locale,
                  "buildingEstate",
                  form.formState.errors.address?.buildingEstate,
                )}
                required
              >
                <Input
                  {...form.register("address.buildingEstate")}
                  autoComplete="address-line1"
                />
              </Field>
              <Field
                label={locale === "en" ? "Block" : "座數"}
                optionalLabel={optionalLabel}
              >
                <Input
                  {...form.register("address.block")}
                  autoComplete="address-line2"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <Field
                label={locale === "en" ? "Floor" : "樓層"}
                optionalLabel={optionalLabel}
              >
                <Input {...form.register("address.floor")} />
              </Field>
              <Field
                label={locale === "en" ? "Flat / Room" : "室 / 單位"}
                optionalLabel={optionalLabel}
              >
                <Input {...form.register("address.flatRoom")} />
              </Field>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="mt-6 space-y-5">
            <div className="rounded-2xl border border-primary/15 bg-surface-tint/72 p-4">
              <p className="text-sm font-semibold text-primary">
                {locale === "en" ? "Request summary" : "請求摘要"}
              </p>
              <p className="mt-2 font-display text-lg font-bold">
                {reviewValues.title}
              </p>
              <p className="mt-1 text-sm leading-6 text-muted">
                {[reviewCategory?.label, reviewSubcategory?.label]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p className="mt-1 text-sm leading-6 text-muted">
                {formatDistrictName(reviewValues.address.district, locale)} ·{" "}
                {formatAreaName(reviewValues.address.area, locale)} ·{" "}
                {reviewValues.address.buildingEstate}
              </p>
            </div>

            <div className="rounded-2xl border border-line bg-soft-accent/45 p-4 text-sm">
              <p className="font-semibold">
                {locale === "en" ? "WhatsApp contact" : "WhatsApp 聯絡電話"}
              </p>
              <p className="mt-1 leading-6 text-muted">
                {formatHongKongPhone(customerPhone)} ·{" "}
                {locale === "en"
                  ? "Pros can use this number to follow up on this request."
                  : "師傅可用呢個電話透過 WhatsApp 聯絡你跟進。"}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <Field
                label={locale === "en" ? "Budget from" : "預算下限"}
                optionalLabel={optionalLabel}
                error={requestError(
                  locale,
                  "budgetMin",
                  form.formState.errors.budgetMin,
                )}
              >
                <Input
                  {...form.register("budgetMin")}
                  type="number"
                  min="0"
                  inputMode="numeric"
                  placeholder="HK$"
                />
              </Field>
              <Field
                label={locale === "en" ? "Budget to" : "預算上限"}
                optionalLabel={optionalLabel}
                error={requestError(
                  locale,
                  "budgetMax",
                  form.formState.errors.budgetMax,
                )}
              >
                <Input
                  {...form.register("budgetMax")}
                  type="number"
                  min="0"
                  inputMode="numeric"
                  placeholder="HK$"
                />
              </Field>
            </div>

            <details className="rounded-2xl border border-line/70 bg-white/70 p-4">
              <summary className="min-h-11 cursor-pointer py-2 font-semibold text-foreground">
                {locale === "en"
                  ? "More access details"
                  : "其他出入資料（選填）"}
              </summary>
              <div className="mt-4 space-y-5 border-t border-line/70 pt-4">
                <Field
                  label={locale === "en" ? "Access notes" : "出入備註"}
                  optionalLabel={optionalLabel}
                >
                  <Textarea
                    {...form.register("accessNotes")}
                    className="min-h-24"
                  />
                </Field>
                <Field
                  label={
                    locale === "en"
                      ? "Landmark / route hint"
                      : "地標 / 路線提示"
                  }
                  optionalLabel={optionalLabel}
                >
                  <Input {...form.register("address.landmarkNotes")} />
                </Field>
              </div>
            </details>

            <p className="text-sm leading-6 text-muted">
              {locale === "en"
                ? "Submitting a request does not involve payment. You can review incoming quotes before accepting one."
                : "提交請求毋須付款；收到報價後，你可以先比較再決定接受邊一份。"}
            </p>
          </div>
        ) : null}
      </div>

      {serverError ? (
        <p
          className="rounded-2xl border border-danger/20 bg-danger/8 p-4 text-sm text-danger"
          role="alert"
        >
          {serverError}
        </p>
      ) : null}

      <div className="grid gap-3 rounded-2xl border border-line/80 bg-[#fffdf8]/96 p-3 shadow-[0_10px_28px_rgba(24,36,51,0.06)] sm:grid-cols-2 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
        {step > 0 ? (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => moveToStep(step - 1)}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {locale === "en" ? "Back" : "上一步"}
          </Button>
        ) : null}

        {step < REQUEST_STEPS.length - 1 ? (
          <Button
            type="button"
            className="w-full sm:col-start-2"
            onClick={() => void goToNextStep()}
          >
            {locale === "en" ? "Continue" : "下一步"}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        ) : (
          <Button
            className="w-full"
            type="submit"
            disabled={!isHydrated || isPending}
          >
            {isPending
              ? locale === "en"
                ? "Submitting..."
                : "提交中..."
              : locale === "en"
                ? "Submit request"
                : "提交服務請求"}
          </Button>
        )}
      </div>
    </form>
  );
}
