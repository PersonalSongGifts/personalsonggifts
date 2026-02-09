import Layout from "@/components/layout/Layout";
import { Link } from "react-router-dom";

const PrivacyPolicy = () => {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground mb-10">Last updated: February 9, 2026</p>

        <div className="prose prose-sm max-w-none text-foreground space-y-8">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Introduction</h2>
            <p className="text-muted-foreground leading-relaxed">
              Personal Song Gifts ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy describes the information we collect, how we use it, the parties to whom it is disclosed, the methods of disclosure, and the security practices we have in place to safeguard your information. By using our Service, you consent to the data practices described in this policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Information We Collect</h2>
            <p className="text-muted-foreground leading-relaxed">We collect the following categories of information:</p>

            <h3 className="text-lg font-medium mt-4 mb-2">Personal Information</h3>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li><strong>Contact Information:</strong> Email address for order confirmations, delivery, and customer support</li>
              <li><strong>Payment Information:</strong> Processed securely through our payment processor; we do not store credit card numbers on our servers</li>
              <li><strong>Names:</strong> Recipient names and your name (if provided) for song personalization</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">Content Information</h3>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li><strong>Memories and Stories:</strong> Personal stories, memories, and details you share for song creation. If you voluntarily include sensitive information (such as health conditions, religious beliefs, or other personal details) in your story, you explicitly consent to us processing this information solely for creating your personalized song</li>
              <li><strong>Preferences:</strong> Genre, decade, voice, occasion, and style preferences</li>
              <li><strong>Generated Content:</strong> Lyrics and audio files created for your order</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">Technical Information</h3>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li><strong>Device Information:</strong> Browser type, operating system, and device type</li>
              <li><strong>Usage Data:</strong> Pages visited, time spent on site, and interaction patterns</li>
              <li><strong>IP Address:</strong> For security, fraud prevention, and approximate geolocation purposes</li>
              <li><strong>Referral Data:</strong> How you found us (UTM parameters, referrer URLs)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. How We Use Your Information</h2>
            <p className="text-muted-foreground leading-relaxed">We use the collected information for the following purposes:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li><strong>Service Delivery:</strong> To create and deliver your custom song</li>
              <li><strong>Communication:</strong> To send order confirmations, delivery notifications, remake updates, and respond to inquiries</li>
              <li><strong>Payment Processing:</strong> To process transactions securely through our payment provider</li>
              <li><strong>Service Improvement:</strong> To analyze usage patterns and improve our service</li>
              <li><strong>Security:</strong> To prevent fraud, unauthorized access, and other malicious activities</li>
              <li><strong>Legal Compliance:</strong> To comply with applicable laws and regulations</li>
              <li><strong>Marketing:</strong> To send promotional communications (with your consent, where required)</li>
              <li><strong>No AI Training:</strong> We do not use your stories, memories, or personal submissions to train public AI models. Your content is processed solely to create your personalized song and is not used to improve or train third-party AI systems</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">Legal Bases for Processing (GDPR)</h3>
            <p className="text-muted-foreground leading-relaxed">For users in the European Economic Area, we process your data based on:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li><strong>Contract Performance:</strong> Processing necessary to fulfill your order</li>
              <li><strong>Legitimate Interests:</strong> Improving our services, preventing fraud, marketing (where permitted)</li>
              <li><strong>Consent:</strong> For optional marketing communications</li>
              <li><strong>Legal Obligation:</strong> Compliance with applicable laws</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Information Sharing and Disclosure</h2>
            <p className="text-muted-foreground leading-relaxed">
              We share your information only with the parties listed below and only as necessary to provide our Service. We do not sell your personal information to third parties.
            </p>

            <h3 className="text-lg font-medium mt-4 mb-2">Legal Requirements</h3>
            <p className="text-muted-foreground leading-relaxed">
              We may disclose your information if required by law, court order, or government request, or if we believe disclosure is necessary to protect our rights, your safety, or the safety of others.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Third-Party Service Providers</h2>
            <p className="text-muted-foreground leading-relaxed">
              We share your information with third-party service providers to deliver our Service. Each provider is contractually obligated to protect your data. These providers assist with:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2 mt-2">
              <li><strong>Payment Processing:</strong> We use a secure payment processor to handle transactions. We never store or have access to your full credit card number.</li>
              <li><strong>Content Generation:</strong> Your song details (recipient name, relationship type, occasion, personal stories/memories, qualities, and dedication message) are processed by our content generation providers to create personalized lyrics and music.</li>
              <li><strong>Email Delivery:</strong> Your email address and order details are shared with our email provider to send order confirmations and song deliveries.</li>
              <li><strong>Data Storage:</strong> Order information and generated songs are securely stored by our cloud infrastructure providers with encryption at rest and in transit.</li>
              <li><strong>Hosting & Infrastructure:</strong> Our application is hosted on cloud infrastructure providers.</li>
              <li><strong>Error Tracking:</strong> Anonymized error logs and usage data may be shared with monitoring services for application improvement.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Cookies and Tracking Technologies</h2>

            <h3 className="text-lg font-medium mt-4 mb-2">Types of Cookies We Use</h3>
            <h4 className="font-medium mt-3 mb-1">Essential Cookies (Required)</h4>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>Session cookies for maintaining your order state during checkout</li>
              <li>Authentication cookies for admin users</li>
              <li>CSRF protection tokens</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-2">
              These cookies are necessary for the Service to function and cannot be disabled.
            </p>

            <h4 className="font-medium mt-3 mb-1">Analytics Cookies (Optional)</h4>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>We may use analytics tools to understand how visitors use our site</li>
              <li>These help us improve user experience</li>
              <li>You can opt out through your browser settings</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">How to Manage Cookies</h3>
            <p className="text-muted-foreground leading-relaxed">
              Most browsers allow you to refuse cookies through settings. Refusing essential cookies may prevent you from completing orders.
            </p>

            <h3 className="text-lg font-medium mt-4 mb-2">Do Not Track</h3>
            <p className="text-muted-foreground leading-relaxed">
              We currently do not respond to "Do Not Track" browser signals. We will update this policy if we implement DNT support in the future.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Data Retention</h2>
            <p className="text-muted-foreground leading-relaxed">
              We retain your personal information for as long as necessary to provide our services and fulfill the purposes described in this policy:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li><strong>Order Data:</strong> Retained indefinitely to allow you to access your purchase and for legal/tax compliance purposes</li>
              <li><strong>Generated Songs:</strong> Stored indefinitely unless you request deletion</li>
              <li><strong>Support Conversations:</strong> Retained for 3 years after resolution</li>
              <li><strong>Marketing Data:</strong> Until you unsubscribe or request deletion</li>
              <li><strong>Technical Logs:</strong> Generally deleted after 90 days</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-2">
              You may request deletion of your data by contacting us at <a href="mailto:support@personalsonggifts.com" className="text-primary hover:underline">support@personalsonggifts.com</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Data Security</h2>
            <p className="text-muted-foreground leading-relaxed">
              We implement comprehensive security measures to protect your information:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li><strong>Encryption:</strong> All data transmitted between your browser and our servers is encrypted using TLS/SSL</li>
              <li><strong>Secure Payment:</strong> Credit card information is processed by our payment provider and never touches our servers</li>
              <li><strong>Database Security:</strong> Our database is hosted with encryption at rest and in transit</li>
              <li><strong>Access Control:</strong> Only authorized personnel have access to user data, on a need-to-know basis</li>
              <li><strong>Regular Audits:</strong> We regularly review and update our security practices</li>
              <li><strong>Environment Variables:</strong> Sensitive API keys and credentials are stored securely as environment variables</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-2">
              While we implement industry-standard security measures, no method of transmission over the Internet or electronic storage is 100% secure. We cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Your Rights</h2>
            <p className="text-muted-foreground leading-relaxed">
              Depending on your location, you may have the following rights regarding your personal information:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li><strong>Access:</strong> Request a copy of the personal information we hold about you</li>
              <li><strong>Correction:</strong> Request correction of inaccurate information</li>
              <li><strong>Deletion:</strong> Request deletion of your personal information</li>
              <li><strong>Portability:</strong> Request your data in a portable format</li>
              <li><strong>Opt-out:</strong> Unsubscribe from marketing communications at any time</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-2">
              To exercise any of these rights, please contact us at <a href="mailto:support@personalsonggifts.com" className="text-primary hover:underline">support@personalsonggifts.com</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Your Rights Under GDPR (European Users)</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you are located in the European Economic Area (EEA), United Kingdom, or Switzerland, you have the following additional rights under the General Data Protection Regulation (GDPR):
            </p>

            <h3 className="text-lg font-medium mt-4 mb-2">Your GDPR Rights</h3>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li><strong>Right of Access:</strong> Request a copy of your personal data</li>
              <li><strong>Right to Rectification:</strong> Request correction of inaccurate data</li>
              <li><strong>Right to Erasure ("Right to be Forgotten"):</strong> Request deletion of your data</li>
              <li><strong>Right to Restrict Processing:</strong> Request limitation of how we use your data</li>
              <li><strong>Right to Data Portability:</strong> Receive your data in a structured, machine-readable format</li>
              <li><strong>Right to Object:</strong> Object to processing based on legitimate interests</li>
              <li><strong>Right to Withdraw Consent:</strong> Withdraw consent at any time for consent-based processing</li>
              <li><strong>Right to Lodge a Complaint:</strong> File a complaint with your local data protection authority</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">How to Exercise Your Rights</h3>
            <p className="text-muted-foreground leading-relaxed">
              Contact our Data Protection contact at <a href="mailto:support@personalsonggifts.com" className="text-primary hover:underline">support@personalsonggifts.com</a>. We will respond within 30 days as required by GDPR.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">11. Your Rights Under CCPA (California Users)</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you are a California resident, you have the following rights under the California Consumer Privacy Act (CCPA) and California Privacy Rights Act (CPRA):
            </p>

            <h3 className="text-lg font-medium mt-4 mb-2">Your CCPA Rights</h3>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li><strong>Right to Know:</strong> Request disclosure of categories and specific pieces of personal information collected</li>
              <li><strong>Right to Delete:</strong> Request deletion of your personal information, subject to certain exceptions</li>
              <li><strong>Right to Correct:</strong> Request correction of inaccurate personal information</li>
              <li><strong>Right to Opt-Out of Sale:</strong> We do not sell your personal information</li>
              <li><strong>Right to Non-Discrimination:</strong> We will not discriminate against you for exercising your rights</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">Categories of Information Collected (Past 12 Months)</h3>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>Identifiers: Email address, name</li>
              <li>Personal information (Cal. Civ. Code § 1798.80): Name, address</li>
              <li>Commercial information: Purchase history, order details</li>
              <li>Internet activity: Pages visited, interaction with our site</li>
              <li>Inferences: Preferences derived from the above</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">How to Exercise Your Rights</h3>
            <p className="text-muted-foreground leading-relaxed">
              Submit a request to <a href="mailto:support@personalsonggifts.com" className="text-primary hover:underline">support@personalsonggifts.com</a>. We will verify your identity before processing requests. You may designate an authorized agent to make requests on your behalf with proper written authorization.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">12. International Data Transfers</h2>
            <p className="text-muted-foreground leading-relaxed">
              Personal Song Gifts is based in the United States. Your information may be transferred to, stored, and processed in the United States and other countries where our service providers operate.
            </p>

            <h3 className="text-lg font-medium mt-4 mb-2">Transfer Mechanisms</h3>
            <p className="text-muted-foreground leading-relaxed">
              For transfers from the EEA/UK/Switzerland to the United States, we rely on:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li>Standard Contractual Clauses (SCCs) approved by the European Commission</li>
              <li>Data Processing Agreements with all service providers</li>
              <li>The recipient country's adequacy decisions where available</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">Your Consent</h3>
            <p className="text-muted-foreground leading-relaxed">
              By using our Service, you consent to the transfer of your information to the United States and other jurisdictions that may have different data protection laws than your country of residence. Regardless of where your data is processed, we apply the same protections described in this Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">13. Data Breach Notification</h2>
            <p className="text-muted-foreground leading-relaxed">
              In the event of a data breach that affects your personal information:
            </p>

            <h3 className="text-lg font-medium mt-4 mb-2">Notification Timeline</h3>
            <p className="text-muted-foreground leading-relaxed">
              We will notify affected users within 72 hours of becoming aware of a breach that poses a risk to your rights and freedoms. We will also notify relevant supervisory authorities as required by law.
            </p>

            <h3 className="text-lg font-medium mt-4 mb-2">Notification Content</h3>
            <p className="text-muted-foreground leading-relaxed">Our notification will include:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li>Description of the nature of the breach</li>
              <li>Categories and approximate number of individuals affected</li>
              <li>Likely consequences of the breach</li>
              <li>Measures taken or proposed to address the breach</li>
              <li>Contact information for questions</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">How We Will Notify You</h3>
            <p className="text-muted-foreground leading-relaxed">
              We will notify you via email to the address associated with your order, by a prominent notice on our website, and by other means as required by applicable law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">14. Children's Privacy</h2>
            <p className="text-muted-foreground leading-relaxed">
              Our Service is not directed to children under 13 years of age. We do not knowingly collect personal information from children under 13. If you are a parent or guardian and believe we have collected information from a child under 13, please contact us immediately at <a href="mailto:support@personalsonggifts.com" className="text-primary hover:underline">support@personalsonggifts.com</a> and we will take steps to delete such information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">15. Third-Party Links</h2>
            <p className="text-muted-foreground leading-relaxed">
              Our website may contain links to third-party websites. We are not responsible for the privacy practices or content of these external sites. We encourage you to review the privacy policies of any third-party sites you visit.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">16. Marketing Communications</h2>

            <h3 className="text-lg font-medium mt-4 mb-2">Types of Communications</h3>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li><strong>Transactional Emails:</strong> Order confirmations, delivery notifications, change request links (required for service delivery — cannot be opted out)</li>
              <li><strong>Marketing Emails:</strong> Promotional offers, new features, company updates (optional)</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">Opt-In/Opt-Out</h3>
            <p className="text-muted-foreground leading-relaxed">
              You can opt out of marketing emails at any time by clicking "unsubscribe" in any marketing email or contacting <a href="mailto:support@personalsonggifts.com" className="text-primary hover:underline">support@personalsonggifts.com</a>. Transactional emails cannot be opted out as they are necessary for order fulfillment.
            </p>

            <h3 className="text-lg font-medium mt-4 mb-2">Abandoned Cart Emails</h3>
            <p className="text-muted-foreground leading-relaxed">
              If you start an order but do not complete checkout, we may send reminder emails. You can opt out of these by clicking unsubscribe in the email.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">17. Changes to This Policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of significant changes by updating the "Last updated" date at the top of this page and, in some cases, by sending you an email notification. Your continued use of our Service after changes constitutes acceptance of the updated policy. If you do not agree to the modified policy, you should discontinue use of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">18. Contact Us</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions about this Privacy Policy, our data practices, or would like to exercise your rights, please contact us:
            </p>
            <p className="text-muted-foreground leading-relaxed mt-2">
              Privacy Inquiries: <a href="mailto:support@personalsonggifts.com" className="text-primary hover:underline">support@personalsonggifts.com</a>
            </p>
            <p className="text-muted-foreground leading-relaxed">
              General Support: <a href="mailto:support@personalsonggifts.com" className="text-primary hover:underline">support@personalsonggifts.com</a>
            </p>
            <p className="text-muted-foreground leading-relaxed mt-2">
              We aim to respond to all inquiries within 30 days.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-4">
              See also our <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>
            </p>
          </section>
        </div>
      </div>
    </Layout>
  );
};

export default PrivacyPolicy;
