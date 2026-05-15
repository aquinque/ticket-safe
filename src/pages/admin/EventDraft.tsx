/**
 * Admin — AI Event Draft
 *
 * Paste a URL, a poster description, or free-form text. Claude extracts
 * a structured event draft. Admin reviews, edits inline, then confirms
 * to insert it into the events table.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, Shield } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface Draft {
  title: string;
  description: string;
  date: string;
  location: string;
  university: string;
  campus: string | null;
  category: string;
  base_price: number | null;
  image_url: string | null;
}

const EMPTY: Draft = {
  title: "",
  description: "",
  date: "",
  location: "",
  university: "",
  campus: null,
  category: "Other",
  base_price: null,
  image_url: null,
};

const EventDraft = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  const [source, setSource] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        const ok = data?.role === "admin";
        setIsAdmin(ok);
        if (!ok) {
          toast.error("Admin access required");
          navigate("/");
        }
      });
  }, [user, navigate]);

  const extract = async () => {
    if (!source.trim()) {
      toast.error("Paste a URL or some text first");
      return;
    }
    setExtracting(true);
    try {
      const { data: refreshed } = await supabase.auth.refreshSession();
      const token = refreshed.session?.access_token;
      if (!token) throw new Error("Not authenticated");
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-event-draft`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ source: source.trim() }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Extraction failed");
      setDraft({ ...EMPTY, ...data.draft });
      toast.success("Draft extracted — review and confirm.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setExtracting(false);
    }
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.title.trim() || !draft.date || !draft.location.trim()) {
      toast.error("Title, date, and location are required");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("events")
        .insert({
          title: draft.title.trim(),
          description: draft.description?.trim() || null,
          date: draft.date,
          location: draft.location.trim(),
          university: draft.university?.trim() || "Other",
          campus: draft.campus?.trim() || null,
          category: draft.category || "Other",
          base_price: draft.base_price ?? null,
          image_url: draft.image_url?.trim() || null,
          is_active: false,
        })
        .select("id")
        .single();
      if (error) throw error;
      toast.success("Event created (inactive). Activate it from the catalog.");
      setDraft(null);
      setSource("");
      navigate(`/event/${data.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Insert failed");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || isAdmin === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 py-8">
        <div className="container mx-auto px-4 max-w-3xl space-y-6">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">AI Event Draft</h1>
              <p className="text-sm text-muted-foreground">
                Paste an URL, a poster description, or free text. Claude extracts
                a structured event you can review and publish.
              </p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Source</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="https://… or paste a poster/event description"
                rows={6}
                maxLength={20_000}
              />
              <div className="flex justify-end">
                <Button onClick={extract} disabled={extracting || !source.trim()}>
                  {extracting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Extracting…
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Extract draft
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {draft && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Review & publish</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Field label="Title">
                  <Input
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  />
                </Field>
                <Field label="Description">
                  <Textarea
                    value={draft.description}
                    onChange={(e) =>
                      setDraft({ ...draft, description: e.target.value })
                    }
                    rows={3}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Date (ISO)">
                    <Input
                      type="datetime-local"
                      value={draft.date ? draft.date.slice(0, 16) : ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          date: e.target.value
                            ? new Date(e.target.value).toISOString()
                            : "",
                        })
                      }
                    />
                  </Field>
                  <Field label="Category">
                    <Input
                      value={draft.category}
                      onChange={(e) =>
                        setDraft({ ...draft, category: e.target.value })
                      }
                    />
                  </Field>
                </div>
                <Field label="Location">
                  <Input
                    value={draft.location}
                    onChange={(e) =>
                      setDraft({ ...draft, location: e.target.value })
                    }
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="University">
                    <Input
                      value={draft.university}
                      onChange={(e) =>
                        setDraft({ ...draft, university: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Campus (optional)">
                    <Input
                      value={draft.campus ?? ""}
                      onChange={(e) =>
                        setDraft({ ...draft, campus: e.target.value || null })
                      }
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Base price (EUR)">
                    <Input
                      type="number"
                      step="0.01"
                      value={draft.base_price ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          base_price: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                  <Field label="Image URL (optional)">
                    <Input
                      value={draft.image_url ?? ""}
                      onChange={(e) =>
                        setDraft({ ...draft, image_url: e.target.value || null })
                      }
                    />
                  </Field>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setDraft(null)}>
                    Discard
                  </Button>
                  <Button onClick={save} disabled={saving}>
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Publishing…
                      </>
                    ) : (
                      "Create event (inactive)"
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1">
    <Label className="text-xs uppercase tracking-wider text-muted-foreground">
      {label}
    </Label>
    {children}
  </div>
);

export default EventDraft;
