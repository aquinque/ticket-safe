import { useState } from "react";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Upload, AlertCircle, CheckCircle2, Calculator } from "lucide-react";

const Sell = () => {
  const [formData, setFormData] = useState({
    eventTitle: "",
    originalPrice: "",
    sellingPrice: "",
    quantity: "1",
    campus: "",
    eventType: "",
    eventDate: "",
    description: "",
  });

  const [priceValidation, setPriceValidation] = useState<{
    isValid: boolean;
    maxPrice: number;
    percentage: number;
  } | null>(null);

  const handlePriceChange = (originalPrice: string, sellingPrice: string) => {
    const original = parseFloat(originalPrice);
    const selling = parseFloat(sellingPrice);

    if (original && selling) {
      const maxAllowed = original * 1.5; // +50% maximum
      const percentage = ((selling - original) / original) * 100;
      
      setPriceValidation({
        isValid: selling <= maxAllowed,
        maxPrice: maxAllowed,
        percentage: percentage,
      });
    } else {
      setPriceValidation(null);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    const newFormData = { ...formData, [field]: value };
    setFormData(newFormData);

    if (field === "originalPrice" || field === "sellingPrice") {
      handlePriceChange(
        field === "originalPrice" ? value : formData.originalPrice,
        field === "sellingPrice" ? value : formData.sellingPrice
      );
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="py-16">
        <div className="container mx-auto px-4 max-w-4xl">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">
              Vendre mes tickets
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Revends tes tickets en toute simplicité. Respecte notre politique équitable : 
              maximum +50% du prix initial pour éviter la spéculation.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Form */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Informations du ticket</CardTitle>
                  <CardDescription>
                    Remplis les détails de ton événement et de tes tickets à vendre
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Event Details */}
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="eventTitle">Nom de l'événement</Label>
                      <Input
                        id="eventTitle"
                        placeholder="Ex: Soirée de rentrée ECP 2024"
                        value={formData.eventTitle}
                        onChange={(e) => handleInputChange("eventTitle", e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="campus">Campus / École</Label>
                        <Select value={formData.campus} onValueChange={(value) => handleInputChange("campus", value)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Sélectionner" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ecp-paris">ECP Paris</SelectItem>
                            <SelectItem value="mines-paristech">Mines ParisTech</SelectItem>
                            <SelectItem value="hec-paris">HEC Paris</SelectItem>
                            <SelectItem value="epitech">EPITECH</SelectItem>
                            <SelectItem value="escp">ESCP Business School</SelectItem>
                            <SelectItem value="other">Autre</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="eventType">Type d'événement</Label>
                        <Select value={formData.eventType} onValueChange={(value) => handleInputChange("eventType", value)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Sélectionner" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="soiree">Soirée</SelectItem>
                            <SelectItem value="gala">Gala</SelectItem>
                            <SelectItem value="concert">Concert</SelectItem>
                            <SelectItem value="wei">WEI</SelectItem>
                            <SelectItem value="conference">Conférence</SelectItem>
                            <SelectItem value="sport">Événement sportif</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="eventDate">Date de l'événement</Label>
                      <Input
                        id="eventDate"
                        type="date"
                        value={formData.eventDate}
                        onChange={(e) => handleInputChange("eventDate", e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Pricing */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Prix des tickets</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="originalPrice">Prix initial (€)</Label>
                        <Input
                          id="originalPrice"
                          type="number"
                          placeholder="25"
                          value={formData.originalPrice}
                          onChange={(e) => handleInputChange("originalPrice", e.target.value)}
                        />
                      </div>

                      <div>
                        <Label htmlFor="sellingPrice">Prix de vente (€)</Label>
                        <Input
                          id="sellingPrice"
                          type="number"
                          placeholder="30"
                          value={formData.sellingPrice}
                          onChange={(e) => handleInputChange("sellingPrice", e.target.value)}
                        />
                      </div>

                      <div>
                        <Label htmlFor="quantity">Nombre de tickets</Label>
                        <Select value={formData.quantity} onValueChange={(value) => handleInputChange("quantity", value)}>
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

                    {/* Price Validation */}
                    {priceValidation && (
                      <Alert className={priceValidation.isValid ? "border-accent bg-accent/5" : "border-destructive bg-destructive/5"}>
                        <div className="flex items-center gap-2">
                          {priceValidation.isValid ? (
                            <CheckCircle2 className="w-4 h-4 text-accent" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-destructive" />
                          )}
                          <AlertDescription>
                            {priceValidation.isValid ? (
                              <>
                                Prix respectant la règle des +50% 
                                <Badge variant="secondary" className="ml-2">
                                  +{priceValidation.percentage.toFixed(1)}%
                                </Badge>
                              </>
                            ) : (
                              <>
                                Prix trop élevé ! Maximum autorisé: {priceValidation.maxPrice.toFixed(2)}€ 
                                <Badge variant="destructive" className="ml-2">
                                  +{priceValidation.percentage.toFixed(1)}%
                                </Badge>
                              </>
                            )}
                          </AlertDescription>
                        </div>
                      </Alert>
                    )}
                  </div>

                  {/* Description */}
                  <div>
                    <Label htmlFor="description">Description (optionnel)</Label>
                    <Textarea
                      id="description"
                      placeholder="Ajoute des détails sur l'événement, les conditions de vente..."
                      value={formData.description}
                      onChange={(e) => handleInputChange("description", e.target.value)}
                    />
                  </div>

                  {/* File Upload */}
                  <div>
                    <Label>Photos du ticket (optionnel)</Label>
                    <div className="border-2 border-dashed border-muted rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer">
                      <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        Clique pour ajouter des photos de tes tickets
                      </p>
                    </div>
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
                    Calculateur de prix
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Prix initial:</span>
                      <span className="font-medium">
                        {formData.originalPrice ? `${formData.originalPrice}€` : "-"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Prix maximum (+50%):</span>
                      <span className="font-medium text-accent">
                        {formData.originalPrice ? `${(parseFloat(formData.originalPrice) * 1.5).toFixed(2)}€` : "-"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Nombre de tickets:</span>
                      <span className="font-medium">{formData.quantity}</span>
                    </div>
                    <hr className="border-border" />
                    <div className="flex justify-between text-lg font-semibold">
                      <span>Total estimé:</span>
                      <span className="text-primary">
                        {formData.sellingPrice ? 
                          `${(parseFloat(formData.sellingPrice) * parseInt(formData.quantity)).toFixed(2)}€` : 
                          "-"
                        }
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Guidelines */}
              <Card>
                <CardHeader>
                  <CardTitle>Règles Ticket Safe</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                    <span>Maximum +50% du prix initial</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                    <span>Paiement sécurisé garanti</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                    <span>Commission de 5% sur la vente</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                    <span>Remboursement si événement annulé</span>
                  </div>
                </CardContent>
              </Card>

              {/* Submit Button */}
              <Button 
                variant="hero" 
                size="lg" 
                className="w-full"
                disabled={!priceValidation?.isValid || !formData.eventTitle || !formData.originalPrice}
              >
                Publier mes tickets
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Sell;