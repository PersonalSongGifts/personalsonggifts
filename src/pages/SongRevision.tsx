import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Loader2, Music, Pencil, ChevronDown, ChevronUp, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  occasionOptions,
  genreOptions,
  languageOptions,
} from "@/components/admin/adminDropdownOptions";

const recipientTypeOptions = [
  { id: "husband", label: "Husband" },
  { id: "wife", label: "Wife" },
  { id: "partner", label: "Partner" },
  { id: "parent", label: "Parent" },
  { id: "child", label: "Child" },
  { id: "friend", label: "Friend" },
  { id: "pet", label: "Pet" },
  { id: "myself", label: "Myself" },
  { id: "other", label: "Other" },
];


interface OrderData {
  id: string;
  recipient_name: string;
  customer_name: string;
  delivery_email: string;
  recipient_type: string;
  occasion: string;
  genre: string;
  singer_preference: string;
  language: string;
  recipient_name_pronunciation: string;
  special_qualities: string;
  favorite_memory: string;
  special_message: string;
  pricing_tier: string;
}

interface RevisionPageData {
  status: string;
  message?: string;
  form_type?: "post_delivery_redo" | "pre_delivery_update";
  revisions_remaining?: number;
  order?: OrderData;
  existing_revision?: any;
}

const SongRevision = () => {
  const { token } = useParams<{ token: string }>();
  const [pageData, setPageData] = useState<RevisionPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedFormType, setSubmittedFormType] = useState<string>("");
  const [submittedRevisionsRemaining, setSubmittedRevisionsRemaining] = useState(0);

  // Form state
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [editingFields, setEditingFields] = useState<Set<string>>(new Set());
  const [disclaimersChecked, setDisclaimersChecked] = useState<Record<string, boolean>>({});
  const [emptyFieldWarnings, setEmptyFieldWarnings] = useState<string[]>([]);
  const [confirmedEmpty, setConfirmedEmpty] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetchPageData();
  }, [token]);

  const fetchPageData = async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-revision-page?token=${token}`
      );
      const data = await response.json();
      setPageData(data);

      if (data.order) {
        const initial: Record<string, string> = {};
        for (const [key, val] of Object.entries(data.order)) {
          if (key !== "id" && key !== "pricing_tier") {
            initial[key] = (val as string) || "";
          }
        }
        // Pre-fill from existing pending revision if available
        if (data.existing_revision) {
          const rev = data.existing_revision;
          for (const key of Object.keys(initial)) {
            if (rev[key] !== null && rev[key] !== undefined) {
              initial[key] = rev[key];
            }
          }
          if (rev.style_notes) initial.style_notes = rev.style_notes;
          if (rev.tempo) initial.tempo = rev.tempo;
          if (rev.anything_else) initial.anything_else = rev.anything_else;
          if (rev.sender_context) initial.sender_context = rev.sender_context;
        }
        initial.style_notes = initial.style_notes || "";
        initial.tempo = initial.tempo || "";
        initial.anything_else = initial.anything_else || "";
        setFormValues(initial);
      }
    } catch {
      setPageData({ status: "error", message: "Failed to load page. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  const toggleField = (field: string) => {
    setEditingFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  };

  const updateField = (field: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
  };

  const isPostDelivery = pageData?.form_type === "post_delivery_redo";

  const postDeliveryDisclaimers = [
    { id: "replace", label: "My original song will be permanently replaced with the new version" },
    { id: "uses_revision", label: "I understand this uses my free revision — it cannot be undone" },
    { id: "unique", label: "Each remake is uniquely generated and will sound different from the original" },
    { id: "shared_link", label: "Anyone I've already shared the song link with will hear the new version" },
    { id: "trimmed", label: "If my requested changes don't all fit, some content may be trimmed" },
    { id: "tos", label: "I agree to the Terms of Service" },
  ];

  const preDeliveryDisclaimers = [
    { id: "timeline", label: "I understand changes may affect my delivery timeline" },
    { id: "trimmed", label: "If my requested changes don't all fit, some content may be trimmed" },
    { id: "tos", label: "I agree to the Terms of Service" },
  ];

  const disclaimers = isPostDelivery ? postDeliveryDisclaimers : preDeliveryDisclaimers;
  const allDisclaimersChecked = disclaimers.every((d) => disclaimersChecked[d.id]);

  const handleSubmit = async () => {
    if (!allDisclaimersChecked) {
      toast.error("Please agree to all disclaimers before submitting");
      return;
    }

    setSubmitting(true);
    setEmptyFieldWarnings([]);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-revision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            revision_token: token,
            ...formValues,
            _confirmed_empty: confirmedEmpty,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        if (data.error === "empty_fields" && !confirmedEmpty) {
          setEmptyFieldWarnings(data.fields || []);
          toast.error("Some fields were cleared — please confirm or restore them");
          setSubmitting(false);
          return;
        }
        toast.error(data.error || data.message || "Failed to submit revision");
        setSubmitting(false);
        return;
      }

      setSubmittedFormType(data.form_type);
      setSubmittedRevisionsRemaining(data.revisions_remaining || 0);
      setSubmitted(true);
    } catch {
      toast.error("Failed to submit revision. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <Music className="w-16 h-16 text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Submission confirmation
  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-lg w-full">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
              <Check className="h-8 w-8 text-primary" />
            </div>
            {submittedFormType === "post_delivery_redo" ? (
              <>
                <h1 className="text-2xl font-semibold mb-3 text-foreground">Revision Submitted!</h1>
                <p className="text-muted-foreground mb-4">
                  Thanks for your feedback! Our team is working on a new version of your song. You'll receive it within 12-24 hours.
                </p>
                {submittedRevisionsRemaining > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {submittedRevisionsRemaining} {submittedRevisionsRemaining === 1 ? "redo" : "redos"} remaining
                  </p>
                )}
              </>
            ) : (
              <>
                <h1 className="text-2xl font-semibold mb-3 text-foreground">Details Updated!</h1>
                <p className="text-muted-foreground mb-4">
                  Thanks for updating your details! Depending on where we are in the creation process, this may add up to 12-24 hours to your delivery time. We'll make sure everything is perfect.
                </p>
              </>
            )}
            <Link to="/">
              <Button variant="outline" className="mt-4">Return Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error / status states
  if (!pageData || pageData.status === "error") {
    return <StatusPage icon="error" title="Something went wrong" message={pageData?.message || "Please try again later."} />;
  }
  if (pageData.status === "not_found") {
    return <StatusPage icon="error" title="Page Not Found" message={pageData.message || "This page could not be found."} />;
  }
  if (pageData.status === "disabled") {
    return <StatusPage icon="info" title="Not Available" message={pageData.message!} />;
  }
  if (pageData.status === "expired") {
    return <StatusPage icon="info" title="Link Expired" message={pageData.message!} />;
  }
  if (pageData.status === "under_review") {
    return <StatusPage icon="info" title="Under Review" message={pageData.message!} />;
  }
  if (pageData.status === "processing") {
    return <StatusPage icon="loading" title="Your Revision Is In Progress" message={pageData.message!} />;
  }
  if (pageData.status === "no_revisions_left") {
    return <StatusPage icon="info" title="No Revisions Available" message={pageData.message!} />;
  }

  // Form states
  if ((pageData.status === "form" || pageData.status === "pending_revision") && pageData.order) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
        <div className="container max-w-2xl mx-auto px-4 py-8 md:py-16">
          <div className="text-center mb-8">
            <Music className="w-12 h-12 text-primary mx-auto mb-3" />
            <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
              {isPostDelivery ? "Song Remake Request" : "Add or Update Your Song Details"}
            </h1>
            {isPostDelivery && pageData.revisions_remaining !== undefined && (
              <p className="text-sm font-medium text-primary">
                {pageData.revisions_remaining} {pageData.revisions_remaining === 1 ? "redo" : "redos"} remaining
              </p>
            )}
          </div>

          {pageData.status === "pending_revision" && pageData.message && (
            <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <AlertCircle className="h-4 w-4 inline mr-2" />
              {pageData.message}
            </div>
          )}

          {isPostDelivery && (
            <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-5">
              <h3 className="text-sm font-bold text-amber-900 mb-3 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                Important — please read before submitting
              </h3>
              <ul className="space-y-2 text-sm text-amber-800">
                <li className="flex items-start gap-2">
                  <span className="mt-1 block h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                  Your original song will be <strong>permanently replaced</strong> with a new version
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 block h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                  You get <strong>1 redo</strong> — it cannot be undone
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 block h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                  Each remake is uniquely generated and <strong>will sound different</strong> from the original
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 block h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                  We can only rework what was in your original order — new details (names, stories, etc.) can't be guaranteed
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 block h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                  If your requested changes don't all fit, some content may be trimmed
                </li>
              </ul>
            </div>
          )}

          {emptyFieldWarnings.length > 0 && !confirmedEmpty && (
            <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm font-medium text-destructive mb-2">
                The following fields had content in your original order but are now empty:
              </p>
              <ul className="text-sm text-destructive list-disc list-inside mb-3">
                {emptyFieldWarnings.map((f) => (
                  <li key={f}>{f.replace(/_/g, " ")}</li>
                ))}
              </ul>
              <p className="text-sm text-muted-foreground mb-3">
                Removing content may affect your song quality. Are you sure?
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setConfirmedEmpty(true);
                  setEmptyFieldWarnings([]);
                }}
              >
                Yes, continue anyway
              </Button>
            </div>
          )}

          <div className="space-y-4">
            {/* Editable fields */}
            <EditableField
              label="Recipient Name"
              field="recipient_name"
              value={formValues.recipient_name}
              editing={editingFields.has("recipient_name")}
              onToggle={() => toggleField("recipient_name")}
              onChange={(v) => updateField("recipient_name", v)}
            />

            <EditableField
              label="Your Name (who the song is from)"
              field="customer_name"
              value={formValues.customer_name}
              editing={editingFields.has("customer_name")}
              onToggle={() => toggleField("customer_name")}
              onChange={(v) => updateField("customer_name", v)}
            />

            <EditableField
              label="Delivery Email"
              field="delivery_email"
              value={formValues.delivery_email}
              editing={editingFields.has("delivery_email")}
              onToggle={() => toggleField("delivery_email")}
              onChange={(v) => updateField("delivery_email", v)}
              type="email"
            />

            {/* Recipient Type */}
            <SelectField
              label="Relationship"
              value={formValues.recipient_type}
              options={recipientTypeOptions}
              onChange={(v) => updateField("recipient_type", v)}
            />

            {/* Occasion */}
            <SelectField
              label="Occasion"
              value={formValues.occasion}
              options={occasionOptions}
              onChange={(v) => updateField("occasion", v)}
            />

            {/* Genre */}
            <SelectField
              label="Genre / Music Style"
              value={formValues.genre}
              options={genreOptions}
              onChange={(v) => updateField("genre", v)}
            />

            {/* Singer Preference */}
            <Card>
              <CardContent className="pt-4 pb-4">
                <Label className="text-sm font-medium text-foreground mb-3 block">Singer Voice Preference</Label>
                <RadioGroup
                  value={formValues.singer_preference}
                  onValueChange={(v) => updateField("singer_preference", v)}
                  className="flex gap-4"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="male" id="singer-male" />
                    <Label htmlFor="singer-male" className="text-sm cursor-pointer">Male</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="female" id="singer-female" />
                    <Label htmlFor="singer-female" className="text-sm cursor-pointer">Female</Label>
                  </div>
                </RadioGroup>
              </CardContent>
            </Card>

            {/* Song Perspective / Sender Context */}
            <Card>
              <CardContent className="pt-4 pb-4">
                <Label className="text-sm font-medium text-foreground mb-1 block">Song Perspective / Sender Context</Label>
                <p className="text-xs text-muted-foreground mb-3">
                  Tell us about yourself so the lyrics fit. Example: "I'm a woman writing to my wife" or "I'm their daughter, not their son"
                </p>
                <Input
                  value={formValues.sender_context || ""}
                  onChange={(e) => updateField("sender_context", e.target.value)}
                  maxLength={200}
                  placeholder="e.g. I'm a woman writing to my wife"
                />
                <p className="text-xs text-muted-foreground mt-1 text-right">
                  {(formValues.sender_context || "").length}/200
                </p>
              </CardContent>
            </Card>

            {/* Language */}
            <SelectField
              label="Language"
              value={formValues.language}
              options={languageOptions}
              onChange={(v) => updateField("language", v)}
            />

            {/* Pronunciation */}
            <EditableField
              label="Name Pronunciation"
              field="recipient_name_pronunciation"
              value={formValues.recipient_name_pronunciation}
              editing={editingFields.has("recipient_name_pronunciation")}
              onToggle={() => toggleField("recipient_name_pronunciation")}
              onChange={(v) => updateField("recipient_name_pronunciation", v)}
              helperText="How should this name sound? Spell it out how it should be pronounced. Example: 'Mishell' instead of 'Michelle'"
              secondaryHelper="Not sure how to spell it? Just describe how it sounds — for example, 'the A sounds like the A in day' or 'rhymes with tall'"
            />

            {/* Text areas */}
            <TextAreaField
              label="Special Qualities"
              field="special_qualities"
              value={formValues.special_qualities}
              onChange={(v) => updateField("special_qualities", v)}
              maxLength={250}
            />

            <TextAreaField
              label="Favorite Memory"
              field="favorite_memory"
              value={formValues.favorite_memory}
              onChange={(v) => updateField("favorite_memory", v)}
              maxLength={250}
            />

            <TextAreaField
              label="Special Message"
              field="special_message"
              value={formValues.special_message}
              onChange={(v) => updateField("special_message", v)}
              maxLength={250}
            />

            {/* Style / vibe changes */}
            <TextAreaField
              label="Style / Vibe Changes"
              field="style_notes"
              value={formValues.style_notes}
              onChange={(v) => updateField("style_notes", v)}
              maxLength={500}
              placeholder="Describe any changes to the feel, energy, or style you'd like..."
            />


            {/* Anything else */}
            <TextAreaField
              label="Anything Else?"
              field="anything_else"
              value={formValues.anything_else}
              onChange={(v) => updateField("anything_else", v)}
              maxLength={500}
              placeholder="Any other notes or requests..."
            />

            {/* Disclaimers */}
            <Card className="border-primary/20">
              <CardContent className="pt-4 pb-4">
                <h3 className="text-sm font-semibold text-foreground mb-4">Before you submit</h3>
                <div className="space-y-3">
                  {disclaimers.map((d) => (
                    <div key={d.id} className="flex items-start gap-3">
                      <Checkbox
                        id={`disclaimer-${d.id}`}
                        checked={disclaimersChecked[d.id] || false}
                        onCheckedChange={(checked) =>
                          setDisclaimersChecked((prev) => ({ ...prev, [d.id]: !!checked }))
                        }
                      />
                      <Label
                        htmlFor={`disclaimer-${d.id}`}
                        className="text-sm text-muted-foreground cursor-pointer leading-relaxed"
                      >
                        {d.id === "tos" ? (
                          <>I agree to the <Link to="/terms" target="_blank" className="text-primary underline hover:text-primary/80">Terms of Service</Link></>
                        ) : (
                          d.label
                        )}
                      </Label>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Submit */}
            <Button
              onClick={handleSubmit}
              disabled={submitting || !allDisclaimersChecked}
              size="lg"
              className="w-full"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Submitting...
                </>
              ) : isPostDelivery ? (
                "Submit Revision Request"
              ) : (
                "Update My Song Details"
              )}
            </Button>
          </div>

          {/* Footer */}
          <div className="text-center mt-8 pt-6 border-t">
            <p className="text-sm text-muted-foreground">
              Need help? Contact{" "}
              <a href="mailto:support@personalsonggifts.com" className="text-primary underline">
                support@personalsonggifts.com
              </a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <StatusPage icon="error" title="Something went wrong" message="Please try again later." />;
};

// Helper components

function StatusPage({ icon, title, message }: { icon: "error" | "info" | "loading"; title: string; message: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6 text-center">
          {icon === "loading" ? (
            <Loader2 className="w-12 h-12 text-primary mx-auto mb-4 animate-spin" />
          ) : icon === "error" ? (
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          ) : (
            <Music className="w-12 h-12 text-primary mx-auto mb-4" />
          )}
          <h1 className="text-xl font-semibold mb-2 text-foreground">{title}</h1>
          <p className="text-muted-foreground mb-6">{message}</p>
          <Link to="/">
            <Button variant="outline">Go Home</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function EditableField({
  label,
  field,
  value,
  editing,
  onToggle,
  onChange,
  type = "text",
  helperText,
  secondaryHelper,
}: {
  label: string;
  field: string;
  value: string;
  editing: boolean;
  onToggle: () => void;
  onChange: (v: string) => void;
  type?: string;
  helperText?: string;
  secondaryHelper?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between mb-1">
          <Label className="text-sm font-medium text-foreground">{label}</Label>
          <Button variant="ghost" size="sm" onClick={onToggle} className="gap-1 text-xs h-7">
            {editing ? <ChevronUp className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
            {editing ? "Close" : "Edit"}
          </Button>
        </div>
        {editing ? (
          <div>
            <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1" />
            {helperText && <p className="text-xs text-muted-foreground mt-2">{helperText}</p>}
            {secondaryHelper && <p className="text-xs text-muted-foreground mt-1 italic">{secondaryHelper}</p>}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground truncate">{value || "—"}</p>
        )}
      </CardContent>
    </Card>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <Label className="text-sm font-medium text-foreground mb-2 block">{label}</Label>
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt.id} value={opt.id}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
}

function TextAreaField({
  label,
  field,
  value,
  onChange,
  maxLength,
  placeholder,
}: {
  label: string;
  field: string;
  value: string;
  onChange: (v: string) => void;
  maxLength: number;
  placeholder?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <Label className="text-sm font-medium text-foreground mb-2 block">{label}</Label>
        <Textarea
          value={value}
          onChange={(e) => {
            if (e.target.value.length <= maxLength) onChange(e.target.value);
          }}
          placeholder={placeholder}
          rows={3}
        />
        <p className="text-xs text-muted-foreground text-right mt-1">
          {(value || "").length}/{maxLength}
        </p>
      </CardContent>
    </Card>
  );
}

export default SongRevision;
