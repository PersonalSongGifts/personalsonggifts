import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Send, Loader2 } from "lucide-react";

interface TestEmailSenderProps {
  adminPassword: string;
}

type EmailTemplate = "lead_preview" | "lead_followup" | "order_confirmation" | "song_delivery";

const templateLabels: Record<EmailTemplate, { label: string; description: string }> = {
  lead_preview: {
    label: "Lead Preview Email",
    description: "Sent when a song preview is ready for a lead",
  },
  lead_followup: {
    label: "Lead Follow-up ($10 Off)",
    description: "Sent to leads who haven't converted yet",
  },
  order_confirmation: {
    label: "Order Confirmation",
    description: "Sent after successful payment",
  },
  song_delivery: {
    label: "Song Delivery",
    description: "Sent when the final song is ready",
  },
};

export function TestEmailSender({ adminPassword }: TestEmailSenderProps) {
  const [email, setEmail] = useState("ryan@hyperdrivelab.com");
  const [template, setTemplate] = useState<EmailTemplate>("lead_preview");
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const handleSendTest = async () => {
    if (!email.trim()) {
      toast({
        title: "Email required",
        description: "Please enter an email address",
        variant: "destructive",
      });
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-test-email", {
        body: { email, template, adminPassword },
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: "Test email sent!",
          description: `${templateLabels[template].label} sent to ${email}`,
        });
      } else {
        throw new Error(data?.error || "Failed to send email");
      }
    } catch (error) {
      console.error("Send test email error:", error);
      toast({
        title: "Failed to send",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Send Test Email
        </CardTitle>
        <CardDescription>
          Send any email template to yourself to preview exactly what customers receive
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Email Template</label>
          <Select value={template} onValueChange={(v) => setTemplate(v as EmailTemplate)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(templateLabels) as EmailTemplate[]).map((key) => (
                <SelectItem key={key} value={key}>
                  <div className="flex flex-col items-start">
                    <span>{templateLabels[key].label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {templateLabels[template].description}
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Send To</label>
          <Input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <Button
          onClick={handleSendTest}
          disabled={sending || !email.trim()}
          className="w-full"
        >
          {sending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Send Test Email
            </>
          )}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          Test emails are marked with "[TEST]" in the subject line
        </p>
      </CardContent>
    </Card>
  );
}
