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
import { useI18n } from "@/contexts/I18nContext";
import { SEOHead } from "@/components/SEOHead";

const About = () => {
  const { t } = useI18n();
  const features = [
    {
      icon: Shield,
      title: t('about.safetyTitle'),
      description: t('about.safetyDesc')
    },
    {
      icon: Users,
      title: t('about.communityTitle'),
      description: t('about.communityDesc')
    },
    {
      icon: Target,
      title: t('about.experienceTitle'),
      description: t('about.experienceDesc')
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
      title: t('about.transparencyTitle'),
      description: t('about.transparencyDesc')
    },
    {
      title: t('about.securityTitle'), 
      description: t('about.securityDesc')
    },
    {
      title: t('about.authenticityTitle'),
      description: t('about.authenticityDesc')
    },
    {
      title: t('about.trustTitle'),
      description: t('about.trustDesc')
    }
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead titleKey="about.title" descriptionKey="about.description" />
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
                {t('about.badge')}
              </Badge>
              <h1 className="text-4xl md:text-5xl font-bold mb-6">
                {t('about.title')}{" "}
                <span className="bg-gradient-hero bg-clip-text text-transparent">
                  {t('about.titleHighlight')}
                </span>
                {" "}{t('about.titleEnd')}
              </h1>
              <p className="text-lg text-muted-foreground mb-8 max-w-3xl mx-auto">
                {t('about.description')}
              </p>
            </div>
          </div>
        </section>

        {/* Mission & Vision */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl font-bold mb-6">{t('about.missionTitle')}</h2>
                <p className="text-lg text-muted-foreground mb-6">
                  {t('about.missionText')}
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
                  <h3 className="text-2xl font-bold mb-4">{t('about.valuesTitle')}</h3>
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
              <h2 className="text-3xl font-bold mb-4">{t('about.roadmapTitle')}</h2>
              <p className="text-lg text-muted-foreground">
                {t('about.roadmapSubtitle')}
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
                        {t(`about.phase${index + 1}`)}
                      </Badge>
                      {step.status === 'active' && (
                        <Badge variant="default" className="bg-accent">
                          {t('about.inProgress')}
                        </Badge>
                      )}
                    </div>
                    
                    <h3 className="text-xl font-bold mb-2">{t(`about.phase${index + 1}Title`)}</h3>
                    <p className="text-muted-foreground mb-4">{t(`about.phase${index + 1}Desc`)}</p>
                    
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
                  {t('about.whyTicketSafe')}
                </h2>
                <p className="text-lg text-muted-foreground">
                  {t('about.whyTicketSafeSubtitle')}
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
                      <h3 className="text-xl font-bold">{t('about.ticketSafeName')}</h3>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-accent mt-0.5" />
                        <span className="text-sm">{t('about.feature1')}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-accent mt-0.5" />
                        <span className="text-sm">{t('about.feature2')}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-accent mt-0.5" />
                        <span className="text-sm">{t('about.feature3')}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-accent mt-0.5" />
                        <span className="text-sm">{t('about.feature4')}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-accent mt-0.5" />
                        <span className="text-sm">{t('about.feature5')}</span>
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
                      <h3 className="text-xl font-bold text-muted-foreground">{t('about.otherPlatforms')}</h3>
                    </div>
                    
                    <div className="space-y-3 text-muted-foreground">
                      <div className="flex items-start gap-2">
                        <div className="w-4 h-4 border border-muted-foreground rounded-full mt-0.5" />
                        <span className="text-sm">{t('about.otherFeature1')}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="w-4 h-4 border border-muted-foreground rounded-full mt-0.5" />
                        <span className="text-sm">{t('about.otherFeature2')}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="w-4 h-4 border border-muted-foreground rounded-full mt-0.5" />
                        <span className="text-sm">{t('about.otherFeature3')}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="w-4 h-4 border border-muted-foreground rounded-full mt-0.5" />
                        <span className="text-sm">{t('about.otherFeature4')}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="w-4 h-4 border border-muted-foreground rounded-full mt-0.5" />
                        <span className="text-sm">{t('about.otherFeature5')}</span>
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
                {t('about.ctaTitle')}
              </h2>
              <p className="text-lg text-white/90 mb-8">
                {t('about.ctaDescription')}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button variant="secondary" size="lg" asChild>
                  <Link to="/events">
                    <School className="w-5 h-5" />
                    {t('about.ctaDiscoverEvents')}
                    <ArrowRight className="w-5 h-5" />
                  </Link>
                </Button>
                <Button variant="outline" size="lg" className="border-white text-white hover:bg-white hover:text-primary" asChild>
                  <Link to="/sell">
                    {t('about.ctaSellTicket')}
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