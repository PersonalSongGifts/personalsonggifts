import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
<body style="margin: 0; padding: 0; background-color: #FDF8F3; font-family: 'Georgia', serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: linear-gradient(135deg, #1E3A5F 0%, #2C4A6E 100%); padding: 40px; text-align: center; border-radius: 12px 12px 0 0;">
      <h1 style="color: #FDF8F3; margin: 0; font-size: 32px; font-weight: normal;">🎵 Order Confirmed!</h1>
    </div>
    
    <div style="background-color: #FFFBF5; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
      <p style="color: #5D4E37; font-size: 18px; line-height: 1.6; margin-top: 0;">
        Dear ${sampleData.customerName},
      </p>
      
      <p style="color: #5D4E37; font-size: 16px; line-height: 1.6;">
        Thank you for your order! We're thrilled to create a personalized song for ${sampleData.recipientName}. Our talented musicians are already getting inspired.
      </p>
      
      <div style="background-color: #F5F8FB; border-left: 4px solid #1E3A5F; padding: 20px; margin: 30px 0; border-radius: 0 8px 8px 0;">
        <h2 style="color: #1E3A5F; margin: 0 0 15px 0; font-size: 18px;">Order Details</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="color: #5D4E37; padding: 8px 0; font-size: 14px;"><strong>Order ID:</strong></td>
            <td style="color: #5D4E37; padding: 8px 0; font-size: 14px;">${sampleData.orderId}</td>
          </tr>
          <tr>
            <td style="color: #5D4E37; padding: 8px 0; font-size: 14px;"><strong>For:</strong></td>
            <td style="color: #5D4E37; padding: 8px 0; font-size: 14px;">${sampleData.recipientName}</td>
          </tr>
          <tr>
            <td style="color: #5D4E37; padding: 8px 0; font-size: 14px;"><strong>Occasion:</strong></td>
            <td style="color: #5D4E37; padding: 8px 0; font-size: 14px;">${sampleData.occasion}</td>
          </tr>
          <tr>
            <td style="color: #5D4E37; padding: 8px 0; font-size: 14px;"><strong>Genre:</strong></td>
            <td style="color: #5D4E37; padding: 8px 0; font-size: 14px;">${sampleData.genre}</td>
          </tr>
          <tr>
            <td style="color: #5D4E37; padding: 8px 0; font-size: 14px;"><strong>Delivery:</strong></td>
            <td style="color: #5D4E37; padding: 8px 0; font-size: 14px;">${tierLabel}</td>
          </tr>
        </table>
      </div>
      
      <div style="background-color: #EEF3F8; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0;">
        <p style="color: #1E3A5F; margin: 0; font-size: 14px;">
          <strong>Expected Delivery:</strong><br>
          <span style="font-size: 16px;">by ${deliveryDate}</span>
        </p>
      </div>
      
      <p style="color: #5D4E37; font-size: 16px; line-height: 1.6;">
        We'll email you as soon as your song is ready. If you have any questions, just reply to this email.
      </p>
      
      <p style="color: #5D4E37; font-size: 16px; line-height: 1.6; margin-bottom: 0;">
        With love,<br>
        <strong style="color: #1E3A5F;">The Personal Song Gifts Team</strong> 🎶
      </p>
    </div>
    
    <div style="text-align: center; padding: 20px;">
      <p style="color: #6B7B8C; font-size: 12px; margin: 0;">
        © 2026 Personal Song Gifts. Made with ❤️
      </p>
    </div>
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
<body style="margin: 0; padding: 0; background-color: #FDF8F3; font-family: 'Georgia', serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: linear-gradient(135deg, #2E7D32 0%, #4CAF50 100%); padding: 40px; text-align: center; border-radius: 12px 12px 0 0;">
      <h1 style="color: #FFFFFF; margin: 0; font-size: 32px; font-weight: normal;">🎉 Your Song is Ready!</h1>
    </div>
    
    <div style="background-color: #FFFBF5; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
      <p style="color: #5D4E37; font-size: 18px; line-height: 1.6; margin-top: 0;">
        Dear ${sampleData.customerName},
      </p>
      
      <p style="color: #5D4E37; font-size: 16px; line-height: 1.6;">
        Great news! Your personalized ${sampleData.occasion} song for <strong>${sampleData.recipientName}</strong> is complete and ready to share!
      </p>
      
      <div style="text-align: center; margin: 40px 0;">
        <a href="${sampleData.songUrl}" style="display: inline-block; background: linear-gradient(135deg, #1E3A5F 0%, #2C4A6E 100%); color: #FDF8F3; text-decoration: none; padding: 18px 40px; font-size: 18px; border-radius: 30px; font-weight: bold; box-shadow: 0 4px 15px rgba(30, 58, 95, 0.3);">
          🎵 Listen to Your Song
        </a>
      </div>
      
      <div style="background-color: #F5F8FB; border-radius: 8px; padding: 20px; margin: 30px 0;">
        <h3 style="color: #1E3A5F; margin: 0 0 10px 0; font-size: 16px;">💡 Tips for Sharing</h3>
        <ul style="color: #5D4E37; font-size: 14px; line-height: 1.8; margin: 0; padding-left: 20px;">
          <li>Play it at your next celebration or gathering</li>
          <li>Send the link directly via text or messaging apps</li>
          <li>Download and save it forever</li>
          <li>Share on social media to spread the joy</li>
        </ul>
      </div>
      
      <div style="background-color: #EEF3F8; border-radius: 8px; padding: 15px; text-align: center; margin: 20px 0;">
        <p style="color: #1E3A5F; margin: 0; font-size: 14px;">
          <strong>Order ID:</strong> ${sampleData.orderId}
        </p>
      </div>
      
      <p style="color: #5D4E37; font-size: 16px; line-height: 1.6;">
        We hope this song brings joy and unforgettable memories! If you love it, we'd be honored if you shared your experience with friends and family.
      </p>
      
      <p style="color: #5D4E37; font-size: 16px; line-height: 1.6; margin-bottom: 0;">
        With love and music,<br>
        <strong style="color: #1E3A5F;">The Personal Song Gifts Team</strong> 🎶
      </p>
    </div>
    
    <div style="text-align: center; padding: 20px;">
      <p style="color: #6B7B8C; font-size: 12px; margin: 0;">
        © 2026 Personal Song Gifts. Made with ❤️<br>
        <a href="https://personalsonggifts.lovable.app" style="color: #1E3A5F;">Order another song</a>
      </p>
    </div>
  </div>
</body>
</html>
`;

export function EmailTemplates() {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-semibold">Email Templates</h2>
        <p className="text-muted-foreground mt-1">
          Preview how your transactional emails appear to customers
        </p>
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
