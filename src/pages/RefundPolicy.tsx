import Layout from "@/components/layout/Layout";
import { Link } from "react-router-dom";

const RefundPolicy = () => {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-2">
          Refund & Remake Policy
        </h1>
        <p className="text-muted-foreground mb-10">Last updated: July 8, 2026</p>

        <div className="prose prose-sm max-w-none text-foreground space-y-8">
          <section>
            <h2 className="text-xl font-semibold mb-3">We want you to love your song</h2>
            <p className="text-muted-foreground leading-relaxed">
              Every song we create is a one-of-a-kind piece of art built from your story. If the first version doesn't quite land, we'll happily craft you a <strong>complimentary remake</strong>. Just reply to your delivery email within 7 days and tell us what to change — a different feel, a new lyric direction, a fresh vocal — and we'll make it right.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Free remake — how it works</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>One complimentary remake per order if you're not happy with your song.</li>
              <li>Email <a href="mailto:support@personalsonggifts.com" className="text-primary hover:underline">support@personalsonggifts.com</a> within 7 days of delivery with your order number and what you'd like changed.</li>
              <li>You can also make quick self-service edits directly from your song page.</li>
              <li>Remakes are typically delivered within 48 hours (24 hours for priority orders).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Refunds</h2>
            <p className="text-muted-foreground leading-relaxed">
              Because every song is custom-made and production begins the moment you check out, <strong>all sales are final once song generation has started</strong>. We're only able to issue refunds in two situations:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2 mt-2">
              <li><strong>Technical failure:</strong> we were unable to deliver a completed song to you.</li>
              <li><strong>Duplicate charge:</strong> you were billed more than once for the same order.</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-3">
              In either case, reach out to <a href="mailto:support@personalsonggifts.com" className="text-primary hover:underline">support@personalsonggifts.com</a> and we'll resolve it quickly. Approved refunds are returned to the original payment method within 5–10 business days.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Add-ons & upgrades</h2>
            <p className="text-muted-foreground leading-relaxed">
              Optional add-ons (Forever Memory Package, Rush Delivery, bonus tracks, downloads, lyric unlocks, tips) are part of your custom order and follow the same policy: covered by the free-remake promise, non-refundable once fulfilled, except in the case of a technical failure or duplicate charge.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Questions?</h2>
            <p className="text-muted-foreground leading-relaxed">
              We're a small team and we read every email. Write to us at <a href="mailto:support@personalsonggifts.com" className="text-primary hover:underline">support@personalsonggifts.com</a> — we typically reply within 24 hours.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-3">
              For the full legal text, see our <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link> (§7 Refunds and §9 Satisfaction Guarantee).
            </p>
          </section>
        </div>
      </div>
    </Layout>
  );
};

export default RefundPolicy;