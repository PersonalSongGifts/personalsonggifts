import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TestEmailSender } from "./TestEmailSender";

interface EmailTemplatesProps {
  adminPassword: string;
}

// Sample data for previews
const sampleData = {
  orderId: "ABC12345",
  customerName: "Sarah Johnson",
  recipientName: "Mom",
  occasion: "Mother's Day",
  genre: "Acoustic Pop",
  pricingTier: "priority",
  expectedDelivery: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  songUrl: "https://drive.google.com/file/d/example/view",
};

const tierLabel = sampleData.pricingTier === "priority" ? "Priority (24-hour)" : "Standard (48-hour)";
const deliveryDate = new Date(sampleData.expectedDelivery).toLocaleDateString("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "America/New_York",
});

// Order Confirmation Email Template (from send-order-confirmation edge function)
const orderConfirmationHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: Arial, Helvetica, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <p style="color: #1E3A5F; font-size: 22px; font-weight: bold; margin: 0 0 30px 0;">Order Confirmed</p>
    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">Dear ${sampleData.customerName},</p>
    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      Thank you for your order! We're creating a personalized ${sampleData.occasion} song for <strong>${sampleData.recipientName}</strong> and our team is already getting started.
    </p>
    <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
      <tr style="border-bottom: 1px solid #eeeeee;">
        <td style="color: #555555; padding: 10px 0; font-size: 14px; width: 40%;"><strong>Order ID</strong></td>
        <td style="color: #333333; padding: 10px 0; font-size: 14px;">${sampleData.orderId}</td>
      </tr>
      <tr style="border-bottom: 1px solid #eeeeee;">
        <td style="color: #555555; padding: 10px 0; font-size: 14px;"><strong>Song for</strong></td>
        <td style="color: #333333; padding: 10px 0; font-size: 14px;">${sampleData.recipientName}</td>
      </tr>
      <tr style="border-bottom: 1px solid #eeeeee;">
        <td style="color: #555555; padding: 10px 0; font-size: 14px;"><strong>Occasion</strong></td>
        <td style="color: #333333; padding: 10px 0; font-size: 14px;">${sampleData.occasion}</td>
      </tr>
      <tr style="border-bottom: 1px solid #eeeeee;">
        <td style="color: #555555; padding: 10px 0; font-size: 14px;"><strong>Genre</strong></td>
        <td style="color: #333333; padding: 10px 0; font-size: 14px;">${sampleData.genre}</td>
      </tr>
      <tr>
        <td style="color: #555555; padding: 10px 0; font-size: 14px;"><strong>Delivery</strong></td>
        <td style="color: #333333; padding: 10px 0; font-size: 14px;">${tierLabel} — by ${deliveryDate}</td>
      </tr>
    </table>
    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      We'll email you as soon as your song is ready. If you have any questions, just reply to this email.
    </p>
    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 40px 0;">
      Warm regards,<br>The Personal Song Gifts Team
    </p>
    <hr style="border: none; border-top: 1px solid #eeeeee; margin: 0 0 20px 0;">
    <p style="color: #999999; font-size: 12px; margin: 0;">Personal Song Gifts &bull; 2108 N ST STE N, SACRAMENTO, CA 95816</p>
  </div>
</body>
</html>
`;

// Song Delivery Email Template (from send-song-delivery edge function)
const songDeliveryHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: Arial, Helvetica, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <p style="color: #1E3A5F; font-size: 22px; font-weight: bold; margin: 0 0 30px 0;">Your song is ready!</p>
    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">Dear ${sampleData.customerName},</p>
    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      Your personalized ${sampleData.occasion} song for <strong>${sampleData.recipientName}</strong> is complete and ready to share!
    </p>
    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 8px 0;"><strong>Listen here:</strong></p>
    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
      <a href="${sampleData.songUrl}" style="color: #1E3A5F;">${sampleData.songUrl}</a>
    </p>
    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      From the song page you can listen, download, and share with friends and family. We hope it brings joy!
    </p>
    <p style="color: #555555; font-size: 14px; margin: 0 0 4px 0;"><strong>Order ID:</strong> ${sampleData.orderId}</p>
    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 30px 0 40px 0;">
      Warm regards,<br>The Personal Song Gifts Team
    </p>
    <hr style="border: none; border-top: 1px solid #eeeeee; margin: 0 0 20px 0;">
    <p style="color: #999999; font-size: 12px; margin: 0;">Personal Song Gifts &bull; 2108 N ST STE N, SACRAMENTO, CA 95816</p>
  </div>
</body>
</html>
`;

export function EmailTemplates({ adminPassword }: EmailTemplatesProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-semibold">Email Templates</h2>
        <p className="text-muted-foreground mt-1">
          Preview how your transactional emails appear to customers
        </p>
      </div>

      {/* Test Email Sender - at the top */}
      <div className="max-w-md mx-auto">
        <TestEmailSender adminPassword={adminPassword} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Order Confirmation Email */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Order Confirmation</CardTitle>
            <CardDescription>
              Sent automatically after successful payment
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden bg-muted/30">
              <iframe
                srcDoc={orderConfirmationHtml}
                title="Order Confirmation Email Preview"
                className="w-full h-[600px] border-0"
                sandbox="allow-same-origin"
              />
            </div>
          </CardContent>
        </Card>

        {/* Song Delivery Email */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Song Delivery</CardTitle>
            <CardDescription>
              Sent when you deliver a completed song
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden bg-muted/30">
              <iframe
                srcDoc={songDeliveryHtml}
                title="Song Delivery Email Preview"
                className="w-full h-[600px] border-0"
                sandbox="allow-same-origin"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-muted/50">
        <CardContent className="py-4">
          <p className="text-sm text-muted-foreground text-center">
            💡 <strong>Tip:</strong> To edit these templates, describe your changes in chat (e.g., "change the header color to purple" or "add a phone number to the footer").
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
