import { FormData, FormErrors } from "@/pages/CreateSong";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { User, Mail, Shield, Phone } from "lucide-react";

interface YourDetailsStepProps {
  formData: FormData;
  updateFormData: (updates: Partial<FormData>) => void;
  errors: FormErrors;
}

const YourDetailsStep = ({ formData, updateFormData, errors }: YourDetailsStepProps) => {
  return (
    <div className="space-y-8">
      {/* Your name */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <User className="h-5 w-5 text-primary" />
          <Label htmlFor="yourName" className="text-lg font-semibold">
            Your name <span className="text-destructive">*</span>
          </Label>
        </div>
        <Input
          id="yourName"
          value={formData.yourName}
          onChange={(e) => updateFormData({ yourName: e.target.value })}
          placeholder="Enter your first name"
          className={`text-lg py-6 ${errors.yourName ? "border-destructive" : ""}`}
        />
        {errors.yourName && (
          <p className="text-destructive text-sm">{errors.yourName}</p>
        )}
        <p className="text-sm text-muted-foreground">
          So we know who this special gift is from.
        </p>
      </div>

      {/* Email */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          <Label htmlFor="yourEmail" className="text-lg font-semibold">
            Your email <span className="text-destructive">*</span>
          </Label>
        </div>
        <Input
          id="yourEmail"
          type="email"
          value={formData.yourEmail}
          onChange={(e) => updateFormData({ yourEmail: e.target.value })}
          placeholder="your@email.com"
          className={`text-lg py-6 ${errors.yourEmail ? "border-destructive" : ""}`}
        />
        {errors.yourEmail && (
          <p className="text-destructive text-sm">{errors.yourEmail}</p>
        )}
        <p className="text-sm text-muted-foreground">
          We'll deliver your completed song here. We never share your email.
        </p>
      </div>

      {/* Phone number (optional) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Phone className="h-5 w-5 text-primary" />
          <Label htmlFor="phoneNumber" className="text-lg font-semibold">
            Phone number <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
        </div>
        <Input
          id="phoneNumber"
          type="tel"
          value={formData.phoneNumber}
          onChange={(e) => updateFormData({ phoneNumber: e.target.value })}
          placeholder="(555) 123-4567"
          className="text-lg py-6"
        />
        <p className="text-sm text-muted-foreground">
          Optional — for SMS delivery of your song link.
        </p>
        {formData.phoneNumber && (
          <div className="flex items-start gap-3 mt-3 p-3 bg-secondary/30 rounded-lg">
            <Checkbox
              id="sms-opt-in"
              checked={formData.smsOptIn}
              onCheckedChange={(checked) => updateFormData({ smsOptIn: checked === true })}
              className="mt-0.5"
            />
            <div>
              <label htmlFor="sms-opt-in" className="text-sm font-medium text-foreground cursor-pointer">
                Text me my song link (optional)
              </label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Msg & data rates may apply.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Privacy note */}
      <div className="bg-secondary/50 rounded-lg p-4 flex items-start gap-3">
        <Shield className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-medium text-foreground text-sm">Your privacy matters</p>
          <p className="text-sm text-muted-foreground">
            Your story and personal details are handled with care and never shared publicly.
          </p>
        </div>
      </div>
    </div>
  );
};

export default YourDetailsStep;
