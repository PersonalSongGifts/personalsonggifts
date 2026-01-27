import { FormData } from "@/pages/CreateSong";

export interface OrderData {
  id: string;
  created_at: string;
  status: string;
  pricing_tier: string;
  price: number;
  expected_delivery: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  recipient_type: string;
  recipient_name: string;
  occasion: string;
  genre: string;
  singer_preference: string;
  special_qualities: string;
  favorite_memory: string;
  special_message: string | null;
  device_type: string | null;
}

function getDeviceType(): string {
  const userAgent = navigator.userAgent.toLowerCase();
  if (/mobile|android|iphone|ipad|tablet/.test(userAgent)) {
    return "Mobile";
  }
  return "Desktop";
}

export async function createOrder(
  formData: FormData,
  tier: "standard" | "priority",
  webhookUrl?: string
): Promise<{ orderId: string; expectedDelivery: Date }> {
  const deviceType = getDeviceType();

  // Call secure edge function instead of direct database insert
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-order`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({
        pricingTier: tier,
        customerName: formData.yourName,
        customerEmail: formData.yourEmail,
        customerPhone: formData.phoneNumber || undefined,
        recipientType: formData.recipientType,
        recipientName: formData.recipientName,
        occasion: formData.occasion,
        genre: formData.genre,
        singerPreference: formData.singerPreference,
        specialQualities: formData.specialQualities,
        favoriteMemory: formData.favoriteMemory,
        specialMessage: formData.specialMessage || undefined,
        deviceType,
      }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to create order. Please try again.");
  }

  const data = await response.json();
  const orderId = data.orderId;
  const expectedDelivery = new Date(data.expectedDelivery);

  // Send to Zapier webhook if provided
  if (webhookUrl) {
    try {
      await sendToZapier(webhookUrl, {
        orderId,
        createdAt: new Date().toISOString(),
        expectedDelivery: expectedDelivery.toISOString(),
        pricingTier: tier,
        price: tier === "priority" ? 79 : 49,
        customerName: formData.yourName,
        customerEmail: formData.yourEmail,
        customerPhone: formData.phoneNumber || "",
        recipientType: formData.recipientType,
        recipientName: formData.recipientName,
        occasion: formData.occasion,
        genre: formData.genre,
        singerPreference: formData.singerPreference,
        specialQualities: formData.specialQualities,
        favoriteMemory: formData.favoriteMemory,
        specialMessage: formData.specialMessage || "",
        deviceType,
      });
    } catch (webhookError) {
      // Log but don't fail - order is already saved in database
      console.error("Zapier webhook failed (order still saved):", webhookError);
    }
  }

  return { orderId, expectedDelivery };
}

async function sendToZapier(webhookUrl: string, payload: Record<string, unknown>): Promise<void> {
  await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    mode: "no-cors", // Handle CORS for Zapier
    body: JSON.stringify(payload),
  });
}
