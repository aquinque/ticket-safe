import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Calendar, Briefcase, GraduationCap, MapPin } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const CampusLife = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [userCampus, setUserCampus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('campus')
          .eq('id', user.id)
          .maybeSingle();

        if (error) throw error;
        setUserCampus(data?.campus || null);
      } catch (error) {
        console.error('Error fetching profile:', error);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchUserProfile();
    }
  }, [user]);

  const campusInfo = {
    Paris: {
      associations: [
        { name: "BDE ESCP Paris", description: "Bureau des Élèves - Organise les événements étudiants" },
        { name: "ESCP Entrepreneurs", description: "Association dédiée à l'entrepreneuriat" },
        { name: "ESCP Art & Culture", description: "Promotion des arts et de la culture" },
      ],
      clubs: [
        { name: "Club Finance", description: "Trading, investment banking, consulting" },
        { name: "Club Tech", description: "Innovation, startups, digital transformation" },
        { name: "Club Sports", description: "Football, basketball, running club" },
      ],
      services: [
        { name: "Career Services", description: "Aide à la recherche de stage et emploi" },
        { name: "Bibliothèque", description: "Ressources académiques et espaces d'étude" },
        { name: "Cafétéria", description: "Restauration sur le campus" },
      ],
    },
    Berlin: {
      associations: [
        { name: "BDE ESCP Berlin", description: "Student Bureau - Organizes student events" },
        { name: "ESCP Sustainability", description: "Environmental and sustainability initiatives" },
        { name: "International Club", description: "Connecting students from different backgrounds" },
      ],
      clubs: [
        { name: "Consulting Club", description: "Strategy, management consulting preparation" },
        { name: "Music & Arts", description: "Concerts, exhibitions, creative events" },
        { name: "Outdoor Club", description: "Hiking, cycling, outdoor activities" },
      ],
      services: [
        { name: "Career Center", description: "Internship and job search support" },
        { name: "Library", description: "Academic resources and study spaces" },
        { name: "Student Lounge", description: "Social and relaxation area" },
      ],
    },
    London: {
      associations: [
        { name: "BDE ESCP London", description: "Student Bureau - Organizes student events" },
        { name: "Finance Society", description: "Banking, markets, and investment focus" },
        { name: "Consulting Society", description: "Case competitions and consulting prep" },
      ],
      clubs: [
        { name: "Investment Club", description: "Stock market analysis and investing" },
        { name: "Theatre Club", description: "Drama, performances, cultural events" },
        { name: "Football Club", description: "Weekly matches and tournaments" },
      ],
      services: [
        { name: "Careers Service", description: "CV reviews, interview prep, networking" },
        { name: "Learning Commons", description: "Study spaces and academic support" },
        { name: "Campus Café", description: "Coffee, snacks, and meeting space" },
      ],
    },
    Madrid: {
      associations: [
        { name: "BDE ESCP Madrid", description: "Bureau de Estudiantes - Organiza eventos" },
        { name: "Club de Emprendimiento", description: "Startups y innovación empresarial" },
        { name: "Cultural Association", description: "Arte, música, y cultura española" },
      ],
      clubs: [
        { name: "Marketing Club", description: "Digital marketing and brand strategy" },
        { name: "Padel Club", description: "Padel matches and tournaments" },
        { name: "Wine & Gastronomy", description: "Spanish cuisine and wine tasting" },
      ],
      services: [
        { name: "Servicio de Carreras", description: "Búsqueda de prácticas y empleo" },
        { name: "Biblioteca", description: "Recursos académicos y salas de estudio" },
        { name: "Comedor", description: "Servicio de comidas en el campus" },
      ],
    },
    Turin: {
      associations: [
        { name: "BDE ESCP Torino", description: "Bureau degli Studenti - Organizza eventi" },
        { name: "Luxury & Fashion Club", description: "Italian luxury brands and fashion" },
        { name: "Innovation Lab", description: "Tech startups and digital innovation" },
      ],
      clubs: [
        { name: "Automotive Club", description: "Car industry and motorsports" },
        { name: "Food & Wine", description: "Italian cuisine and wine culture" },
        { name: "Skiing Club", description: "Winter sports in the Alps" },
      ],
      services: [
        { name: "Career Services", description: "Stage e ricerca lavoro" },
        { name: "Biblioteca", description: "Risorse accademiche e spazi studio" },
        { name: "Mensa", description: "Servizio ristorazione campus" },
      ],
    },
  };

  const currentCampusInfo = userCampus ? campusInfo[userCampus as keyof typeof campusInfo] : null;

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center h-[50vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading campus info...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="pt-8 pb-16 flex-1">
        <div className="container mx-auto px-4">
          <div className="mb-6">
            <BackButton />
          </div>
          
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-4">
              {userCampus ? `Campus Life - ${userCampus}` : 'Campus Life'}
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {userCampus 
                ? `Discover associations, clubs, and services available at ESCP ${userCampus}`
                : 'Select your campus to see relevant information'}
            </p>
          </div>

          {!userCampus && (
            <Card className="max-w-2xl mx-auto">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  No Campus Selected
                </CardTitle>
                <CardDescription>
                  Please update your profile with your campus to see personalized information
                </CardDescription>
              </CardHeader>
            </Card>
          )}

          {currentCampusInfo && (
            <Tabs defaultValue="associations" className="max-w-6xl mx-auto">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="associations">
                  <Users className="w-4 h-4 mr-2" />
                  Associations
                </TabsTrigger>
                <TabsTrigger value="clubs">
                  <GraduationCap className="w-4 h-4 mr-2" />
                  Clubs
                </TabsTrigger>
                <TabsTrigger value="services">
                  <Briefcase className="w-4 h-4 mr-2" />
                  Services
                </TabsTrigger>
              </TabsList>

              <TabsContent value="associations" className="mt-6">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {currentCampusInfo.associations.map((association, index) => (
                    <Card key={index} className="hover:shadow-card transition-shadow">
                      <CardHeader>
                        <CardTitle className="text-lg">{association.name}</CardTitle>
                        <CardDescription>{association.description}</CardDescription>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="clubs" className="mt-6">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {currentCampusInfo.clubs.map((club, index) => (
                    <Card key={index} className="hover:shadow-card transition-shadow">
                      <CardHeader>
                        <CardTitle className="text-lg">{club.name}</CardTitle>
                        <CardDescription>{club.description}</CardDescription>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="services" className="mt-6">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {currentCampusInfo.services.map((service, index) => (
                    <Card key={index} className="hover:shadow-card transition-shadow">
                      <CardHeader>
                        <CardTitle className="text-lg">{service.name}</CardTitle>
                        <CardDescription>{service.description}</CardDescription>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default CampusLife;
