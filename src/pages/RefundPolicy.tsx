import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SEOHead } from "@/components/SEOHead";
import { RefreshCcw, ShieldCheck, XCircle, Clock, CheckCircle2, AlertCircle } from "lucide-react";

const RefundPolicy = () => {
  const location = useLocation();

  useEffect(() => {
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
        titleKey="Refund & Cancellation Policy - TicketSafe"
        descriptionKey="Understand TicketSafe's refund and cancellation policy. Learn about buyer protection, refund eligibility, and the claims process."
      />
      <Header />

      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-4xl">
          <BackButton />

          <div className="mt-6 mb-8">
            <div className="flex items-center gap-3 mb-4">
              <RefreshCcw className="h-8 w-8 text-primary" />
              <h1 className="text-4xl font-bold">Refund & Cancellation Policy</h1>
            </div>
            <p className="text-muted-foreground">
              Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>

          {/* Quick Summary Card */}
          <Card className="mb-6 bg-primary/5 border-primary/20">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3 mb-3">
                <ShieldCheck className="h-6 w-6 text-primary mt-1" />
                <div>
                  <h3 className="font-semibold text-lg mb-2">Buyer Protection Guarantee</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    TicketSafe protects every purchase with our comprehensive Buyer Guarantee. You're covered if tickets are invalid, counterfeit, or the event is cancelled.
                  </p>
                  <div className="grid md:grid-cols-2 gap-3 text-sm">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" />
                      <span>Full refund for invalid tickets</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" />
                      <span>Full refund for cancelled events</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" />
                      <span>5-10 business day processing</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" />
                      <span>Dedicated support team</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="space-y-8">
                {/* Introduction */}
                <section>
                  <h2 className="text-2xl font-semibold mb-4">1. Overview</h2>
                  <div className="space-y-3 text-muted-foreground">
                    <p>
                      At TicketSafe, we understand that plans change and issues can arise. This Refund & Cancellation Policy explains when refunds are available, how to request them, and what to expect during the process.
                    </p>
                    <p>
                      This policy applies to all ticket purchases made through the TicketSafe platform. By making a purchase, you agree to the terms outlined in this policy.
                    </p>
                  </div>
                </section>

                <Separator />

                {/* Buyer Refunds */}
                <section id="buyer-refunds">
                  <div className="flex items-start gap-3 mb-4">
                    <RefreshCcw className="h-6 w-6 text-primary mt-1" />
                    <h2 className="text-2xl font-semibold">2. Buyer Refund Eligibility</h2>
                  </div>

                  <div className="space-y-6">
                    {/* Eligible Cases */}
                    <div className="border-l-4 border-green-500 pl-4">
                      <h3 className="font-semibold text-foreground text-lg mb-3 flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        2.1 Eligible for Full Refund
                      </h3>
                      <p className="text-muted-foreground mb-3">
                        You are entitled to a full refund (ticket price + platform fee) in the following situations:
                      </p>
                      <div className="space-y-3">
                        <div className="bg-muted/50 p-4 rounded-lg">
                          <h4 className="font-semibold text-foreground mb-2">Invalid or Counterfeit Tickets</h4>
                          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
                            <li>Tickets are determined to be fake or counterfeit</li>
                            <li>QR codes are invalid or non-functional</li>
                            <li>Tickets have already been used or cancelled</li>
                            <li>Tickets do not grant access to the stated event</li>
                          </ul>
                        </div>

                        <div className="bg-muted/50 p-4 rounded-lg">
                          <h4 className="font-semibold text-foreground mb-2">Event Cancellation</h4>
                          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
                            <li>Event is officially cancelled by the organizer</li>
                            <li>Event is postponed indefinitely with no rescheduled date</li>
                            <li>Event venue is changed to a significantly different location</li>
                          </ul>
                          <p className="text-xs text-muted-foreground mt-2 italic">
                            Note: For rescheduled events, tickets typically remain valid for the new date. Refunds may be available at organizer's discretion.
                          </p>
                        </div>

                        <div className="bg-muted/50 p-4 rounded-lg">
                          <h4 className="font-semibold text-foreground mb-2">Seller Non-Delivery</h4>
                          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
                            <li>Seller fails to transfer tickets within 24 hours of purchase</li>
                            <li>Seller cancels the listing after your purchase</li>
                            <li>Tickets are not delivered before the event date</li>
                          </ul>
                        </div>

                        <div className="bg-muted/50 p-4 rounded-lg">
                          <h4 className="font-semibold text-foreground mb-2">Duplicate Listings</h4>
                          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
                            <li>Same tickets were sold multiple times</li>
                            <li>Tickets are not unique as advertised</li>
                          </ul>
                        </div>

                        <div className="bg-muted/50 p-4 rounded-lg">
                          <h4 className="font-semibold text-foreground mb-2">Platform Error</h4>
                          <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
                            <li>Technical error resulted in incorrect charge</li>
                            <li>Duplicate payment was processed</li>
                            <li>System malfunction affecting your order</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* Not Eligible Cases */}
                    <div className="border-l-4 border-red-500 pl-4">
                      <h3 className="font-semibold text-foreground text-lg mb-3 flex items-center gap-2">
                        <XCircle className="h-5 w-5 text-red-600" />
                        2.2 NOT Eligible for Refund
                      </h3>
                      <p className="text-muted-foreground mb-3">
                        Refunds are NOT available in the following circumstances:
                      </p>
                      <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                        <li><strong>Change of mind:</strong> You decided you no longer want to attend</li>
                        <li><strong>Schedule conflicts:</strong> You have other plans or cannot make it</li>
                        <li><strong>Travel issues:</strong> Unable to reach the venue due to personal circumstances</li>
                        <li><strong>Event quality:</strong> You didn't enjoy the event or it didn't meet expectations</li>
                        <li><strong>Minor event changes:</strong> Small changes to lineup, schedule, or program</li>
                        <li><strong>Weather conditions:</strong> Event proceeds despite bad weather (unless officially cancelled)</li>
                        <li><strong>Personal emergencies:</strong> Medical issues, family emergencies, or other personal reasons</li>
                        <li><strong>Resale attempts:</strong> You tried to resell but couldn't find a buyer</li>
                      </ul>
                      <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mt-4">
                        <p className="text-sm text-amber-900 dark:text-amber-100">
                          <AlertCircle className="w-4 h-4 inline mr-1" />
                          <strong>Recommendation:</strong> If you can't attend, consider reselling your tickets on TicketSafe rather than requesting a refund.
                        </p>
                      </div>
                    </div>
                  </div>
                </section>

                <Separator />

                {/* Refund Process */}
                <section id="refund-process">
                  <div className="flex items-start gap-3 mb-4">
                    <Clock className="h-6 w-6 text-primary mt-1" />
                    <h2 className="text-2xl font-semibold">3. How to Request a Refund</h2>
                  </div>
                  <div className="space-y-3 text-muted-foreground">
                    <h3 className="font-semibold text-foreground text-lg">3.1 Refund Request Process</h3>
                    <p>To request a refund, follow these steps:</p>
                    <div className="space-y-3 mt-4">
                      <div className="flex gap-4">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                          1
                        </div>
                        <div>
                          <h4 className="font-semibold text-foreground mb-1">Contact Support</h4>
                          <p className="text-sm">
                            Email ticketsafe.friendly@gmail.com with subject "Refund Request - [Order ID]"
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-4">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                          2
                        </div>
                        <div>
                          <h4 className="font-semibold text-foreground mb-1">Provide Details</h4>
                          <p className="text-sm mb-2">Include the following information:</p>
                          <ul className="list-disc pl-6 text-sm space-y-1">
                            <li>Order/Transaction ID</li>
                            <li>Event name and date</li>
                            <li>Reason for refund request</li>
                            <li>Supporting evidence (screenshots, official cancellation notice, etc.)</li>
                          </ul>
                        </div>
                      </div>

                      <div className="flex gap-4">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                          3
                        </div>
                        <div>
                          <h4 className="font-semibold text-foreground mb-1">Review Process</h4>
                          <p className="text-sm">
                            Our team will review your request within 1-3 business days and respond via email
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-4">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                          4
                        </div>
                        <div>
                          <h4 className="font-semibold text-foreground mb-1">Refund Processing</h4>
                          <p className="text-sm">
                            If approved, refunds are processed within 5-10 business days to your original payment method
                          </p>
                        </div>
                      </div>
                    </div>

                    <h3 className="font-semibold text-foreground text-lg mt-6">3.2 Required Documentation</h3>
                    <p>Depending on your refund reason, you may need to provide:</p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>Screenshots of error messages or invalid QR codes</li>
                      <li>Official event cancellation announcement (link or screenshot)</li>
                      <li>Communication with seller (if applicable)</li>
                      <li>Proof of denied entry (photo, organizer statement)</li>
                      <li>Order confirmation email</li>
                    </ul>

                    <h3 className="font-semibold text-foreground text-lg mt-6">3.3 Refund Timeline</h3>
                    <div className="bg-muted/50 p-4 rounded-lg">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2">Stage</th>
                            <th className="text-left py-2">Timeframe</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b">
                            <td className="py-2">Initial Response</td>
                            <td className="py-2">1-3 business days</td>
                          </tr>
                          <tr className="border-b">
                            <td className="py-2">Investigation & Decision</td>
                            <td className="py-2">3-5 business days</td>
                          </tr>
                          <tr className="border-b">
                            <td className="py-2">Refund Processing</td>
                            <td className="py-2">5-10 business days</td>
                          </tr>
                          <tr>
                            <td className="py-2 font-semibold">Total Time</td>
                            <td className="py-2 font-semibold">Up to 18 business days</td>
                          </tr>
                        </tbody>
                      </table>
                      <p className="text-xs text-muted-foreground mt-3">
                        Note: Bank processing times may add 2-5 additional business days
                      </p>
                    </div>
                  </div>
                </section>

                <Separator />

                {/* Seller Cancellations */}
                <section id="seller-cancellations">
                  <h2 className="text-2xl font-semibold mb-4">4. Seller Cancellation Policy</h2>
                  <div className="space-y-3 text-muted-foreground">
                    <h3 className="font-semibold text-foreground text-lg">4.1 Before Purchase</h3>
                    <p>Sellers may cancel or remove listings at any time before a buyer completes a purchase. No penalties apply.</p>

                    <h3 className="font-semibold text-foreground text-lg mt-4">4.2 After Purchase</h3>
                    <p>
                      If a seller cancels after a buyer has completed payment:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>Buyer receives an automatic full refund (including platform fee)</li>
                      <li>Seller may face account suspension or penalties</li>
                      <li>Seller's reputation score is negatively impacted</li>
                      <li>Repeated cancellations may result in permanent ban</li>
                    </ul>

                    <h3 className="font-semibold text-foreground text-lg mt-4">4.3 Legitimate Seller Cancellations</h3>
                    <p>Sellers may cancel after purchase without penalty only if:</p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>The event is officially cancelled by the organizer</li>
                      <li>Tickets were lost or stolen (with police report)</li>
                      <li>Platform error or system malfunction</li>
                    </ul>
                  </div>
                </section>

                <Separator />

                {/* Event Cancellations */}
                <section id="event-cancellations">
                  <h2 className="text-2xl font-semibold mb-4">5. Event Cancellations & Changes</h2>
                  <div className="space-y-3 text-muted-foreground">
                    <h3 className="font-semibold text-foreground text-lg">5.1 Official Event Cancellation</h3>
                    <p>
                      If an event is officially cancelled by the organizer:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>All buyers are eligible for a full refund (ticket price + platform fee)</li>
                      <li>Refunds are processed automatically when we're notified</li>
                      <li>You may also contact the original event organizer for a refund</li>
                      <li>TicketSafe will assist with refund coordination</li>
                    </ul>

                    <h3 className="font-semibold text-foreground text-lg mt-4">5.2 Event Postponement</h3>
                    <p>
                      If an event is postponed to a new date:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>Tickets typically remain valid for the rescheduled date</li>
                      <li>Refunds are at the event organizer's discretion</li>
                      <li>You may resell your tickets on TicketSafe if you can't attend the new date</li>
                      <li>Contact support if the organizer offers refunds</li>
                    </ul>

                    <h3 className="font-semibold text-foreground text-lg mt-4">5.3 Event Changes</h3>
                    <p>
                      Minor changes to event details (time, performer lineup, venue section) typically do not qualify for refunds unless:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>The venue changes to a different city</li>
                      <li>The headliner/main attraction is cancelled</li>
                      <li>The event duration is reduced by more than 50%</li>
                    </ul>
                  </div>
                </section>

                <Separator />

                {/* Partial Refunds */}
                <section id="partial-refunds">
                  <h2 className="text-2xl font-semibold mb-4">6. Partial Refunds</h2>
                  <div className="space-y-3 text-muted-foreground">
                    <p>
                      In certain situations, a partial refund may be offered:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li><strong>Incorrect ticket description:</strong> If tickets don't match listing (different section, obstructed view), you may receive a partial refund based on the price difference</li>
                      <li><strong>Dispute resolution:</strong> If both buyer and seller share responsibility for an issue</li>
                      <li><strong>Goodwill gestures:</strong> At TicketSafe's discretion for exceptional circumstances</li>
                    </ul>
                    <p className="mt-3">
                      Partial refunds are determined on a case-by-case basis and require support team approval.
                    </p>
                  </div>
                </section>

                <Separator />

                {/* Fees */}
                <section id="fees">
                  <h2 className="text-2xl font-semibold mb-4">7. Refund Fees & Charges</h2>
                  <div className="space-y-3 text-muted-foreground">
                    <h3 className="font-semibold text-foreground text-lg">7.1 Buyer Refunds</h3>
                    <p>
                      When you receive a full refund for an eligible reason:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>You receive 100% of the ticket price</li>
                      <li>You receive 100% of the platform fee (5%)</li>
                      <li>No refund processing fees are charged</li>
                    </ul>

                    <h3 className="font-semibold text-foreground text-lg mt-4">7.2 Payment Processing Fees</h3>
                    <p>
                      Please note that payment processor fees (Revolut/Stripe) are non-refundable. These fees are charged by third parties and are typically less than 2% of the transaction.
                    </p>

                    <h3 className="font-semibold text-foreground text-lg mt-4">7.3 Currency Conversion</h3>
                    <p>
                      If currency conversion was applied during purchase, refunds are processed in the original currency. Exchange rate fluctuations may result in slight differences.
                    </p>
                  </div>
                </section>

                <Separator />

                {/* Disputes */}
                <section id="disputes">
                  <h2 className="text-2xl font-semibold mb-4">8. Dispute Resolution</h2>
                  <div className="space-y-3 text-muted-foreground">
                    <h3 className="font-semibold text-foreground text-lg">8.1 Buyer-Seller Disputes</h3>
                    <p>
                      If you have an issue with a transaction:
                    </p>
                    <ol className="list-decimal pl-6 space-y-2">
                      <li>First, try to resolve it directly with the other party through the platform</li>
                      <li>If unresolved within 48 hours, contact TicketSafe support</li>
                      <li>Provide all relevant evidence and communication history</li>
                      <li>Our mediation team will investigate and make a fair decision</li>
                    </ol>

                    <h3 className="font-semibold text-foreground text-lg mt-4">8.2 Chargebacks</h3>
                    <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                      <p className="text-sm text-amber-900 dark:text-amber-100">
                        <AlertCircle className="w-4 h-4 inline mr-1" />
                        <strong>Important:</strong> Please contact TicketSafe support before filing a chargeback with your bank. Chargebacks can result in account suspension and may prevent you from receiving help through our dispute resolution process.
                      </p>
                    </div>

                    <h3 className="font-semibold text-foreground text-lg mt-4">8.3 Appeals</h3>
                    <p>
                      If your refund request is denied and you disagree with the decision:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>You may submit an appeal within 14 days</li>
                      <li>Provide any additional evidence or information</li>
                      <li>Appeals are reviewed by a senior support team member</li>
                      <li>Final decisions are communicated within 5 business days</li>
                    </ul>
                  </div>
                </section>

                <Separator />

                {/* Contact */}
                <section id="contact">
                  <h2 className="text-2xl font-semibold mb-4">9. Contact & Support</h2>
                  <div className="space-y-3 text-muted-foreground">
                    <p>
                      For refund requests, questions, or assistance:
                    </p>
                    <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                      <p className="font-medium text-foreground">TicketSafe Customer Support</p>
                      <p>Email: <a href="mailto:ticketsafe.friendly@gmail.com" className="text-primary hover:underline">ticketsafe.friendly@gmail.com</a></p>
                      <p>Subject Line Format: "Refund Request - [Your Order ID]"</p>
                      <p className="text-sm">Response Time: 1-3 business days</p>
                    </div>
                    <p className="text-sm mt-4">
                      For urgent issues within 24 hours of an event, please mark your email as "URGENT" in the subject line.
                    </p>
                  </div>
                </section>

                <Separator />

                {/* Policy Changes */}
                <section id="changes">
                  <h2 className="text-2xl font-semibold mb-4">10. Changes to This Policy</h2>
                  <div className="space-y-3 text-muted-foreground">
                    <p>
                      TicketSafe reserves the right to modify this Refund & Cancellation Policy at any time. Changes will be posted on this page with an updated "Last Updated" date.
                    </p>
                    <p>
                      Material changes affecting pending refund requests will be communicated via email. By continuing to use TicketSafe after changes are posted, you accept the updated policy.
                    </p>
                  </div>
                </section>
              </div>
            </CardContent>
          </Card>

          <div className="text-center text-sm text-muted-foreground mb-8">
            <p>This Refund Policy is part of our Terms & Conditions. By using TicketSafe, you agree to this policy.</p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default RefundPolicy;
