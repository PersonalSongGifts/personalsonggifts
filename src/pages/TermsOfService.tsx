import Layout from "@/components/layout/Layout";

const TermsOfService = () => {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-2">Terms of Service</h1>
        <p className="text-muted-foreground mb-10">Last Updated: February 9, 2026</p>

        <div className="prose prose-sm max-w-none text-foreground space-y-8">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              Welcome to Personal Song Gifts ("we," "our," or "us"). By accessing or using our website personalsonggifts.com (the "Site") and our custom song creation services (the "Services"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, please do not use our Site or Services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Description of Services</h2>
            <p className="text-muted-foreground leading-relaxed">
              Personal Song Gifts provides custom, personalized songs created based on information you provide (stories, memories, names, occasions, etc.). Songs are produced using a combination of AI-assisted technology and creative processes. Each song is unique and created specifically for you.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Orders and Payment</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>All orders are subject to acceptance by us. We reserve the right to refuse or cancel any order at our discretion.</li>
              <li>Prices are displayed on the Site at the time of purchase and are subject to change without notice.</li>
              <li>Payment is processed securely through our third-party payment provider at the time of order.</li>
              <li>You agree to provide accurate and complete payment information.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Song Delivery</h2>
            <p className="text-muted-foreground leading-relaxed">
              We aim to deliver your custom song within the timeframe indicated at the time of purchase. Delivery times may vary based on order volume and complexity. We will communicate with you via email regarding the status and delivery of your song.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Content You Provide</h2>
            <p className="text-muted-foreground leading-relaxed">
              You are responsible for the accuracy of all information you provide for song creation, including names, stories, and personal details. By submitting content, you represent that:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li>You have the right to share the stories, memories, and details you provide</li>
              <li>The content does not infringe upon any third party's rights</li>
              <li>The content is not defamatory, obscene, or otherwise objectionable</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-2">
              We reserve the right to decline any order if the requested content is inappropriate, offensive, or violates these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Intellectual Property</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li><strong>Your Content:</strong> You retain ownership of the personal stories, memories, and information you provide to us.</li>
              <li><strong>Song Ownership:</strong> Upon full payment, you receive a personal, non-exclusive license to use, share, and enjoy the custom song created for you for personal, non-commercial purposes.</li>
              <li><strong>Our Rights:</strong> Personal Song Gifts retains all intellectual property rights in the musical compositions, arrangements, and production elements. We may use anonymized or aggregated data from orders to improve our Services.</li>
              <li><strong>Promotional Use:</strong> We may request permission to use your song or testimonial for promotional purposes. You are under no obligation to grant such permission.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Refund Policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              Because each song is a custom, one-of-a-kind creation made specifically for you, refunds are handled on a case-by-case basis. If you are unsatisfied with your song, please contact us at <a href="mailto:support@personalsonggifts.com" className="text-primary hover:underline">support@personalsonggifts.com</a> and we will work with you to find a resolution. We want you to love your song.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Limitation of Liability</h2>
            <p className="text-muted-foreground leading-relaxed">
              To the fullest extent permitted by law, Personal Song Gifts shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or related to your use of the Site or Services. Our total liability for any claim arising from these Terms or the Services shall not exceed the amount you paid for the specific order giving rise to the claim.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Disclaimer of Warranties</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Site and Services are provided "as is" and "as available" without warranties of any kind, whether express or implied. We do not guarantee that the Site will be error-free, uninterrupted, or free of harmful components. While we strive to create songs that exceed your expectations, we cannot guarantee specific emotional outcomes or reactions.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. User Conduct</h2>
            <p className="text-muted-foreground leading-relaxed">You agree not to:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li>Use the Site or Services for any unlawful purpose</li>
              <li>Attempt to gain unauthorized access to our systems</li>
              <li>Reproduce, distribute, or commercially exploit our content without permission</li>
              <li>Submit false or misleading information</li>
              <li>Interfere with the operation of the Site</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">11. Indemnification</h2>
            <p className="text-muted-foreground leading-relaxed">
              You agree to indemnify, defend, and hold harmless Personal Song Gifts, its officers, directors, employees, and agents from any claims, damages, losses, or expenses (including reasonable attorneys' fees) arising from your use of the Site or Services, your violation of these Terms, or your violation of any rights of a third party.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">12. Governing Law</h2>
            <p className="text-muted-foreground leading-relaxed">
              These Terms shall be governed by and construed in accordance with the laws of the United States, without regard to conflict of law principles. Any disputes arising under these Terms shall be resolved in the courts of competent jurisdiction.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">13. Changes to These Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              We reserve the right to modify these Terms at any time. Changes will be posted on this page with an updated "Last Updated" date. Your continued use of the Site or Services after any changes constitutes your acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">14. Contact Us</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions about these Terms of Service, please contact us at:
            </p>
            <p className="text-muted-foreground leading-relaxed mt-2">
              <strong>Personal Song Gifts</strong><br />
              Email: <a href="mailto:support@personalsonggifts.com" className="text-primary hover:underline">support@personalsonggifts.com</a>
            </p>
          </section>
        </div>
      </div>
    </Layout>
  );
};

export default TermsOfService;
