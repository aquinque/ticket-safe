import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { SEOHead } from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Link } from "react-router-dom";
import {
  Search,
  ShoppingCart,
  ShieldCheck,
  Ticket,
  Upload,
  CreditCard,
  CheckCircle2,
  ArrowRight,
  Users,
  Lock,
  Star,
  HelpCircle,
  GraduationCap,
  Banknote,
  QrCode,
  Bell,
} from "lucide-react";

const buyerSteps = [
  {
    step: "01",
    icon: GraduationCap,
    title: "Create Your Account",
    description:
      "Sign up with your university email address. We verify you're a real student instantly — no ID required.",
    detail: "Only verified students can access the platform, keeping the community safe.",
    color: "bg-primary/10",
    iconColor: "text-primary",
  },
  {
    step: "02",
    icon: Search,
    title: "Browse Available Tickets",
    description:
      "Explore tickets for ESCP events — galas, ski trips, parties, conferences and more. Filter by price, date, or category.",
    detail: "Every listing is posted by a verified student. No scammers, no bots.",
    color: "bg-blue-500/10",
    iconColor: "text-blue-500",
  },
  {
    step: "03",
    icon: ShieldCheck,
    title: "Buy with Confidence",
    description:
      "Click 'Buy' and pay securely through our platform. Your money is held in escrow — the seller only gets paid after you confirm receipt.",
    detail: "100% money-back guarantee if the ticket is invalid or the event is cancelled.",
    color: "bg-green-500/10",
    iconColor: "text-green-500",
  },
  {
    step: "04",
    icon: QrCode,
    title: "Receive Your Ticket",
    description:
      "The seller transfers your ticket digitally within 24 hours. Your QR code is verified and ready to scan at the door.",
    detail: "All tickets are authenticated by TicketSafe before transfer.",
    color: "bg-purple-500/10",
    iconColor: "text-purple-500",
  },
  {
    step: "05",
    icon: Star,
    title: "Attend & Enjoy",
    description:
      "Show your verified QR code at the event entrance and enjoy the experience stress-free.",
    detail: "Rate your experience to help the community.",
    color: "bg-amber-500/10",
    iconColor: "text-amber-500",
  },
];

const sellerSteps = [
  {
    step: "01",
    icon: GraduationCap,
    title: "Create Your Account",
    description:
      "Sign up with your university email. Your student status is verified instantly.",
    detail: "One account for both buying and selling.",
    color: "bg-primary/10",
    iconColor: "text-primary",
  },
  {
    step: "02",
    icon: Upload,
    title: "List Your Ticket",
    description:
      "Select your event, set a fair price, upload your ticket photo or QR code. Our system verifies authenticity automatically.",
    detail: "Listings go live in under 2 minutes.",
    color: "bg-blue-500/10",
    iconColor: "text-blue-500",
  },
  {
    step: "03",
    icon: Bell,
    title: "Get Notified of a Sale",
    description:
      "We notify you instantly when someone buys your ticket. No need to negotiate — the price is fixed and clear.",
    detail: "Buyers can't haggle — your price is your price.",
    color: "bg-green-500/10",
    iconColor: "text-green-500",
  },
  {
    step: "04",
    icon: QrCode,
    title: "Transfer the Ticket",
    description:
      "Send the QR code or ticket file to the buyer through the platform within 24 hours of the sale.",
    detail: "The buyer confirms receipt before funds are released.",
    color: "bg-purple-500/10",
    iconColor: "text-purple-500",
  },
  {
    step: "05",
    icon: Banknote,
    title: "Get Paid",
    description:
      "Once the buyer confirms the ticket, we release 100% of the sale price directly to you within 24–48 hours.",
    detail: "You keep 100% — the buyer pays the 5% platform fee on top.",
    color: "bg-amber-500/10",
    iconColor: "text-amber-500",
  },
];

const faqs = [
  {
    question: "How does TicketSafe verify students?",
    answer:
      "We verify using your university email address. When you sign up, we check that your email belongs to a recognised academic institution. Only verified students can buy or sell on the platform.",
  },
  {
    question: "What if the ticket turns out to be fake?",
    answer:
      "You're fully protected. Every ticket is verified by our system before it goes live. If a ticket is somehow invalid, you receive a 100% refund — including the platform fee — within 5–10 business days.",
  },
  {
    question: "How long until the seller gets paid?",
    answer:
      "Sellers are paid within 24–48 hours after the buyer confirms receipt of the ticket. Funds are held in escrow until then to protect both parties.",
  },
  {
    question: "Can I cancel my listing after posting it?",
    answer:
      "Yes — you can remove your listing at any time before a buyer completes a purchase. Once a purchase is made, cancellation may result in a penalty to protect the buyer.",
  },
  {
    question: "What is the 5% platform fee?",
    answer:
      "The 5% fee is paid by the buyer on top of the ticket price. Sellers receive 100% of their asking price. The fee covers secure payment processing, ticket verification, and buyer protection.",
  },
  {
    question: "What happens if the event is cancelled?",
    answer:
      "If the event is officially cancelled by the organiser, all buyers receive a full refund automatically — ticket price plus the platform fee.",
  },
];

const HowItWorks = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead
        titleKey="How It Works - TicketSafe"
        descriptionKey="Learn how TicketSafe works for buyers and sellers. Secure, verified student ticket marketplace with escrow payments and 100% buyer protection."
      />
      <Header />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-gradient-to-b from-background to-muted/20 py-16 md:py-24">
          <div className="absolute inset-0 bg-gradient-hero opacity-5" />
          <div className="relative container mx-auto px-4 text-center">
            <Badge variant="outline" className="mb-6 px-4 py-1.5 text-sm font-medium">
              Simple & Secure
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              <span className="bg-gradient-hero bg-clip-text text-transparent">
                How TicketSafe
              </span>
              <br />
              <span className="text-foreground">Works</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
              Buy and sell student event tickets safely in 5 simple steps.
              Every transaction is protected with escrow payments and full buyer guarantee.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button variant="hero" size="lg" asChild className="h-12 px-8 font-semibold">
                <Link to="/events">
                  <Search className="w-5 h-5" />
                  Browse Tickets
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </Button>
              <Button variant="marketplace" size="lg" asChild className="h-12 px-8 font-semibold">
                <Link to="/sell">
                  <Ticket className="w-5 h-5" />
                  Sell a Ticket
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Trust Bar */}
        <section className="border-y border-border bg-muted/30 py-6">
          <div className="container mx-auto px-4">
            <div className="flex flex-wrap items-center justify-center gap-6 md:gap-12 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-green-500" />
                <span className="font-medium">100% Buyer Guarantee</span>
              </div>
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-primary" />
                <span className="font-medium">Escrow Payments</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-500" />
                <span className="font-medium">Verified Students Only</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-amber-500" />
                <span className="font-medium">Authenticated Tickets</span>
              </div>
            </div>
          </div>
        </section>

        {/* Buyer Steps */}
        <section className="py-16 md:py-24">
          <div className="container mx-auto px-4 max-w-5xl">
            <div className="text-center mb-12">
              <Badge className="mb-4 bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">
                <ShoppingCart className="w-3.5 h-3.5 mr-1" />
                For Buyers
              </Badge>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Buy a Ticket in 5 Steps
              </h2>
              <p className="text-muted-foreground text-lg max-w-xl mx-auto">
                From browsing to attending — the whole process takes minutes and your money is always protected.
              </p>
            </div>

            <div className="relative">
              {/* Vertical line connector */}
              <div className="absolute left-8 top-10 bottom-10 w-0.5 bg-border hidden md:block" />

              <div className="space-y-6">
                {buyerSteps.map((step, index) => {
                  const Icon = step.icon;
                  return (
                    <div key={index} className="flex gap-6 items-start group">
                      {/* Step Number + Icon */}
                      <div className="flex-shrink-0 relative z-10">
                        <div className={`w-16 h-16 rounded-2xl ${step.color} flex items-center justify-center border border-border group-hover:scale-105 transition-transform`}>
                          <Icon className={`w-7 h-7 ${step.iconColor}`} />
                        </div>
                        <span className="absolute -top-2 -right-2 w-6 h-6 bg-primary text-primary-foreground text-xs font-bold rounded-full flex items-center justify-center">
                          {index + 1}
                        </span>
                      </div>

                      {/* Content */}
                      <Card className="flex-1 group-hover:shadow-md transition-shadow">
                        <CardContent className="pt-5 pb-5">
                          <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                          <p className="text-muted-foreground mb-3">{step.description}</p>
                          <div className="flex items-start gap-2 text-sm text-green-600 dark:text-green-400">
                            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <span>{step.detail}</span>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="text-center mt-10">
              <Button variant="hero" size="lg" asChild className="h-12 px-8 font-semibold">
                <Link to="/events">
                  Start Browsing Tickets
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <Separator />

        {/* Seller Steps */}
        <section className="py-16 md:py-24 bg-muted/20">
          <div className="container mx-auto px-4 max-w-5xl">
            <div className="text-center mb-12">
              <Badge className="mb-4 bg-secondary/10 text-secondary border-secondary/20 hover:bg-secondary/10">
                <CreditCard className="w-3.5 h-3.5 mr-1" />
                For Sellers
              </Badge>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Sell a Ticket in 5 Steps
              </h2>
              <p className="text-muted-foreground text-lg max-w-xl mx-auto">
                List your ticket in under 2 minutes and get paid directly — with zero risk of non-payment.
              </p>
            </div>

            <div className="relative">
              <div className="absolute left-8 top-10 bottom-10 w-0.5 bg-border hidden md:block" />

              <div className="space-y-6">
                {sellerSteps.map((step, index) => {
                  const Icon = step.icon;
                  return (
                    <div key={index} className="flex gap-6 items-start group">
                      <div className="flex-shrink-0 relative z-10">
                        <div className={`w-16 h-16 rounded-2xl ${step.color} flex items-center justify-center border border-border group-hover:scale-105 transition-transform`}>
                          <Icon className={`w-7 h-7 ${step.iconColor}`} />
                        </div>
                        <span className="absolute -top-2 -right-2 w-6 h-6 bg-secondary text-secondary-foreground text-xs font-bold rounded-full flex items-center justify-center">
                          {index + 1}
                        </span>
                      </div>

                      <Card className="flex-1 group-hover:shadow-md transition-shadow">
                        <CardContent className="pt-5 pb-5">
                          <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                          <p className="text-muted-foreground mb-3">{step.description}</p>
                          <div className="flex items-start gap-2 text-sm text-green-600 dark:text-green-400">
                            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <span>{step.detail}</span>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="text-center mt-10">
              <Button variant="marketplace" size="lg" asChild className="h-12 px-8 font-semibold">
                <Link to="/sell">
                  List Your Ticket Now
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <Separator />

        {/* Price Breakdown */}
        <section className="py-16 md:py-24">
          <div className="container mx-auto px-4 max-w-3xl text-center">
            <Badge variant="outline" className="mb-6 px-4 py-1.5 text-sm">
              Transparent Pricing
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Simple, Fair Fees
            </h2>
            <p className="text-muted-foreground text-lg mb-12">
              No hidden costs. No surprises. Just one small fee for a safe transaction.
            </p>

            <Card className="overflow-hidden">
              <CardContent className="p-0">
                {/* Example */}
                <div className="p-6 bg-muted/30">
                  <p className="text-sm text-muted-foreground mb-4 font-medium">EXAMPLE: €50 ticket</p>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Ticket price (set by seller)</span>
                      <span className="font-semibold">€50.00</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Platform fee (paid by buyer)</span>
                      <span className="font-semibold text-primary">+€2.50 (5%)</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between items-center">
                      <span className="font-bold">Buyer pays</span>
                      <span className="font-bold text-lg">€52.50</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-green-600">Seller receives</span>
                      <span className="font-bold text-lg text-green-600">€50.00</span>
                    </div>
                  </div>
                </div>

                {/* Key Points */}
                <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
                  <div className="p-6 text-center">
                    <p className="text-3xl font-bold text-primary mb-1">5%</p>
                    <p className="text-sm text-muted-foreground">Platform fee (paid by buyer)</p>
                  </div>
                  <div className="p-6 text-center">
                    <p className="text-3xl font-bold text-green-600 mb-1">0%</p>
                    <p className="text-sm text-muted-foreground">Fee for sellers</p>
                  </div>
                  <div className="p-6 text-center">
                    <p className="text-3xl font-bold text-blue-500 mb-1">24h</p>
                    <p className="text-sm text-muted-foreground">Seller payout time</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <Separator />

        {/* FAQ */}
        <section className="py-16 md:py-24 bg-muted/20">
          <div className="container mx-auto px-4 max-w-3xl">
            <div className="text-center mb-12">
              <Badge variant="outline" className="mb-4 px-4 py-1.5 text-sm">
                <HelpCircle className="w-3.5 h-3.5 mr-1" />
                FAQ
              </Badge>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Common Questions
              </h2>
              <p className="text-muted-foreground text-lg">
                Everything you need to know before your first transaction.
              </p>
            </div>

            <div className="space-y-4">
              {faqs.map((faq, index) => (
                <Card key={index} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-5 pb-5">
                    <h3 className="font-semibold text-base mb-2 flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      {faq.question}
                    </h3>
                    <p className="text-muted-foreground text-sm leading-relaxed pl-6">
                      {faq.answer}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="text-center mt-10">
              <p className="text-muted-foreground mb-4">Still have questions?</p>
              <Button variant="outline" asChild>
                <Link to="/contact">
                  Contact Us
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-16 md:py-24">
          <div className="container mx-auto px-4 max-w-3xl text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Ready to Get Started?
            </h2>
            <p className="text-muted-foreground text-lg mb-10">
              Join hundreds of ESCP students already buying and selling safely on TicketSafe.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button variant="hero" size="lg" asChild className="h-12 px-8 font-semibold">
                <Link to="/auth?mode=signup">
                  <GraduationCap className="w-5 h-5" />
                  Create Free Account
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" asChild className="h-12 px-8">
                <Link to="/events">Browse Tickets First</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default HowItWorks;
