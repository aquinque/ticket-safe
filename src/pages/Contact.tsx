import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Mail, HelpCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/contexts/I18nContext";
import { SEOHead } from "@/components/SEOHead";

const Contact = () => {
  const { t } = useI18n();
  
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead titleKey="contact.title" descriptionKey="contact.subtitle" />
      <Header />
      <main className="container mx-auto px-4 py-16 flex-1">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <BackButton />
          </div>
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">{t('contact.title')}</h1>
            <p className="text-lg text-muted-foreground">
              {t('contact.subtitle')}
            </p>
          </div>

          <div className="max-w-2xl mx-auto mb-12">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="w-5 h-5 text-primary" />
                  {t('contact.emailTitle')}
                </CardTitle>
                <CardDescription>
                  {t('contact.emailDesc')}
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
                {t('contact.faqTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">{t('contact.faq1Q')}</h3>
                <p className="text-muted-foreground">
                  {t('contact.faq1A')}
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">{t('contact.faq2Q')}</h3>
                <p className="text-muted-foreground">
                  {t('contact.faq2A')}
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">{t('contact.faq3Q')}</h3>
                <p className="text-muted-foreground">
                  {t('contact.faq3A')}
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">{t('contact.faq4Q')}</h3>
                <p className="text-muted-foreground">
                  {t('contact.faq4A')}
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
