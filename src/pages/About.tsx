import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Users, 
  Shield, 
  Target, 
  TrendingUp, 
  School, 
  Globe, 
  Heart,
  CheckCircle2,
  ArrowRight
} from "lucide-react";
import { Link } from "react-router-dom";

const About = () => {
  const features = [
    {
      icon: Shield,
      title: "Safety and Trust",
      description: "All tickets are verified to ensure authenticity, and only verified students can join the platform—preventing scams and ensuring a trustworthy community."
    },
    {
      icon: Users,
      title: "Student-Only Community",
      description: "Exclusively for verified university students (like ESCP), creating a safe and transparent marketplace among peers."
    },
    {
      icon: Target,
      title: "User-Focused Experience",
      description: "Smooth interface, secure payments, and responsive support—making buying and selling tickets fast and easy."
    },
  ];

  const roadmapSteps = [
    {
      phase: "Phase 1",
      title: "ESCP",
      description: "Pilot launch with ESCP Business School",
      status: "active",
      features: ["ESCP Student Events", "Verification System", "Secure Payments"]
    },
    {
      phase: "Phase 2", 
      title: "Business Schools Expansion",
      description: "Partnerships with student associations from top schools",
      status: "planned",
      features: ["HEC, ESCP, Mines", "Inter-school Network", "Cross Events"]
    },
    {
      phase: "Phase 3",
      title: "Public Events",
      description: "Opening to concerts and general public events",
      status: "future",
      features: ["Public Concerts", "Festivals", "Theaters and Shows"]
    }
  ];

  const values = [
    {
      title: "Transparency",
      description: "Fair and transparent pricing set by students themselves"
    },
    {
      title: "Security", 
      description: "Protected payments and verified student community"
    },
    {
      title: "Authenticity",
      description: "All tickets verified to ensure legitimacy—no fakes"
    },
    {
      title: "Trust",
      description: "Legal and safe student-to-student marketplace"
    }
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-20 bg-gradient-card">
          <div className="container mx-auto px-4">
            <div className="mb-6">
              <BackButton />
            </div>
            <div className="max-w-4xl mx-auto text-center">
              <Badge variant="secondary" className="mb-4">
                About Ticket Safe
              </Badge>
              <h1 className="text-4xl md:text-5xl font-bold mb-6">
                Revolutionizing{" "}
                <span className="bg-gradient-hero bg-clip-text text-transparent">
                  student
                </span>
                {" "}ticket resale
              </h1>
              <p className="text-lg text-muted-foreground mb-8 max-w-3xl mx-auto">
                Ticket Safe was born from a simple belief: ticket resale must be safe, 
                legal, and transparent for the student community. We provide a trusted 
                marketplace where verified students can buy and sell tickets securely.
              </p>
            </div>
          </div>
        </section>

        {/* Mission & Vision */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl font-bold mb-6">Our Mission</h2>
                <p className="text-lg text-muted-foreground mb-6">
                  Enable students to buy and sell their event tickets safely and legally, 
                  through a trusted platform with verified users, fraud prevention, 
                  and secure payments—giving students the freedom to set fair prices.
                </p>
                <div className="space-y-4">
                  {features.map((feature, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                        <feature.icon className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold mb-1">{feature.title}</h3>
                        <p className="text-sm text-muted-foreground">{feature.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative">
                <div className="bg-gradient-hero rounded-2xl p-8 text-white">
                  <h3 className="text-2xl font-bold mb-4">Our Values</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {values.map((value, index) => (
                      <div key={index} className="space-y-2">
                        <h4 className="font-semibold">{value.title}</h4>
                        <p className="text-sm text-white/80">{value.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Roadmap */}
        <section className="py-16 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">Our Roadmap</h2>
              <p className="text-lg text-muted-foreground">
                Progressive and controlled development to create the best experience
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {roadmapSteps.map((step, index) => (
                <Card key={index} className={`relative ${
                  step.status === 'active' ? 'ring-2 ring-primary bg-primary/5' : 
                  step.status === 'planned' ? 'bg-secondary/5' : 'bg-muted/50'
                }`}>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <Badge variant={
                        step.status === 'active' ? 'default' :
                        step.status === 'planned' ? 'secondary' : 'outline'
                      }>
                        {step.phase}
                      </Badge>
                      {step.status === 'active' && (
                        <Badge variant="default" className="bg-accent">
                          In Progress
                        </Badge>
                      )}
                    </div>
                    
                    <h3 className="text-xl font-bold mb-2">{step.title}</h3>
                    <p className="text-muted-foreground mb-4">{step.description}</p>
                    
                    <div className="space-y-2">
                      {step.features.map((feature, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className="w-4 h-4 text-accent" />
                          <span>{feature}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Why RESEAT vs Competition */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold mb-4">
                  Why Ticket Safe?
                </h2>
                <p className="text-lg text-muted-foreground">
                  An ethical alternative to market giants
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* RESEAT */}
                <Card className="border-primary bg-primary/5">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-gradient-hero rounded-lg flex items-center justify-center">
                        <Heart className="w-5 h-5 text-white" />
                      </div>
                      <h3 className="text-xl font-bold">Ticket Safe</h3>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-accent mt-0.5" />
                        <span className="text-sm">Verified student community—university emails only</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-accent mt-0.5" />
                        <span className="text-sm">All tickets verified for authenticity</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-accent mt-0.5" />
                        <span className="text-sm">Students set their own fair prices</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-accent mt-0.5" />
                        <span className="text-sm">Secure payments and fraud prevention</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-accent mt-0.5" />
                        <span className="text-sm">Easy-to-use interface and responsive support</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Competition */}
                <Card className="border-muted">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                        <TrendingUp className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <h3 className="text-xl font-bold text-muted-foreground">Other platforms</h3>
                    </div>
                    
                    <div className="space-y-3 text-muted-foreground">
                      <div className="flex items-start gap-2">
                        <div className="w-4 h-4 border border-muted-foreground rounded-full mt-0.5" />
                        <span className="text-sm">No student verification (scams and bots)</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="w-4 h-4 border border-muted-foreground rounded-full mt-0.5" />
                        <span className="text-sm">Higher fees and hidden costs</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="w-4 h-4 border border-muted-foreground rounded-full mt-0.5" />
                        <span className="text-sm">Mixed audience with scalpers</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="w-4 h-4 border border-muted-foreground rounded-full mt-0.5" />
                        <span className="text-sm">Complex and confusing interfaces</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="w-4 h-4 border border-muted-foreground rounded-full mt-0.5" />
                        <span className="text-sm">Automated support with slow responses</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 bg-gradient-hero text-white">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-3xl font-bold mb-4">
                Join the Ticket Safe revolution
              </h2>
              <p className="text-lg text-white/90 mb-8">
                Join a trusted community of verified students. 
                Buy and sell tickets safely, legally, and transparently.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button variant="secondary" size="lg" asChild>
                  <Link to="/events">
                    <School className="w-5 h-5" />
                    Discover events
                    <ArrowRight className="w-5 h-5" />
                  </Link>
                </Button>
                <Button variant="outline" size="lg" className="border-white text-white hover:bg-white hover:text-primary" asChild>
                  <Link to="/sell">
                    Sell your ticket now
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default About;