import Layout from "@/components/layout/Layout";
import { Link } from "react-router-dom";

const RefundPolicy = () => {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-2">
          Love-It Guarantee — Refund & Remake Policy
        </h1>
        <p className="text-muted-foreground mb-10">Last updated: July 9, 2026</p>

        <div className="prose prose-sm max-w-none text-foreground space-y-8">
          <section>
            <h2 className="text-xl font-semibold mb-3">The Love-It Guarantee</h2>
            <p className="text-muted-foreground leading-relaxed">
              We want you to genuinely love your song. Our promise is simple: <strong>unlimited free revisions until you're happy, and a full refund on request within 14 days of delivery if you're still not satisfied.</strong> Just reply to your delivery email — a different feel, new lyrics, a fresh vocal, or a refund. We'll make it right.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Free revisions — how it works</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Unlimited complimentary revisions — we'll keep working with you until it's right.</li>
              <li>Email <a href="mailto:support@personalsonggifts.com" className="text-primary hover:underline">support@personalsonggifts.com</a> with your order number and what you'd like changed.</li>
              <li>You can also make quick self-service edits directly from your song page.</li>
              <li>Revisions are typically delivered within 24 hours.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">14-day money-back guarantee</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you're still not satisfied after we've tried to make it right, request a full refund within <strong>14 days of your song's delivery</strong> and we'll return the purchase price (including any add-ons) to your original payment method. No lawyerly hoops.
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2 mt-2">
              <li>Email <a href="mailto:support@personalsonggifts.com" className="text-primary hover:underline">support@personalsonggifts.com</a> from the address on the order.</li>
              <li>Approved refunds land on the original payment method within 5–10 business days.</li>
              <li>After 14 days the sale is final, but we'll still happily keep revising your song.</li>
              <li>We reserve the right to decline refunds in cases of evident abuse or fraud (e.g., repeat refund-and-reorder patterns).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Delivery timing</h2>
            <p className="text-muted-foreground leading-relaxed">
              Standard delivery arrives within about 24 hours. Express (1-hour) delivery is available at checkout as a paid upgrade. Delivery windows are estimates, not guarantees — production times can vary with volume and creative iteration. If an Express order does not arrive meaningfully faster than a standard order would have, the Express fee is refundable on request. Email <a href="mailto:support@personalsonggifts.com" className="text-primary hover:underline">support@personalsonggifts.com</a> and we'll make it right.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Refunds outside the 14-day window</h2>
            <p className="text-muted-foreground leading-relaxed">
              After the 14-day satisfaction window, refunds are limited to the following situations:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2 mt-2">
              <li><strong>Technical failure:</strong> we were unable to deliver a completed song to you.</li>
              <li><strong>Duplicate charge:</strong> you were billed more than once for the same order.</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-3">
              In either case, reach out to <a href="mailto:support@personalsonggifts.com" className="text-primary hover:underline">support@personalsonggifts.com</a> and we'll resolve it quickly.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Add-ons & upgrades</h2>
            <p className="text-muted-foreground leading-relaxed">
              Optional add-ons (Forever Memory Package, Rush Delivery, bonus tracks, downloads, lyric unlocks) are part of your order and are included in the 14-day Love-It Guarantee. Voluntary tips are non-refundable.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Questions?</h2>
            <p className="text-muted-foreground leading-relaxed">
              We're a small team and we read every email. Write to us at <a href="mailto:support@personalsonggifts.com" className="text-primary hover:underline">support@personalsonggifts.com</a> — we typically reply within 24 hours.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-3">
              For the full legal text, see our <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link> (§7 Love-It Guarantee and §9 Refund Policy).
            </p>
          </section>
        </div>
      </div>
    </Layout>
  );
};

export default RefundPolicy;