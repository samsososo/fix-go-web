import { verifyStripeWebhookEvent } from "@/lib/stripe-billing";
import { processStripeWebhookEvent } from "@/lib/stripe-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function webhookResponse(status: number, code: string) {
  return Response.json(
    {
      received: status === 200,
      code,
    },
    { status },
  );
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return webhookResponse(400, "invalid_signature");
  }

  let event;
  try {
    const rawBody = await request.text();
    event = verifyStripeWebhookEvent({ rawBody, signature });
  } catch {
    return webhookResponse(400, "invalid_signature");
  }

  const result = await processStripeWebhookEvent(event);
  return webhookResponse(result.status, result.code);
}
