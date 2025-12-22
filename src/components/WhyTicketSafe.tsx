import { Shield, CreditCard, CheckCircle, AlertTriangle, XCircle, DollarSign } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Link } from "react-router-dom";

const WhyTicketSafe = () => {
  const benefits = [
    {
      icon: Shield,
      title: "Verified Tickets",
      ticketSafe: "All tickets authenticated before sale",
      informal: "Risk of fake or invalid tickets",
      risk: true,
    },
    {
      icon: CreditCard,
      title: "Secure Payment",
      ticketSafe: "Protected payment system with buyer guarantee",
      informal: "Cash or risky bank transfers",
      risk: true,
    },
    {
      icon: DollarSign,
      title: "Fair Pricing",
      ticketSafe: "Transparent prices with 5% platform fee",
      informal: "Unpredictable prices, often overpriced",
      risk: true,
    },
    {
      icon: CheckCircle,
      title: "Support & Trust",
      ticketSafe: "Customer support and secure platform",
      informal: "No support, trust-based only",
      risk: true,
    },
  ];

  return (
    <section className="py-16 md:py-24 bg-background">
      <div className="container mx-auto px-4 max-w-7xl">
        {/* Header */}
        <div className="text-center mb-12 md:mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Why Ticket Safe?
          </h2>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            Stop worrying about risky student resales. Ticket Safe provides a secure,
            trusted platform for buying and selling ESCP event tickets between verified students.
          </p>
        </div>

        {/* Comparison Table */}
        <div className="max-w-5xl mx-auto">
          {/* Table Header */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="col-span-1"></div>
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-full h-12 bg-primary/10 rounded-lg mb-2">
                <Shield className="w-5 h-5 text-primary mr-2" />
                <span className="font-bold text-primary">Ticket Safe</span>
              </div>
            </div>
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-full h-12 bg-muted rounded-lg mb-2">
                <AlertTriangle className="w-5 h-5 text-muted-foreground mr-2" />
                <span className="font-semibold text-muted-foreground">Informal Student Resales</span>
              </div>
              <p className="text-xs text-muted-foreground">(WhatsApp, Instagram, Cash)</p>
            </div>
          </div>

          {/* Benefits Rows */}
          <div className="space-y-4">
            {benefits.map((benefit, index) => {
              const Icon = benefit.icon;
              return (
                <Card key={index} className="p-6 hover:shadow-lg transition-shadow">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                    {/* Feature Name */}
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
                      <span className="font-semibold">{benefit.title}</span>
                    </div>

                    {/* Ticket Safe Column */}
                    <div className="flex items-start gap-2">
                      <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <span className="text-sm">{benefit.ticketSafe}</span>
                    </div>

                    {/* Informal Resales Column */}
                    <div className="flex items-start gap-2">
                      <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-muted-foreground">{benefit.informal}</span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Bottom CTA */}
          <div className="mt-12 p-8 bg-gradient-to-r from-primary/10 to-accent/10 rounded-xl text-center">
            <h3 className="text-2xl font-bold mb-3">
              Ready to buy or sell safely?
            </h3>
            <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
              Join hundreds of ESCP students who trust Ticket Safe for secure ticket resales.
              No more stress, no more scams—just safe transactions.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/events"
                className="inline-flex items-center justify-center h-11 px-8 bg-primary text-primary-foreground font-semibold rounded-md hover:bg-primary/90 transition-colors"
              >
                Browse Available Events
              </Link>
              <Link
                to="/sell"
                className="inline-flex items-center justify-center h-11 px-8 bg-background border border-border font-semibold rounded-md hover:bg-muted transition-colors"
              >
                Sell Your Ticket
              </Link>
            </div>
          </div>
        </div>

        {/* Trust Indicators */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          <div className="text-center">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <h4 className="font-semibold mb-2">100% Secure</h4>
            <p className="text-sm text-muted-foreground">
              All transactions protected with buyer guarantee
            </p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle className="w-6 h-6 text-primary" />
            </div>
            <h4 className="font-semibold mb-2">Verified Students</h4>
            <p className="text-sm text-muted-foreground">
              Only ESCP students can buy and sell
            </p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
              <CreditCard className="w-6 h-6 text-primary" />
            </div>
            <h4 className="font-semibold mb-2">Simple & Fast</h4>
            <p className="text-sm text-muted-foreground">
              List or buy tickets in less than 2 minutes
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WhyTicketSafe;
