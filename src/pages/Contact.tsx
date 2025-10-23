import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Mail, HelpCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const Contact = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="container mx-auto px-4 py-16 flex-1">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <BackButton />
          </div>
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">Contact Us</h1>
            <p className="text-lg text-muted-foreground">
              We're here to help! Reach out to us anytime.
            </p>
          </div>

          <div className="max-w-2xl mx-auto mb-12">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="w-5 h-5 text-primary" />
                  Email Support
                </CardTitle>
                <CardDescription>
                  Send us an email and we'll respond within 24 hours
                </CardDescription>
              </CardHeader>
              <CardContent>
                <a 
                  href="mailto:ticketsafe.friendly@gmail.com"
                  className="text-primary hover:underline text-lg font-medium"
                >
                  ticketsafe.friendly@gmail.com
                </a>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-primary" />
                Frequently Asked Questions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">How do I verify my university email?</h3>
                <p className="text-muted-foreground">
                  Simply sign up with your university email address. We automatically verify university domains.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">How does the escrow system work?</h3>
                <p className="text-muted-foreground">
                  When you purchase a ticket, the payment is held securely until you confirm receipt of the ticket. This protects both buyers and sellers.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">How does pricing work?</h3>
                <p className="text-muted-foreground">
                  Students can freely set their own resale prices. We encourage fair and reasonable pricing to maintain trust within our student community.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Is my payment information secure?</h3>
                <p className="text-muted-foreground">
                  Yes! We use industry-standard encryption and secure payment processing through trusted providers.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Contact;