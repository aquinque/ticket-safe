import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { z } from "zod";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Upload, AlertCircle, CheckCircle2, Calculator, Info, X, FileImage, Shield, Loader2, Camera, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/contexts/I18nContext";
import { eventsList, EventData } from "@/data/eventsData";
import { SEOHead } from "@/components/SEOHead";
import { useTicketListings } from "@/contexts/TicketListingsContext";
import { parseQRCode, verifyTicket, markTicketAsListed } from "@/lib/ticketVerification";
import { TicketQRData, TicketVerificationResult } from "@/types/ticketVerification";

// Validation schema for ticket notes
const notesSchema = z
  .string()
  .trim()
  .max(1000, "Notes must be less than 1000 characters")
  .regex(/^[a-zA-Z0-9\s.,!?'"-]*$/, "Notes can only contain letters, numbers, and basic punctuation")
  .optional();

const Sell = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { t } = useI18n();
  const { addListing } = useTicketListings();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventData | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [verificationResult, setVerificationResult] = useState<TicketVerificationResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Pre-select event from navigation state
  useEffect(() => {
    const state = location.state as { eventId?: string } | null;
    if (state?.eventId) {
      const event = eventsList.find(e => e.id === state.eventId);
      if (event) {
        setSelectedEvent(event);
        setFormData(prev => ({
          ...prev,
          eventId: event.id,
        }));
      }
    }
  }, [location.state]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  const [formData, setFormData] = useState({
    eventId: "",
    sellingPrice: "",
    quantity: "1",
    description: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleEventSelect = (eventId: string) => {
    const event = eventsList.find(e => e.id === eventId);
    if (event) {
      setSelectedEvent(event);
      setFormData({
        ...formData,
        eventId: event.id,
        sellingPrice: "",
      });
    }
  };

  const handlePriceChange = (value: string) => {
    // Only allow positive numbers with up to 2 decimals
    if (value === "" || /^\d+(\.\d{0,2})?$/.test(value)) {
      setFormData({ ...formData, sellingPrice: value });
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const validFiles: File[] = [];
    const maxSize = 5 * 1024 * 1024; // 5MB
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];

    Array.from(files).forEach(file => {
      if (!allowedTypes.includes(file.type)) {
        toast.error(`${file.name}: Invalid file type. Only JPG, PNG, WEBP, and PDF allowed.`);
        return;
      }
      if (file.size > maxSize) {
        toast.error(`${file.name}: File too large. Maximum 5MB.`);
        return;
      }
      validFiles.push(file);
    });

    if (uploadedFiles.length + validFiles.length > 3) {
      toast.error("Maximum 3 files allowed");
      return;
    }

    setUploadedFiles([...uploadedFiles, ...validFiles]);

    // Verify QR code if this is the first file and event is selected
    if (uploadedFiles.length === 0 && validFiles.length > 0 && selectedEvent) {
      await verifyTicketQR(validFiles[0]);
    }
  };

  const handleFileRemove = (index: number) => {
    setUploadedFiles(uploadedFiles.filter((_, i) => i !== index));
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const triggerCameraInput = () => {
    cameraInputRef.current?.click();
  };

  const verifyTicketQR = async (file: File) => {
    if (!selectedEvent || !user) return;

    setIsVerifying(true);
    toast.info("Verifying ticket QR code...");

    try {
      // Parse QR code from uploaded file
      const qrData = await parseQRCode(file);

      if (!qrData) {
        toast.error("Could not read QR code from the uploaded file. Please ensure the image is clear.");
        setVerificationResult(null);
        return;
      }

      // Verify ticket with backend
      const result = await verifyTicket(qrData, selectedEvent.id, user.id);

      setVerificationResult(result);

      if (result.isValid) {
        toast.success("✓ Ticket verified! This is an authentic, unused ticket.");
      } else {
        // Show specific error messages
        result.errors.forEach(error => {
          toast.error(error);
        });
      }
    } catch (error) {
      console.error("Verification error:", error);
      toast.error("Failed to verify ticket. Please try again.");
      setVerificationResult(null);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedEvent || !user) {
      toast.error("Please select an event");
      return;
    }

    if (!formData.sellingPrice || parseFloat(formData.sellingPrice) <= 0) {
      toast.error("Please enter a valid selling price");
      return;
    }

    if (uploadedFiles.length === 0) {
      toast.error("Please upload at least one photo or document of your ticket");
      return;
    }

    // Verify ticket has been verified
    if (!verificationResult || !verificationResult.isValid) {
      toast.error("Please upload a valid ticket with QR code. Ticket verification failed.");
      return;
    }

    // Validate notes field
    if (formData.description) {
      const notesValidation = notesSchema.safeParse(formData.description);
      if (!notesValidation.success) {
        toast.error(notesValidation.error.errors[0].message);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const sellingPrice = parseFloat(formData.sellingPrice);
      const listingId = `listing-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Create the ticket listing
      const newListing = {
        id: listingId,
        event: selectedEvent,
        sellingPrice,
        quantity: parseInt(formData.quantity),
        description: formData.description,
        files: uploadedFiles.map(f => ({ name: f.name, size: f.size, type: f.type })),
        sellerId: user.id,
        sellerName: user.user_metadata?.full_name || user.email || 'Anonymous',
        timestamp: new Date().toISOString(),
        verified: true,
        ticketId: verificationResult.ticketId,
        qrHash: verificationResult.ticketData?.qrHash || '',
      };

      // Mark ticket as listed in the verification system
      markTicketAsListed(verificationResult.ticketId, user.id, listingId);

      // Add to listings
      addListing(newListing);

      toast.success("✓ Verified ticket listed successfully! It's now visible in the marketplace.");

      // Reset form
      setFormData({
        eventId: "",
        sellingPrice: "",
        quantity: "1",
        description: "",
      });
      setSelectedEvent(null);
      setUploadedFiles([]);
      setVerificationResult(null);

      // Navigate to marketplace
      setTimeout(() => navigate('/events'), 1500);

    } catch (error) {
      console.error('Error creating ticket:', error);
      toast.error(error instanceof Error ? error.message : "Failed to list ticket");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <SEOHead titleKey="nav.home" descriptionKey="hero.subtitle" />
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <main className="py-16 flex-1">
          <div className="container mx-auto px-4 max-w-4xl">
            <div className="mb-6">
              <BackButton />
            </div>
            {/* Header */}
            <div className="text-center mb-12">
              <h1 className="text-4xl font-bold mb-4">
                {t('sell.titleMain')}
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                {t('sell.subtitleMain')}
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Main Form */}
              <div className="lg:col-span-2">
                <Card>
                  <CardHeader>
                    <CardTitle>{t('sell.ticketInfoTitle')}</CardTitle>
                    <CardDescription>
                      {t('sell.ticketInfoDesc')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Event Details */}
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="event">{t('sell.selectYourEvent')}</Label>
                        <Select
                          value={formData.eventId}
                          onValueChange={handleEventSelect}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t('sell.selectEventPlaceholder')} />
                          </SelectTrigger>
                          <SelectContent>
                            {eventsList.length === 0 ? (
                              <div className="p-4 text-sm text-muted-foreground text-center">
                                {t('sell.noUpcomingEvents')}
                              </div>
                            ) : (
                              eventsList.map((event) => (
                                <SelectItem key={event.id} value={event.id}>
                                  <div className="flex flex-col">
                                    <span className="font-medium">{event.title}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {new Date(event.date).toLocaleDateString('en-US', {
                                        day: 'numeric',
                                        month: 'long',
                                        year: 'numeric'
                                      })} • {event.location}
                                    </span>
                                  </div>
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>

                      {selectedEvent && (
                        <Alert className="bg-accent/10 border-accent">
                          <Info className="w-4 h-4 text-accent" />
                          <AlertDescription>
                            <div className="space-y-1">
                              <p className="font-medium">{selectedEvent.title}</p>
                              <p className="text-sm text-muted-foreground">
                                {selectedEvent.category}
                              </p>
                              <p className="text-sm">
                                {new Date(selectedEvent.date).toLocaleDateString('en-US', {
                                  weekday: 'long',
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric',
                                })}
                              </p>
                            </div>
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>

                    {/* Pricing */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold">{t('sell.ticketPrices')}</h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="sellingPrice">{t('sell.yourSellingPrice')}</Label>
                          <Input
                            id="sellingPrice"
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder={t('sell.enterYourPrice')}
                            value={formData.sellingPrice}
                            onChange={(e) => handlePriceChange(e.target.value)}
                            disabled={!selectedEvent}
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            {t('sell.fairPriceDesc')}
                          </p>
                        </div>

                        <div>
                          <Label htmlFor="quantity">{t('sell.numberOfTickets')}</Label>
                          <Select
                            value={formData.quantity}
                            onValueChange={(value) => setFormData({ ...formData, quantity: value })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                                <SelectItem key={num} value={num.toString()}>{num}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    {/* Description */}
                    <div>
                      <Label htmlFor="description">{t('sell.additionalNotes')}</Label>
                      <Textarea
                        id="description"
                        placeholder={t('sell.addDetailsPlaceholder')}
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        rows={3}
                        maxLength={1000}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        {formData.description.length}/1000 {t('sell.charactersLimit')}
                      </p>
                    </div>

                    {/* File Upload */}
                    <div>
                      <Label>{t('sell.ticketPhotos')}</Label>

                      {/* Hidden file inputs */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,application/pdf"
                        multiple
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                      <input
                        ref={cameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleFileSelect}
                        className="hidden"
                      />

                      {/* Upload Options */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                        {/* Take Photo Button */}
                        <div
                          onClick={triggerCameraInput}
                          className="border-2 border-dashed border-muted rounded-lg p-6 text-center hover:border-primary/50 hover:bg-accent/5 transition-all cursor-pointer group"
                        >
                          <Camera className="w-8 h-8 text-muted-foreground group-hover:text-primary mx-auto mb-2 transition-colors" />
                          <p className="text-sm font-medium text-foreground">
                            {t('sell.takePhoto')}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Use camera
                          </p>
                        </div>

                        {/* Choose from Gallery Button */}
                        <div
                          onClick={triggerFileInput}
                          className="border-2 border-dashed border-muted rounded-lg p-6 text-center hover:border-primary/50 hover:bg-accent/5 transition-all cursor-pointer group"
                        >
                          <FolderOpen className="w-8 h-8 text-muted-foreground group-hover:text-primary mx-auto mb-2 transition-colors" />
                          <p className="text-sm font-medium text-foreground">
                            {t('sell.chooseFromGallery')}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Select files
                          </p>
                        </div>
                      </div>

                      <p className="text-xs text-muted-foreground mt-2 text-center">
                        Maximum 3 files • JPG, PNG, WEBP, PDF • Up to 5MB each
                      </p>

                      {/* Display uploaded files */}
                      {uploadedFiles.length > 0 && (
                        <div className="mt-4 space-y-2">
                          {uploadedFiles.map((file, index) => (
                            <div key={index} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                              <FileImage className="w-5 h-5 text-primary flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{file.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {(file.size / 1024 / 1024).toFixed(2)} MB
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleFileRemove(index)}
                                className="flex-shrink-0"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Verification Status */}
                      {isVerifying && (
                        <Alert className="bg-blue-50 border-blue-200 mt-4">
                          <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                          <AlertDescription>
                            <p className="font-medium text-blue-900">Verifying ticket...</p>
                            <p className="text-sm text-blue-700 mt-1">
                              Checking QR code authenticity and ticket status
                            </p>
                          </AlertDescription>
                        </Alert>
                      )}

                      {verificationResult && verificationResult.isValid && (
                        <Alert className="bg-green-50 border-green-200 mt-4">
                          <Shield className="w-4 h-4 text-green-600" />
                          <AlertDescription>
                            <p className="font-medium text-green-900">✓ Ticket Verified</p>
                            <p className="text-sm text-green-700 mt-1">
                              This is an authentic, unused ticket that can be listed for resale.
                            </p>
                          </AlertDescription>
                        </Alert>
                      )}

                      {verificationResult && !verificationResult.isValid && (
                        <Alert className="bg-red-50 border-red-200 mt-4">
                          <AlertCircle className="w-4 h-4 text-red-600" />
                          <AlertDescription>
                            <p className="font-medium text-red-900">Verification Failed</p>
                            <div className="text-sm text-red-700 mt-1 space-y-1">
                              {verificationResult.errors.map((error, idx) => (
                                <p key={idx}>• {error}</p>
                              ))}
                            </div>
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Summary Sidebar */}
              <div className="space-y-6">
                {/* Price Calculator */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Calculator className="w-5 h-5" />
                      {t('sell.pricingSummary')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('sell.yourPrice')}</span>
                        <span className="font-medium">
                          {formData.sellingPrice ? `€${parseFloat(formData.sellingPrice).toFixed(2)}` : "-"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('sell.numberOfTickets')}:</span>
                        <span className="font-medium">{formData.quantity}</span>
                      </div>
                      <hr className="border-border" />
                      <div className="flex justify-between text-lg font-semibold">
                        <span>{t('sell.totalEarnings')}</span>
                        <span className="text-primary">
                          {formData.sellingPrice ?
                            `€${(parseFloat(formData.sellingPrice) * parseInt(formData.quantity) * 0.95).toFixed(2)}` :
                            "-"
                          }
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        (5% platform fee deducted)
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Guidelines */}
                <Card>
                  <CardHeader>
                    <CardTitle>{t('sell.sellingGuidelines')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                      <span>{t('sell.guidelineFairPrices')}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                      <span>{t('sell.guidelineVerifiedStudents')}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                      <span>{t('sell.guidelineSecurePayment')}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                      <span>{t('sell.guidelineVerifiedTickets')}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Submit Button */}
                <Button
                  variant="hero"
                  size="lg"
                  className="w-full"
                  disabled={!selectedEvent || !formData.sellingPrice || isSubmitting || !verificationResult?.isValid}
                  onClick={handleSubmit}
                >
                  {isSubmitting ? t('sell.publishing') : t('sell.publishMyTickets')}
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  {t('sell.termsAgreement')}
                </p>
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    </>
  );
};

export default Sell;
