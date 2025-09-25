import Header from "@/components/Header";
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
      title: "Éthique et transparence",
      description: "Plafond de +20% pour éviter la spéculation, contrairement aux plateformes traditionnelles."
    },
    {
      icon: Users,
      title: "Communauté étudiante",
      description: "Conçu par et pour les étudiants, avec une interface adaptée à leurs besoins."
    },
    {
      icon: Target,
      title: "Simplicité d'usage",
      description: "Processus de vente et d'achat optimisé pour une expérience fluide."
    },
  ];

  const roadmapSteps = [
    {
      phase: "Phase 1",
      title: "ECP Paris",
      description: "Lancement pilote avec l'École Centrale Paris",
      status: "active",
      features: ["Événements étudiants ECP", "Système de vérification", "Paiements sécurisés"]
    },
    {
      phase: "Phase 2", 
      title: "Expansion Grandes Écoles",
      description: "Partenariats avec les BDE des principales écoles",
      status: "planned",
      features: ["HEC, ESCP, Mines", "Réseau inter-écoles", "Événements croisés"]
    },
    {
      phase: "Phase 3",
      title: "Événements publics",
      description: "Ouverture aux concerts et événements grand public",
      status: "future",
      features: ["Concerts publics", "Festivals", "Théâtres et spectacles"]
    }
  ];

  const values = [
    {
      title: "Équité",
      description: "Prix plafonnés pour éviter la spéculation excessive"
    },
    {
      title: "Sécurité", 
      description: "Paiements protégés et transactions vérifiées"
    },
    {
      title: "Communauté",
      description: "Favoriser les liens entre étudiants des différentes écoles"
    },
    {
      title: "Innovation",
      description: "Alternative éthique aux géants comme Ticketmaster"
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        {/* Hero Section */}
        <section className="py-20 bg-gradient-card">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <Badge variant="secondary" className="mb-4">
                À propos de RESEAT
              </Badge>
              <h1 className="text-4xl md:text-5xl font-bold mb-6">
                Révolutionner la revente de tickets{" "}
                <span className="bg-gradient-hero bg-clip-text text-transparent">
                  étudiants
                </span>
              </h1>
              <p className="text-lg text-muted-foreground mb-8 max-w-3xl mx-auto">
                RESEAT est née d'une conviction simple : la revente de tickets doit être équitable, 
                transparente et au service de la communauté étudiante. Nous créons une alternative 
                éthique aux plateformes traditionnelles.
              </p>
            </div>
          </div>
        </section>

        {/* Mission & Vision */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl font-bold mb-6">Notre mission</h2>
                <p className="text-lg text-muted-foreground mb-6">
                  Permettre aux étudiants de revendre et racheter leurs tickets d'événements 
                  en toute simplicité, avec un système équitable qui évite la spéculation 
                  tout en garantissant la sécurité des transactions.
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
                  <h3 className="text-2xl font-bold mb-4">Nos valeurs</h3>
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
              <h2 className="text-3xl font-bold mb-4">Notre feuille de route</h2>
              <p className="text-lg text-muted-foreground">
                Un développement progressif et maîtrisé pour créer la meilleure expérience
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
                          En cours
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
                  Pourquoi RESEAT ?
                </h2>
                <p className="text-lg text-muted-foreground">
                  Une alternative éthique face aux géants du marché
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
                      <h3 className="text-xl font-bold">RESEAT</h3>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-accent mt-0.5" />
                        <span className="text-sm">Prix plafonné à +20% maximum</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-accent mt-0.5" />
                        <span className="text-sm">Commission fixe de 5%</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-accent mt-0.5" />
                        <span className="text-sm">Communauté étudiante vérifiée</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-accent mt-0.5" />
                        <span className="text-sm">Interface mobile-first</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-accent mt-0.5" />
                        <span className="text-sm">Support réactif et humain</span>
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
                      <h3 className="text-xl font-bold text-muted-foreground">Autres plateformes</h3>
                    </div>
                    
                    <div className="space-y-3 text-muted-foreground">
                      <div className="flex items-start gap-2">
                        <div className="w-4 h-4 border border-muted-foreground rounded-full mt-0.5" />
                        <span className="text-sm">Aucune limite de prix (spéculation)</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="w-4 h-4 border border-muted-foreground rounded-full mt-0.5" />
                        <span className="text-sm">Commissions variables et élevées</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="w-4 h-4 border border-muted-foreground rounded-full mt-0.5" />
                        <span className="text-sm">Tous publics mélangés</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="w-4 h-4 border border-muted-foreground rounded-full mt-0.5" />
                        <span className="text-sm">Interfaces complexes</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="w-4 h-4 border border-muted-foreground rounded-full mt-0.5" />
                        <span className="text-sm">Support automatisé</span>
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
                Rejoins la révolution RESEAT
              </h2>
              <p className="text-lg text-white/90 mb-8">
                Participe à la construction d'une communauté étudiante plus équitable 
                et solidaire. Chaque ticket vendu ou acheté contribue à notre mission.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button variant="secondary" size="lg" asChild>
                  <Link to="/events">
                    <School className="w-5 h-5" />
                    Découvrir les événements
                    <ArrowRight className="w-5 h-5" />
                  </Link>
                </Button>
                <Button variant="outline" size="lg" className="border-white text-white hover:bg-white hover:text-primary" asChild>
                  <Link to="/sell">
                    Vendre mes tickets
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default About;