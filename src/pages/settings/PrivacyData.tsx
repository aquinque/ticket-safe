import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SEOHead } from "@/components/SEOHead";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Download,
  EyeOff,
  Trash2,
  ShieldCheck,
  Loader2,
  AlertTriangle,
} from "lucide-react";

/**
 * /settings/privacy — GDPR self-service.
 * Surfaces the three rights the privacy-request edge function exposes:
 *   EXPORT, ANONYMIZE, DELETE. Each requires a confirmation step; DELETE
 *   requires the user to retype their email so we can't trigger it by
 *   accident or via a hijacked session click.
 */
const PrivacyData = () => {
  const { user, signOut, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [exporting, setExporting] = useState(false);
  const [anonymizing, setAnonymizing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [anonymizeOpen, setAnonymizeOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth", { replace: true });
    }
  }, [user, authLoading, navigate]);

  const callPrivacyRequest = async (
    requestType: "EXPORT" | "ANONYMIZE" | "DELETE",
  ) => {
    const { data, error } = await supabase.functions.invoke("privacy-request", {
      body: { request_type: requestType },
    });
    if (error) throw new Error(error.message);
    return data;
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await callPrivacyRequest("EXPORT");
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ticket-safe-data-${
        new Date().toISOString().split("T")[0]
      }.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Your data has been downloaded.", {
        description: "Check your downloads folder.",
      });
    } catch (e) {
      console.error("[privacy] export failed:", e);
      toast.error("Could not export your data. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const handleAnonymize = async () => {
    setAnonymizing(true);
    try {
      await callPrivacyRequest("ANONYMIZE");
      toast.success("Your account has been anonymized.", {
        description: "Signing you out…",
      });
      setAnonymizeOpen(false);
      setTimeout(async () => {
        await signOut();
        navigate("/", { replace: true });
      }, 1500);
    } catch (e) {
      console.error("[privacy] anonymize failed:", e);
      toast.error("Could not anonymize your account. Please try again.");
    } finally {
      setAnonymizing(false);
    }
  };

  const handleDelete = async () => {
    if (
      deleteConfirmEmail.trim().toLowerCase() !== user?.email?.toLowerCase()
    ) {
      toast.error("Email doesn't match. Please type it exactly.");
      return;
    }
    setDeleting(true);
    try {
      await callPrivacyRequest("DELETE");
      toast.success("Your account has been permanently deleted.");
      setDeleteOpen(false);
      setTimeout(async () => {
        await signOut();
        navigate("/", { replace: true });
      }, 1500);
    } catch (e) {
      console.error("[privacy] delete failed:", e);
      toast.error("Could not delete your account. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  if (authLoading || !user) return null;

  const emailMatches =
    deleteConfirmEmail.trim().toLowerCase() === (user.email ?? "").toLowerCase();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead titleKey="nav.settings" descriptionKey="settings.description" />
      <Header />
      <main className="py-16 flex-1">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="mb-6">
            <BackButton fallbackPath="/settings" />
          </div>

          {/* Page Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-amber-600" />
              </div>
              <h1 className="text-4xl font-bold">My Data &amp; Privacy</h1>
            </div>
            <p className="text-muted-foreground">
              Exercise your GDPR rights — no questions asked, no friction.
            </p>
          </div>

          <div className="space-y-6">
            {/* EXPORT */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="w-5 h-5 text-primary" />
                  Download my data
                </CardTitle>
                <CardDescription>
                  Get a complete copy of everything we have on file: profile,
                  purchases, sales, messages, and consents. Delivered as a
                  single JSON file you can keep or send anywhere.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={handleExport}
                  disabled={exporting}
                  className="gap-2"
                >
                  {exporting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  {exporting ? "Preparing your file…" : "Download my data"}
                </Button>
              </CardContent>
            </Card>

            {/* ANONYMIZE */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <EyeOff className="w-5 h-5 text-amber-600" />
                  Anonymize my account
                </CardTitle>
                <CardDescription>
                  Replace your name and email with anonymous placeholders. Past
                  purchases and sales stay in our records for accounting and
                  tax reasons, but they can no longer be linked back to you.
                  You will be signed out.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  onClick={() => setAnonymizeOpen(true)}
                  disabled={anonymizing}
                  className="gap-2"
                >
                  <EyeOff className="w-4 h-4" />
                  Anonymize my account
                </Button>
              </CardContent>
            </Card>

            {/* DELETE */}
            <Card className="border-red-200 dark:border-red-900/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
                  <Trash2 className="w-5 h-5" />
                  Delete my account permanently
                </CardTitle>
                <CardDescription>
                  Wipe everything: profile, purchases, sales, messages, and
                  listings.{" "}
                  <strong className="text-red-700 dark:text-red-400">
                    This cannot be undone.
                  </strong>{" "}
                  Pending transactions will be completed or refunded first.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant="destructive"
                  onClick={() => setDeleteOpen(true)}
                  disabled={deleting}
                  className="gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete my account
                </Button>
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground text-center pt-2">
              Need help with a request? Contact{" "}
              <a
                href="mailto:dpo@ticket-safe.eu"
                className="text-primary hover:underline"
              >
                dpo@ticket-safe.eu
              </a>
              . See our{" "}
              <a href="/privacy" className="text-primary hover:underline">
                Privacy Policy
              </a>{" "}
              for the full details.
            </p>
          </div>
        </div>
      </main>
      <Footer />

      {/* Anonymize confirmation */}
      <AlertDialog open={anonymizeOpen} onOpenChange={setAnonymizeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anonymize your account?</AlertDialogTitle>
            <AlertDialogDescription>
              Your name and email will be replaced with anonymous placeholders.
              You will be signed out and won&apos;t be able to log back in.
              Past transactions remain for legal/accounting reasons but
              can&apos;t be linked back to you.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={anonymizing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAnonymize}
              disabled={anonymizing}
              className="gap-2"
            >
              {anonymizing && <Loader2 className="w-4 h-4 animate-spin" />}
              Yes, anonymize my account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation with re-typed email guard */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-700 dark:text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Permanently delete your account?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action is irreversible. Your profile, purchases, sales,
              messages, and listings will all be permanently erased.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 pt-2">
            <p className="text-sm text-muted-foreground">
              To confirm, type your email below:{" "}
              <strong className="text-foreground">{user.email}</strong>
            </p>
            <Input
              type="email"
              placeholder={user.email ?? ""}
              value={deleteConfirmEmail}
              onChange={(e) => setDeleteConfirmEmail(e.target.value)}
              autoComplete="off"
              aria-label="Type your email to confirm deletion"
              className={
                deleteConfirmEmail && !emailMatches
                  ? "border-red-300 focus-visible:ring-red-300"
                  : ""
              }
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setDeleteConfirmEmail("")}
              disabled={deleting}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting || !emailMatches}
              className="bg-red-600 hover:bg-red-700 gap-2"
            >
              {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PrivacyData;
