import Layout from "@/components/layout/Layout";
import { Link } from "react-router-dom";

const TermsOfService = () => {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-2">Terms of Service</h1>
        <p className="text-muted-foreground mb-10">Last updated: February 9, 2026</p>

        <div className="prose prose-sm max-w-none text-foreground space-y-8">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Agreement to Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              By accessing or using Personal Song Gifts ("Service," "we," "us," or "our"), you agree to be bound by these Terms of Service ("Terms"). If you disagree with any part of these Terms, you do not have permission to access the Service.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-2">
              These Terms constitute a legally binding agreement between you and Personal Song Gifts. Please read them carefully before using our Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Description of Service</h2>
            <p className="text-muted-foreground leading-relaxed">
              Personal Song Gifts provides personalized song creation services. We create custom songs based on information, memories, and stories you provide, generating lyrics and music in various musical styles and eras.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-2">Our Service involves:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li><strong>Lyric Generation:</strong> Transforming your stories and memories into personalized song lyrics</li>
              <li><strong>Music Generation:</strong> Creating original music and vocals based on the generated lyrics</li>
              <li><strong>Digital Delivery:</strong> Delivering your completed song via email with a link to stream your audio</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Eligibility</h2>
            <p className="text-muted-foreground leading-relaxed">To use our Service, you must:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li>Be at least 18 years of age or the age of majority in your jurisdiction</li>
              <li>Have the legal capacity to enter into a binding contract</li>
              <li>Not be prohibited from using the Service under applicable laws</li>
              <li>Have the authority to share any personal information about third parties mentioned in your song requests</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-2">
              By using the Service, you represent and warrant that you meet all eligibility requirements.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Use of Service</h2>
            <p className="text-muted-foreground leading-relaxed">
              You agree to use the Service only for lawful purposes and in accordance with these Terms. You agree not to:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li>Use the Service in any way that violates any applicable law or regulation</li>
              <li>Submit content that is defamatory, obscene, threatening, or infringes on the rights of others</li>
              <li>Submit false or misleading information about yourself or others</li>
              <li>Attempt to interfere with the proper functioning of the Service</li>
              <li>Use the Service to create content that promotes hate, violence, discrimination, or illegal activities</li>
              <li>Attempt to reverse engineer, decompile, or extract the underlying technology</li>
              <li>Use automated systems or bots to access the Service</li>
              <li>Resell, redistribute, or commercially exploit the Service without our consent</li>
              <li>Circumvent or attempt to circumvent any security features or access restrictions</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. User Content and Submissions</h2>
            <p className="text-muted-foreground leading-relaxed">
              When you submit memories, stories, names, or other content ("User Content") to create your custom song, you:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li>Retain ownership of your original User Content</li>
              <li>Grant us a worldwide, non-exclusive, royalty-free license to use, process, and transform your User Content solely for the purpose of creating your custom song</li>
              <li>Represent and warrant that you have the right to share any information about individuals mentioned in your content</li>
              <li>Acknowledge that your User Content will be processed by third-party services to generate lyrics</li>
              <li>Understand that generated output may not exactly match your expectations or intentions</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-2">
              You are solely responsible for the accuracy and appropriateness of the User Content you submit. We reserve the right to refuse to process any submission that we determine, in our sole discretion, violates these Terms or is otherwise inappropriate.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Generated Content Disclaimer</h2>
            <p className="text-muted-foreground leading-relaxed">
              Personal Song Gifts creates personalized songs using advanced technology and proprietary workflows. By using our Service, you acknowledge and agree to the following:
            </p>

            <h3 className="text-lg font-medium mt-4 mb-2">Nature of Generated Content</h3>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>Lyrics are generated based on the information you provide</li>
              <li>Music, melodies, and vocals are generated based on the lyrics</li>
              <li>Generated content may contain imperfections, unexpected interpretations, or creative choices that differ from your expectations</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">Limitations of Technology</h3>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>Technology cannot perfectly interpret emotional nuances or personal context</li>
              <li>Generated lyrics may not capture every detail of your story exactly as you envisioned</li>
              <li>Musical style, tempo, and vocal delivery may vary from expectations</li>
              <li>Names and specific words may occasionally be pronounced differently than expected</li>
              <li>Creative choices may differ from what a human songwriter would make</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">No Guarantee of Specific Output</h3>
            <p className="text-muted-foreground leading-relaxed">
              We cannot guarantee that the generated song will match your exact expectations. The creative output is inherently subjective, and while we strive for quality, there are inherent limitations. Content safety filters may modify or reject certain content.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Satisfaction Guarantee</h2>
            <p className="text-muted-foreground leading-relaxed">
              We want you to love your personalized song. If you are not satisfied with your delivered song, we offer ONE (1) complimentary remake under the following terms:
            </p>

            <h3 className="text-lg font-medium mt-4 mb-2">Eligibility</h3>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>You must request your remake within twenty-four (24) hours of receiving your song delivery email</li>
              <li>You must provide specific feedback about what you would like changed (lyrics, musical style, voice, tempo, name pronunciation, etc.)</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">Scope of Remake</h3>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>The remake must address issues with your original song request</li>
              <li>We will work with you to fix problems such as incorrect details, style mismatches, pronunciation issues, or other aspects that do not match what you requested</li>
              <li>The remake is NOT for creating an entirely different song (different recipient, different occasion, different story)</li>
              <li>One remake per order — additional remakes are not available</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">What This Guarantee Is NOT</h3>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>This is NOT a money-back guarantee</li>
              <li>This is NOT a refund policy</li>
              <li>After your remake is delivered, no further remakes or refunds are available for that order</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">How to Request a Remake</h3>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>Email us at <a href="mailto:support@personalsonggifts.com" className="text-primary hover:underline">support@personalsonggifts.com</a> to request a Change Request Form</li>
              <li>Describe specifically what you would like changed</li>
              <li>Your remake will be generated and delivered via email</li>
            </ul>

            <p className="text-muted-foreground leading-relaxed mt-4">
              By purchasing a song, you acknowledge that you are purchasing a generated creative work. Subjective satisfaction with creative output cannot be guaranteed. The free remake described above is your sole and exclusive remedy for dissatisfaction with the creative output of your order. No refunds will be issued for subjective dissatisfaction with the song's style, sound, or creative interpretation.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Payment Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              All payments are processed securely through a third-party payment processor. By making a purchase, you agree to the following:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li>Prices are displayed at checkout in your selected currency and are subject to change without notice</li>
              <li>You authorize us to charge the payment method you provide for the total amount of your order</li>
              <li>You are responsible for any applicable taxes</li>
              <li>Payment must be completed before song generation begins</li>
              <li>Rush delivery and other add-ons are optional and priced separately</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-2">
              We do not store your payment card information. All payment data is handled directly by our payment processor in accordance with PCI-DSS standards.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Refund Policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              Due to the personalized, digital nature of our products:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li>All sales are final once song generation begins</li>
              <li>We do not offer refunds for completed songs that have been delivered</li>
              <li>The Satisfaction Guarantee (Section 7) provides a free remake option as the remedy for dissatisfaction, not a refund</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">Limited Exceptions</h3>
            <p className="text-muted-foreground leading-relaxed">
              Refunds may be considered only in the following limited circumstances:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li><strong>Technical failure:</strong> If we are unable to generate or deliver your song due to a technical issue on our end that we cannot resolve</li>
              <li><strong>Duplicate charges:</strong> If you were incorrectly charged multiple times for the same order</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-2">
              To request a refund under these limited exceptions, contact <a href="mailto:support@personalsonggifts.com" className="text-primary hover:underline">support@personalsonggifts.com</a> with your order details and reason for the request. All refund decisions are at our sole discretion.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Intellectual Property Rights</h2>

            <h3 className="text-lg font-medium mt-4 mb-2">Ownership of Your Custom Song</h3>
            <p className="text-muted-foreground leading-relaxed">
              Upon successful payment, you receive a personal, non-exclusive, non-transferable license to use your custom song for:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li>Personal, non-commercial use</li>
              <li>Sharing with family and friends</li>
              <li>Playing at private events (weddings, birthdays, anniversaries, etc.)</li>
              <li>Personal archiving and keepsakes</li>
              <li>Posting on personal social media accounts (non-monetized)</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">Restrictions</h3>
            <p className="text-muted-foreground leading-relaxed">You may NOT:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li>Sell, license, or commercially distribute your song</li>
              <li>Use the song in commercial advertising or promotional materials</li>
              <li>Submit the song to music streaming platforms (Spotify, Apple Music, etc.) for commercial distribution</li>
              <li>Claim copyright ownership of the underlying musical composition or generated elements</li>
              <li>Use the song in any way that competes with Personal Song Gifts</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">Personal Song Gifts Retains</h3>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>The right to use anonymized versions or excerpts for promotional purposes (without identifying you or the song recipient)</li>
              <li>Ownership of the Personal Song Gifts platform, interface, proprietary workflows, and the compilation of technologies used to provide the Service</li>
              <li>The right to create similar songs for other customers using similar styles or themes</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">Commercial Licensing</h3>
            <p className="text-muted-foreground leading-relaxed">
              If you wish to use your song for commercial purposes (advertising, film, commercial streaming distribution), please contact us at <a href="mailto:support@personalsonggifts.com" className="text-primary hover:underline">support@personalsonggifts.com</a> for separate licensing arrangements.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">11. Rush Delivery</h2>
            <p className="text-muted-foreground leading-relaxed">
              Rush delivery is an optional add-on that prioritizes your order in our processing queue. While we make every effort to deliver rush orders within the stated timeframe, delivery times are estimates and not guaranteed. Rush delivery fees are non-refundable once your order enters processing, regardless of actual delivery time.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">12. Service Availability</h2>
            <p className="text-muted-foreground leading-relaxed">
              We strive to maintain consistent availability of our Service, but we do not guarantee uninterrupted access. The Service may be temporarily unavailable due to:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li>Scheduled or emergency maintenance</li>
              <li>Technical issues with our systems or third-party providers</li>
              <li>Circumstances beyond our reasonable control</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-2">
              We are not liable for any loss or damage resulting from Service unavailability.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">13. Disclaimer of Warranties</h2>
            <p className="text-muted-foreground leading-relaxed uppercase font-medium">
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li>Implied warranties of merchantability</li>
              <li>Fitness for a particular purpose</li>
              <li>Non-infringement</li>
              <li>Accuracy, reliability, or completeness of content</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-2">
              We do not warrant that the Service will be uninterrupted, secure, or error-free. Generated content may contain imperfections, errors, or may not perfectly capture your intended message. We make no guarantees regarding the quality, accuracy, or suitability of any generated content.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">14. Limitation of Liability</h2>
            <p className="text-muted-foreground leading-relaxed uppercase font-medium">
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW:
            </p>

            <h3 className="text-lg font-medium mt-4 mb-2">Exclusion of Damages</h3>
            <p className="text-muted-foreground leading-relaxed">
              Personal Song Gifts, its officers, directors, employees, agents, and affiliates shall not be liable for any:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li>Indirect, incidental, special, consequential, or punitive damages</li>
              <li>Loss of profits, revenue, data, use, goodwill, or other intangible losses</li>
              <li>Damages resulting from your use or inability to use the Service</li>
              <li>Damages resulting from any content generated by our systems</li>
              <li>Damages resulting from unauthorized access to your data</li>
              <li>Damages resulting from third-party conduct on the Service</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">Maximum Liability</h3>
            <p className="text-muted-foreground leading-relaxed">
              In no event shall our total liability to you for all claims arising from or related to the Service exceed the amount you paid to Personal Song Gifts in the twelve (12) months preceding the claim, or fifty US dollars ($50), whichever is greater.
            </p>

            <h3 className="text-lg font-medium mt-4 mb-2">Acknowledgment</h3>
            <p className="text-muted-foreground leading-relaxed">
              You acknowledge that: (a) generated creative content is inherently unpredictable; (b) subjective disappointment with creative output is not grounds for damages; and (c) the limitations in this section are fundamental to our ability to offer the Service at its current price point.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">15. Indemnification</h2>
            <p className="text-muted-foreground leading-relaxed">
              You agree to indemnify, defend, and hold harmless Personal Song Gifts and its officers, directors, employees, agents, and affiliates from and against any and all claims, damages, obligations, losses, liabilities, costs, and expenses (including reasonable attorney's fees) arising from: (a) your use of the Service; (b) your violation of these Terms; (c) your violation of any third-party rights, including intellectual property or privacy rights; (d) any content you submit to the Service, including personal stories and information about third parties; or (e) your misrepresentation that you have the right to share information about individuals mentioned in your song requests.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">16. Dispute Resolution</h2>

            <h3 className="text-lg font-medium mt-4 mb-2">Informal Resolution</h3>
            <p className="text-muted-foreground leading-relaxed">
              Before filing any formal legal claim, you agree to contact us at <a href="mailto:support@personalsonggifts.com" className="text-primary hover:underline">support@personalsonggifts.com</a> to attempt to resolve the dispute informally. We will attempt to resolve the dispute within thirty (30) days.
            </p>

            <h3 className="text-lg font-medium mt-4 mb-2">Binding Arbitration</h3>
            <p className="text-muted-foreground leading-relaxed">
              If we cannot resolve the dispute informally, you and Personal Song Gifts agree to resolve any disputes through binding arbitration rather than in court, except that either party may bring claims in small claims court if eligible. Arbitration will be conducted by a neutral arbitrator in accordance with the rules of the American Arbitration Association.
            </p>

            <h3 className="text-lg font-medium mt-4 mb-2">Class Action Waiver</h3>
            <p className="text-muted-foreground leading-relaxed uppercase font-medium">
              YOU AGREE TO RESOLVE DISPUTES WITH US ON AN INDIVIDUAL BASIS ONLY. YOU WAIVE ANY RIGHT TO PARTICIPATE IN A CLASS ACTION LAWSUIT OR CLASS-WIDE ARBITRATION AGAINST PERSONAL SONG GIFTS.
            </p>

            <h3 className="text-lg font-medium mt-4 mb-2">Opt-Out</h3>
            <p className="text-muted-foreground leading-relaxed">
              You may opt out of the arbitration agreement by sending written notice to <a href="mailto:support@personalsonggifts.com" className="text-primary hover:underline">support@personalsonggifts.com</a> within thirty (30) days of first using the Service. If you opt out, the Governing Law section will apply to disputes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">17. Termination</h2>
            <p className="text-muted-foreground leading-relaxed">
              We reserve the right to suspend or terminate your access to the Service at any time, with or without cause, and with or without notice. Reasons for termination may include, but are not limited to:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li>Violation of these Terms</li>
              <li>Fraudulent or illegal activity</li>
              <li>Abusive behavior toward our staff or systems</li>
              <li>Requests to discontinue service</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-2">
              Upon termination, your right to use the Service will immediately cease. All provisions of these Terms which by their nature should survive termination shall survive, including ownership provisions, warranty disclaimers, indemnification, and limitations of liability.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">18. International Users</h2>
            <p className="text-muted-foreground leading-relaxed">
              Personal Song Gifts is operated from the United States. If you access the Service from outside the United States:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li>You are responsible for compliance with local laws</li>
              <li>You consent to the transfer of your data to the United States for processing</li>
              <li>You acknowledge that consumer protection laws in your jurisdiction may differ from US law</li>
              <li>Pricing is displayed in your local currency where available, but all transactions are processed through our payment provider</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-2">
              If you are located in the European Economic Area (EEA), United Kingdom, or Switzerland, please see our <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link> for information about your rights under GDPR. If you are a California resident, please see our <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link> for information about your rights under the CCPA.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">19. Severability</h2>
            <p className="text-muted-foreground leading-relaxed">
              If any provision of these Terms is found to be unenforceable or invalid by a court of competent jurisdiction, that provision shall be limited or eliminated to the minimum extent necessary, and the remaining provisions of these Terms shall remain in full force and effect.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">20. Changes to Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              We reserve the right to modify these Terms at any time. We will provide notice of significant changes by updating the "Last updated" date at the top of this page and, in some cases, by sending you an email notification. Your continued use of the Service after any changes constitutes acceptance of the new Terms. If you do not agree to the modified Terms, you should discontinue use of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">21. Governing Law and Jurisdiction</h2>
            <p className="text-muted-foreground leading-relaxed">
              These Terms shall be governed by and construed in accordance with the laws of the United States and the State of Delaware, without regard to conflict of law principles. Subject to the arbitration provisions above, you agree to submit to the personal and exclusive jurisdiction of the courts located in Delaware for resolution of any disputes not subject to arbitration.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">22. Contact Us</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions about these Terms of Service, please contact us:
            </p>
            <p className="text-muted-foreground leading-relaxed mt-2">
              Email: <a href="mailto:support@personalsonggifts.com" className="text-primary hover:underline">support@personalsonggifts.com</a>
            </p>
            <p className="text-muted-foreground leading-relaxed mt-4">
              See also our <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
            </p>
          </section>
        </div>
      </div>
    </Layout>
  );
};

export default TermsOfService;
