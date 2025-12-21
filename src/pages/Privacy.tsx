import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Shield, Download, Trash2, FileText, CheckCircle, Clock, XCircle } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import Footer from "@/components/Footer";

type ConsentType = 'data_monetization' | 'aggregated_analytics' | 'research_participation';
type ConsentStatus = 'granted' | 'withdrawn' | 'expired';

interface Consent {
  id: string;
  consent_type: ConsentType;
  status: ConsentStatus;
  granted_at: string;
  withdrawn_at: string | null;
  expires_at: string | null;
  consent_text: string;
}

interface DataRequest {
  id: string;
  request_type: 'export' | 'deletion' | 'rectification';
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  requested_at: string;
  completed_at: string | null;
  notes: string | null;
}

const CONSENT_DESCRIPTIONS = {
  data_monetization: {
    title: "Data Monetization",
    description: "Allow your anonymized transaction data to be included in aggregated datasets for research and commercial purposes. Your personal information will never be shared.",
    details: "We collect aggregated statistics about ticket sales, pricing trends, and campus activity. All data is anonymized and only shared when there are at least 5 similar users (k-anonymity). You can withdraw consent at any time."
  },
  aggregated_analytics: {
    title: "Analytics & Insights",
    description: "Help us improve the platform by allowing anonymized usage analytics to be collected and analyzed.",
    details: "This includes page views, feature usage, and performance metrics. All data is aggregated and cannot be traced back to individual users."
  },
  research_participation: {
    title: "Academic Research",
    description: "Participate in university research studies using anonymized platform data.",
    details: "Your anonymized data may be used for academic research on student marketplace behavior, pricing trends, and campus economics."
  }
};

export default function Privacy() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [consents, setConsents] = useState<Consent[]>([]);
  const [dataRequests, setDataRequests] = useState<DataRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchConsents();
      fetchDataRequests();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchConsents = async () => {
    const { data, error } = await supabase
      .from("user_consents")
      .select("*")
      .eq("user_id", user?.id);

    if (error) {
      console.error("Error fetching consents:", error);
      toast.error("Failed to load consent preferences");
    } else {
      setConsents(data || []);
    }
    setLoading(false);
  };

  const fetchDataRequests = async () => {
    const { data, error } = await supabase
      .from("data_requests")
      .select("*")
      .eq("user_id", user?.id)
      .order("requested_at", { ascending: false });

    if (error) {
      console.error("Error fetching data requests:", error);
    } else {
      setDataRequests((data || []) as DataRequest[]);
    }
  };

  const handleConsentToggle = async (consentType: ConsentType, currentlyGranted: boolean) => {
    const existingConsent = consents.find(c => c.consent_type === consentType);
    
    if (currentlyGranted) {
      // Withdraw consent
      if (existingConsent) {
        const { error } = await supabase
          .from("user_consents")
          .update({
            status: 'withdrawn',
            withdrawn_at: new Date().toISOString()
          })
          .eq("id", existingConsent.id);

        if (error) {
          toast.error("Failed to withdraw consent");
          return;
        }
        toast.success("Consent withdrawn successfully");
      }
    } else {
      // Grant consent
      const consentData = {
        user_id: user?.id,
        consent_type: consentType,
        status: 'granted' as ConsentStatus,
        consent_text: CONSENT_DESCRIPTIONS[consentType].details,
        granted_at: new Date().toISOString()
      };

      if (existingConsent) {
        const { error } = await supabase
          .from("user_consents")
          .update({
            status: 'granted' as ConsentStatus,
            granted_at: new Date().toISOString(),
            withdrawn_at: null
          })
          .eq("id", existingConsent.id);

        if (error) {
          toast.error("Failed to grant consent");
          return;
        }
      } else {
        const { error } = await supabase
          .from("user_consents")
          .insert([consentData]);

        if (error) {
          toast.error("Failed to save consent");
          return;
        }
      }
      toast.success("Consent granted successfully");
    }

    fetchConsents();
  };

  const handleDataRequest = async (requestType: 'export' | 'deletion' | 'rectification') => {
    const { error } = await supabase
      .from("data_requests")
      .insert({
        user_id: user?.id,
        request_type: requestType,
        status: 'pending'
      });

    if (error) {
      toast.error("Failed to submit data request");
      return;
    }

    toast.success("Data request submitted successfully. We'll process it within 30 days.");
    fetchDataRequests();
  };

  const getConsentStatus = (consentType: ConsentType): boolean => {
    const consent = consents.find(c => c.consent_type === consentType);
    return consent?.status === 'granted';
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { icon: typeof Clock; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      pending: { icon: Clock, variant: "secondary" },
      processing: { icon: Clock, variant: "default" },
      completed: { icon: CheckCircle, variant: "default" },
      rejected: { icon: XCircle, variant: "destructive" }
    };

    const { icon: Icon, variant } = variants[status] || variants.pending;
    return (
      <Badge variant={variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="container max-w-4xl mx-auto px-4 py-8 flex-1">
        <BackButton fallbackPath="/" />
        
        <div className="flex items-center gap-3 mb-6 mt-4">
          <Shield className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Privacy & Data Management</h1>
        </div>

        <Alert className="mb-6">
          <Shield className="h-4 w-4" />
          <AlertDescription>
            Your privacy matters. Manage your data sharing preferences and exercise your GDPR rights below.
          </AlertDescription>
        </Alert>

        <Tabs defaultValue="consents" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="consents">Consent Management</TabsTrigger>
            <TabsTrigger value="requests">Data Requests</TabsTrigger>
          </TabsList>

          <TabsContent value="consents" className="space-y-4">
            {Object.entries(CONSENT_DESCRIPTIONS).map(([type, info]) => {
              const consentType = type as ConsentType;
              const isGranted = getConsentStatus(consentType);

              return (
                <Card key={type} className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-semibold">{info.title}</h3>
                        {isGranted && (
                          <Badge variant="default" className="bg-green-600">
                            Active
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">
                        {info.description}
                      </p>
                      <details className="text-xs text-muted-foreground">
                        <summary className="cursor-pointer hover:text-foreground">
                          View details
                        </summary>
                        <p className="mt-2 pl-4 border-l-2 border-border">
                          {info.details}
                        </p>
                      </details>
                    </div>
                    <Switch
                      checked={isGranted}
                      onCheckedChange={() => handleConsentToggle(consentType, isGranted)}
                    />
                  </div>
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="requests" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Button
                onClick={() => handleDataRequest('export')}
                variant="outline"
                className="flex items-center gap-2 h-auto py-4 flex-col"
              >
                <Download className="h-5 w-5" />
                <span className="font-semibold">Export My Data</span>
                <span className="text-xs text-muted-foreground">
                  Download all your data
                </span>
              </Button>

              <Button
                onClick={() => handleDataRequest('rectification')}
                variant="outline"
                className="flex items-center gap-2 h-auto py-4 flex-col"
              >
                <FileText className="h-5 w-5" />
                <span className="font-semibold">Rectify Data</span>
                <span className="text-xs text-muted-foreground">
                  Request data correction
                </span>
              </Button>

              <Button
                onClick={() => handleDataRequest('deletion')}
                variant="outline"
                className="flex items-center gap-2 h-auto py-4 flex-col text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
              >
                <Trash2 className="h-5 w-5" />
                <span className="font-semibold">Delete My Data</span>
                <span className="text-xs">
                  Permanent deletion
                </span>
              </Button>
            </div>

            {dataRequests.length > 0 && (
              <div className="mt-8">
                <h3 className="text-lg font-semibold mb-4">Request History</h3>
                <div className="space-y-3">
                  {dataRequests.map((request) => (
                    <Card key={request.id} className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium capitalize">
                            {request.request_type.replace('_', ' ')} Request
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Requested: {new Date(request.requested_at).toLocaleDateString()}
                          </p>
                          {request.notes && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {request.notes}
                            </p>
                          )}
                        </div>
                        {getStatusBadge(request.status)}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <Card className="mt-6 p-6 bg-muted/50">
          <h3 className="text-sm font-semibold mb-2">Your Rights Under GDPR</h3>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• Right to access your personal data</li>
            <li>• Right to rectification of inaccurate data</li>
            <li>• Right to erasure ("right to be forgotten")</li>
            <li>• Right to restrict processing</li>
            <li>• Right to data portability</li>
            <li>• Right to object to processing</li>
            <li>• Right to withdraw consent at any time</li>
          </ul>
        </Card>
      </div>
      <Footer />
    </div>
  );
}
