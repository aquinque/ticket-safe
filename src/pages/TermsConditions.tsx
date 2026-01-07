import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SEOHead } from "@/components/SEOHead";
import { FileText, Scale, ShieldAlert, CreditCard, UserCheck, AlertTriangle } from "lucide-react";

const TermsConditions = () => {
  const location = useLocation();

  useEffect(() => {
    // Handle hash navigation
    if (location.hash) {
      const element = document.querySelector(location.hash);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      window.scrollTo(0, 0);
    }
  }, [location]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead
        titleKey="Terms & Conditions - TicketSafe"
        descriptionKey="Read TicketSafe's Terms and Conditions. Understand your rights and obligations when using our student ticket marketplace platform."
      />
      <Header />

      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-4xl">
          <BackButton />

          <div className="mt-6 mb-8">
            <div className="flex items-center gap-3 mb-4">
              <Scale className="h-8 w-8 text-primary" />
              <h1 className="text-4xl font-bold">Terms & Conditions</h1>
            </div>
            <p className="text-muted-foreground">
              Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>

          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="space-y-8">
                {/* Introduction */}
                <section>
                  <h2 className="text-2xl font-semibold mb-4">1. Introduction & Acceptance</h2>
                  <div className="space-y-3 text-muted-foreground">
                    <p>
                      Welcome to TicketSafe ("we", "our", "us"). These Terms and Conditions ("Terms") govern your access to and use of the TicketSafe platform, website, and services (collectively, the "Service").
                    </p>
                    <p>
                      By accessing or using TicketSafe, you agree to be bound by these Terms. If you do not agree to these Terms, you may not use our Service.
                    </p>
                    <p className="font-medium text-foreground">
                      TicketSafe is operated by TicketSafe SARL, registered in France. Company Registration Number: [To be added], VAT: [To be added], Registered Address: [To be added].
                    </p>
                  </div>
                </section>

                <Separator />

                {/* Eligibility */}
                <section id="eligibility">
                  <div className="flex items-start gap-3 mb-4">
                    <UserCheck className="h-6 w-6 text-primary mt-1" />
                    <h2 className="text-2xl font-semibold">2. Eligibility & Account Requirements</h2>
                  </div>
                  <div className="space-y-3 text-muted-foreground">
                    <h3 className="font-semibold text-foreground text-lg">2.1 Student Verification</h3>
                    <p>
                      TicketSafe is exclusively available to verified university students. To create an account, you must:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>Be at least 18 years of age</li>
                      <li>Possess a valid university email address from an accredited institution</li>
                      <li>Provide accurate and complete registration information</li>
                      <li>Maintain the confidentiality of your account credentials</li>
                    </ul>

                    <h3 className="font-semibold text-foreground text-lg mt-4">2.2 Account Responsibilities</h3>
                    <p>
                      You are responsible for all activities that occur under your account. You agree to:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>Notify us immediately of any unauthorized use of your account</li>
                      <li>Not share your account credentials with others</li>
                      <li>Not create multiple accounts</li>
                      <li>Keep your contact information current and accurate</li>
                    </ul>
                  </div>
                </section>

                <Separator />

                {/* Platform Usage */}
                <section id="usage">
                  <div className="flex items-start gap-3 mb-4">
                    <FileText className="h-6 w-6 text-primary mt-1" />
                    <h2 className="text-2xl font-semibold">3. Platform Usage Rules</h2>
                  </div>
                  <div className="space-y-3 text-muted-foreground">
                    <h3 className="font-semibold text-foreground text-lg">3.1 Permitted Use</h3>
                    <p>
                      TicketSafe provides a marketplace for students to buy and sell event tickets. You may use the Service to:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>List authentic event tickets for resale at fair market prices</li>
                      <li>Purchase tickets from verified student sellers</li>
                      <li>Browse available events and ticket listings</li>
                      <li>Communicate with other verified users through the platform</li>
                    </ul>

                    <h3 className="font-semibold text-foreground text-lg mt-4">3.2 Prohibited Activities</h3>
                    <p className="font-medium text-foreground">
                      You agree NOT to:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>List counterfeit, fake, or invalid tickets</li>
                      <li>Engage in price gouging or excessive markup (above 150% of face value)</li>
                      <li>Use bots, scrapers, or automated tools to access the platform</li>
                      <li>Manipulate prices, ratings, or reviews</li>
                      <li>Harass, abuse, or threaten other users</li>
                      <li>Attempt to bypass security features or verification systems</li>
                      <li>Resell tickets obtained through TicketSafe on other platforms</li>
                      <li>Use the platform for commercial or business purposes beyond personal ticket resale</li>
                      <li>Interfere with the proper functioning of the Service</li>
                      <li>Violate any applicable laws or regulations</li>
                    </ul>
                  </div>
                </section>

                <Separator />

                {/* Buyer Terms */}
                <section id="buyers">
                  <h2 className="text-2xl font-semibold mb-4">4. Terms for Buyers</h2>
                  <div className="space-y-3 text-muted-foreground">
                    <h3 className="font-semibold text-foreground text-lg">4.1 Purchase Process</h3>
                    <p>
                      When you purchase a ticket through TicketSafe:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>You enter into a binding contract with the seller</li>
                      <li>Payment is processed securely through our payment partner (Revolut/Stripe)</li>
                      <li>Funds are held in escrow until ticket transfer is confirmed</li>
                      <li>You agree to pay the ticket price plus a 5% platform fee</li>
                    </ul>

                    <h3 className="font-semibold text-foreground text-lg mt-4">4.2 Ticket Authenticity</h3>
                    <p>
                      While we verify all tickets before listing, you acknowledge that:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>TicketSafe does not guarantee event occurrence or quality</li>
                      <li>You should independently verify ticket details before purchase</li>
                      <li>Event organizers may have their own terms and conditions</li>
                      <li>Some tickets may have transfer restrictions from the original issuer</li>
                    </ul>

                    <h3 className="font-semibold text-foreground text-lg mt-4">4.3 Buyer Protection</h3>
                    <p>
                      Our Buyer Guarantee covers:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>Full refund if tickets are counterfeit or invalid</li>
                      <li>Full refund if event is officially cancelled by organizer</li>
                      <li>Dispute resolution assistance for delivery issues</li>
                    </ul>
                  </div>
                </section>

                <Separator />

                {/* Seller Terms */}
                <section id="sellers">
                  <h2 className="text-2xl font-semibold mb-4">5. Terms for Sellers</h2>
                  <div className="space-y-3 text-muted-foreground">
                    <h3 className="font-semibold text-foreground text-lg">5.1 Listing Requirements</h3>
                    <p>
                      When listing tickets for sale, you represent and warrant that:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>You legally own the tickets or have authorization to sell them</li>
                      <li>The tickets are authentic and valid for event entry</li>
                      <li>All ticket information (date, venue, seat details) is accurate</li>
                      <li>Tickets are not stolen, counterfeit, or obtained fraudulently</li>
                      <li>You have the right to transfer the tickets</li>
                    </ul>

                    <h3 className="font-semibold text-foreground text-lg mt-4">5.2 Pricing Guidelines</h3>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>Tickets must be priced fairly (maximum 150% of face value)</li>
                      <li>Clearly state the original purchase price if available</li>
                      <li>Do not engage in price manipulation or artificial inflation</li>
                    </ul>

                    <h3 className="font-semibold text-foreground text-lg mt-4">5.3 Seller Obligations</h3>
                    <p>
                      As a seller, you agree to:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>Transfer tickets promptly after sale confirmation (within 24 hours)</li>
                      <li>Provide valid QR codes or ticket transfer information</li>
                      <li>Respond to buyer inquiries in a timely manner</li>
                      <li>Cancel listings immediately if tickets are sold elsewhere</li>
                      <li>Cooperate with TicketSafe in case of disputes</li>
                    </ul>

                    <h3 className="font-semibold text-foreground text-lg mt-4">5.4 Payment & Fees</h3>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>You receive 100% of the ticket sale price (buyer pays the 5% platform fee)</li>
                      <li>Payments are processed within 24-48 hours after successful transfer</li>
                      <li>You are responsible for any applicable taxes on your sales</li>
                      <li>Chargebacks or fraudulent activity may result in withheld payments</li>
                    </ul>
                  </div>
                </section>

                <Separator />

                {/* Payment Terms */}
                <section id="payments">
                  <div className="flex items-start gap-3 mb-4">
                    <CreditCard className="h-6 w-6 text-primary mt-1" />
                    <h2 className="text-2xl font-semibold">6. Payment Terms</h2>
                  </div>
                  <div className="space-y-3 text-muted-foreground">
                    <h3 className="font-semibold text-foreground text-lg">6.1 Platform Fees</h3>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>Buyers pay a 5% platform fee on top of the ticket price</li>
                      <li>All fees are clearly displayed before purchase confirmation</li>
                      <li>Fees are non-refundable except in cases of platform error</li>
                    </ul>

                    <h3 className="font-semibold text-foreground text-lg mt-4">6.2 Payment Processing</h3>
                    <p>
                      Payments are processed through our secure payment partners (Revolut Business/Stripe). By using TicketSafe, you agree to their respective terms of service.
                    </p>

                    <h3 className="font-semibold text-foreground text-lg mt-4">6.3 Escrow System</h3>
                    <p>
                      For your protection:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>Buyer payments are held in escrow until ticket transfer is verified</li>
                      <li>Sellers receive payment only after successful ticket delivery</li>
                      <li>In case of disputes, funds remain in escrow until resolution</li>
                    </ul>
                  </div>
                </section>

                <Separator />

                {/* Refunds & Cancellations */}
                <section id="refunds">
                  <h2 className="text-2xl font-semibold mb-4">7. Refunds & Cancellations</h2>
                  <div className="space-y-3 text-muted-foreground">
                    <p className="font-medium text-foreground">
                      Please see our separate Refund Policy page for detailed information. In summary:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>Full refund if tickets are invalid or counterfeit</li>
                      <li>Full refund if event is officially cancelled</li>
                      <li>Refunds processed within 5-10 business days</li>
                      <li>Change of mind or schedule conflicts do not qualify for refunds</li>
                      <li>Sellers may cancel listings before purchase without penalty</li>
                    </ul>
                  </div>
                </section>

                <Separator />

                {/* Intellectual Property */}
                <section id="ip">
                  <h2 className="text-2xl font-semibold mb-4">8. Intellectual Property</h2>
                  <div className="space-y-3 text-muted-foreground">
                    <h3 className="font-semibold text-foreground text-lg">8.1 Platform Content</h3>
                    <p>
                      All content on TicketSafe, including logos, design, text, graphics, and software, is owned by TicketSafe or licensed to us and protected by copyright, trademark, and other intellectual property laws.
                    </p>

                    <h3 className="font-semibold text-foreground text-lg mt-4">8.2 User Content</h3>
                    <p>
                      When you post listings, photos, or other content ("User Content"), you:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>Retain ownership of your User Content</li>
                      <li>Grant TicketSafe a worldwide, non-exclusive license to use, display, and distribute your content on the platform</li>
                      <li>Represent that you have all necessary rights to the content</li>
                      <li>Agree not to post copyrighted material without permission</li>
                    </ul>

                    <h3 className="font-semibold text-foreground text-lg mt-4">8.3 Copyright Complaints</h3>
                    <p>
                      If you believe content on TicketSafe infringes your copyright, contact us at: ticketsafe.friendly@gmail.com
                    </p>
                  </div>
                </section>

                <Separator />

                {/* Liability */}
                <section id="liability">
                  <div className="flex items-start gap-3 mb-4">
                    <ShieldAlert className="h-6 w-6 text-primary mt-1" />
                    <h2 className="text-2xl font-semibold">9. Limitation of Liability</h2>
                  </div>
                  <div className="space-y-3 text-muted-foreground">
                    <h3 className="font-semibold text-foreground text-lg">9.1 Platform Role</h3>
                    <p className="font-medium text-foreground">
                      TicketSafe is a marketplace platform connecting buyers and sellers. We are NOT:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>A party to transactions between buyers and sellers</li>
                      <li>Responsible for event organization or quality</li>
                      <li>Liable for disputes between users</li>
                      <li>A ticket seller or event organizer</li>
                    </ul>

                    <h3 className="font-semibold text-foreground text-lg mt-4">9.2 Service Disclaimer</h3>
                    <p>
                      THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.
                    </p>

                    <h3 className="font-semibold text-foreground text-lg mt-4">9.3 Limitation of Damages</h3>
                    <p>
                      TO THE MAXIMUM EXTENT PERMITTED BY LAW, TICKETSAFE SHALL NOT BE LIABLE FOR:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>Indirect, incidental, special, or consequential damages</li>
                      <li>Loss of profits, revenue, data, or business opportunities</li>
                      <li>Damages exceeding the amount paid by you to TicketSafe in the past 12 months</li>
                      <li>Issues arising from third-party services (payment processors, event organizers)</li>
                    </ul>

                    <h3 className="font-semibold text-foreground text-lg mt-4">9.4 Indemnification</h3>
                    <p>
                      You agree to indemnify and hold TicketSafe harmless from any claims, losses, or damages arising from:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>Your violation of these Terms</li>
                      <li>Your violation of any rights of another user or third party</li>
                      <li>Your use of the Service</li>
                      <li>Fraudulent or illegal activity on your account</li>
                    </ul>
                  </div>
                </section>

                <Separator />

                {/* Dispute Resolution */}
                <section id="disputes">
                  <h2 className="text-2xl font-semibold mb-4">10. Dispute Resolution</h2>
                  <div className="space-y-3 text-muted-foreground">
                    <h3 className="font-semibold text-foreground text-lg">10.1 Internal Resolution</h3>
                    <p>
                      For disputes between users, we offer mediation services. Contact our support team at ticketsafe.friendly@gmail.com
                    </p>

                    <h3 className="font-semibold text-foreground text-lg mt-4">10.2 Governing Law</h3>
                    <p>
                      These Terms are governed by the laws of France. Any legal action must be brought in the courts of Paris, France.
                    </p>

                    <h3 className="font-semibold text-foreground text-lg mt-4">10.3 EU Online Dispute Resolution</h3>
                    <p>
                      EU consumers may access the European Commission's Online Dispute Resolution platform at: https://ec.europa.eu/consumers/odr
                    </p>
                  </div>
                </section>

                <Separator />

                {/* Termination */}
                <section id="termination">
                  <div className="flex items-start gap-3 mb-4">
                    <AlertTriangle className="h-6 w-6 text-primary mt-1" />
                    <h2 className="text-2xl font-semibold">11. Account Suspension & Termination</h2>
                  </div>
                  <div className="space-y-3 text-muted-foreground">
                    <h3 className="font-semibold text-foreground text-lg">11.1 Termination by You</h3>
                    <p>
                      You may close your account at any time through your account settings or by contacting support.
                    </p>

                    <h3 className="font-semibold text-foreground text-lg mt-4">11.2 Termination by TicketSafe</h3>
                    <p>
                      We reserve the right to suspend or terminate your account if:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>You violate these Terms</li>
                      <li>You engage in fraudulent activity</li>
                      <li>You receive multiple user complaints</li>
                      <li>Your account is inactive for over 12 months</li>
                      <li>We are required by law to do so</li>
                    </ul>

                    <h3 className="font-semibold text-foreground text-lg mt-4">11.3 Effect of Termination</h3>
                    <p>
                      Upon termination:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>Your access to the Service will cease immediately</li>
                      <li>Pending transactions will be completed or refunded as appropriate</li>
                      <li>Your listings will be removed from the platform</li>
                      <li>Some provisions of these Terms survive termination (liability, indemnification, dispute resolution)</li>
                    </ul>
                  </div>
                </section>

                <Separator />

                {/* Changes to Terms */}
                <section id="changes">
                  <h2 className="text-2xl font-semibold mb-4">12. Changes to Terms</h2>
                  <div className="space-y-3 text-muted-foreground">
                    <p>
                      We may modify these Terms at any time. When we make material changes:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>We will notify you via email or platform notification</li>
                      <li>The updated Terms will be posted with a new "Last Updated" date</li>
                      <li>Continued use of the Service constitutes acceptance of the new Terms</li>
                      <li>If you disagree with changes, you must stop using the Service</li>
                    </ul>
                  </div>
                </section>

                <Separator />

                {/* Miscellaneous */}
                <section id="misc">
                  <h2 className="text-2xl font-semibold mb-4">13. Miscellaneous</h2>
                  <div className="space-y-3 text-muted-foreground">
                    <h3 className="font-semibold text-foreground text-lg">13.1 Entire Agreement</h3>
                    <p>
                      These Terms, along with our Privacy Policy and Refund Policy, constitute the entire agreement between you and TicketSafe.
                    </p>

                    <h3 className="font-semibold text-foreground text-lg mt-4">13.2 Severability</h3>
                    <p>
                      If any provision of these Terms is found unenforceable, the remaining provisions will remain in full effect.
                    </p>

                    <h3 className="font-semibold text-foreground text-lg mt-4">13.3 No Waiver</h3>
                    <p>
                      Our failure to enforce any provision does not constitute a waiver of that provision.
                    </p>

                    <h3 className="font-semibold text-foreground text-lg mt-4">13.4 Assignment</h3>
                    <p>
                      You may not assign these Terms without our consent. We may assign our rights and obligations without restriction.
                    </p>
                  </div>
                </section>

                <Separator />

                {/* Contact */}
                <section id="contact">
                  <h2 className="text-2xl font-semibold mb-4">14. Contact Information</h2>
                  <div className="space-y-3 text-muted-foreground">
                    <p>
                      For questions about these Terms, please contact us:
                    </p>
                    <div className="bg-muted/50 p-4 rounded-lg space-y-1">
                      <p className="font-medium text-foreground">TicketSafe Support</p>
                      <p>Email: ticketsafe.friendly@gmail.com</p>
                      <p>Address: [Company registered address to be added]</p>
                      <p>Company Registration: [To be added]</p>
                    </div>
                  </div>
                </section>
              </div>
            </CardContent>
          </Card>

          <div className="text-center text-sm text-muted-foreground mb-8">
            <p>By using TicketSafe, you acknowledge that you have read, understood, and agree to be bound by these Terms & Conditions.</p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default TermsConditions;
