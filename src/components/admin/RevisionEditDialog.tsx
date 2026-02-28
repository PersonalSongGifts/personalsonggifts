import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

const LONG_TEXT_FIELDS = new Set([
  "special_qualities", "favorite_memory", "special_message", "style_notes", "anything_else", "sender_context",
]);

interface EditableField {
  key: string;
  label: string;
}

interface RevisionData {
  id: string;
  order_short_id?: string;
  fields_changed: string[];
  original_values: Record<string, any>;
  [key: string]: any;
}

interface RevisionEditDialogProps {
  revision: RevisionData | null;
  editableFields: EditableField[];
  processing: boolean;
  onClose: () => void;
  onSave: (revisionId: string, modifications: Record<string, string>) => void;
}

export function RevisionEditDialog({ revision, editableFields, processing, onClose, onSave }: RevisionEditDialogProps) {
  const changedFields = revision
    ? editableFields.filter(f => (revision.fields_changed || []).includes(f.key))
    : [];

  const [values, setValues] = useState<Record<string, string>>(() => {
    if (!revision) return {};
    const init: Record<string, string> = {};
    for (const f of changedFields) {
      init[f.key] = String(revision[f.key] ?? "");
    }
    return init;
  });

  // Re-init when revision changes
  const [prevId, setPrevId] = useState<string | null>(null);
  if (revision && revision.id !== prevId) {
    setPrevId(revision.id);
    const init: Record<string, string> = {};
    for (const f of changedFields) {
      init[f.key] = String(revision[f.key] ?? "");
    }
    setValues(init);
  }

  const handleSave = () => {
    if (!revision) return;
    // Only include fields the admin actually changed vs. the customer submission
    const modifications: Record<string, string> = {};
    for (const f of changedFields) {
      const customerVal = String(revision[f.key] ?? "");
      if (values[f.key] !== customerVal) {
        modifications[f.key] = values[f.key];
      }
    }
    onSave(revision.id, modifications);
  };

  return (
    <Dialog open={!!revision} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Revision — {revision?.order_short_id || "Order"}</DialogTitle>
          <DialogDescription>
            Modify values before approving. Only your changes will be applied as overrides.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {changedFields.map((field) => {
            const originalVal = String(revision?.original_values?.[field.key] ?? "—");
            const isLong = LONG_TEXT_FIELDS.has(field.key);

            return (
              <div key={field.key} className="space-y-1">
                <Label className="text-xs font-medium">{field.label}</Label>
                <p className="text-xs text-muted-foreground">
                  Was: <span className="line-through text-destructive/70">{originalVal.substring(0, 200)}</span>
                </p>
                {isLong ? (
                  <Textarea
                    value={values[field.key] ?? ""}
                    onChange={(e) => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                    rows={3}
                  />
                ) : (
                  <Input
                    value={values[field.key] ?? ""}
                    onChange={(e) => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                  />
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={processing}>Cancel</Button>
          <Button onClick={handleSave} disabled={processing} className="gap-1">
            {processing && <Loader2 className="h-3 w-3 animate-spin" />}
            Save &amp; Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
