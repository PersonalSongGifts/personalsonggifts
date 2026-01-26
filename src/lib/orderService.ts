import { supabase } from "@/integrations/supabase/client";
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
  relationship: string;
  special_qualities: string;
  favorite_memory: string;
  special_message: string | null;
  device_type: string | null;
}

function calculateExpectedDelivery(tier: "standard" | "priority"): Date {
  const now = new Date();
  if (tier === "priority") {
    // 3 hours from now
    return new Date(now.getTime() + 3 * 60 * 60 * 1000);
  }
  // 24 hours from now for standard
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
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
  const expectedDelivery = calculateExpectedDelivery(tier);
  const price = tier === "priority" ? 79 : 49;
  const deviceType = getDeviceType();

  // Insert into Supabase
  const { data, error } = await supabase
    .from("orders")
    .insert({
      pricing_tier: tier,
      price,
      expected_delivery: expectedDelivery.toISOString(),
      customer_name: formData.yourName,
      customer_email: formData.yourEmail,
      customer_phone: formData.phoneNumber || null,
      recipient_type: formData.recipientType,
      recipient_name: formData.recipientName,
      occasion: formData.occasion,
      genre: formData.genre,
      singer_preference: formData.singerPreference,
      relationship: formData.relationship,
      special_qualities: formData.specialQualities,
      favorite_memory: formData.favoriteMemory,
      special_message: formData.specialMessage || null,
      device_type: deviceType,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Error creating order:", error);
    throw new Error("Failed to create order. Please try again.");
  }

  const orderId = data.id;

  // Send to Zapier webhook if provided
  if (webhookUrl) {
    try {
      await sendToZapier(webhookUrl, {
        orderId,
        createdAt: new Date().toISOString(),
        expectedDelivery: expectedDelivery.toISOString(),
        pricingTier: tier,
        price,
        customerName: formData.yourName,
        customerEmail: formData.yourEmail,
        customerPhone: formData.phoneNumber || "",
        recipientType: formData.recipientType,
        recipientName: formData.recipientName,
        occasion: formData.occasion,
        genre: formData.genre,
        singerPreference: formData.singerPreference,
        relationship: formData.relationship,
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
