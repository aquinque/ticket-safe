import { useCallback, useEffect, useState } from "react";
import { ClipboardList, Plus, Trash2, ChevronDown, ChevronUp, CheckCircle2, Circle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface GuestlistRow {
  id: string;
  name: string;
  gender_restriction: "female" | "male" | null;
}

interface EntryRow {
  id: string;
  guestlist_id: string;
  first_name: string;
  last_name: string;
  gender: "female" | "male" | "other" | null;
  checked_in_at: string | null;
}

const GENDER_LABEL: Record<string, string> = { female: "Female", male: "Male", other: "Other" };

/**
 * Studio panel for free/no-payment name lists (e.g. "Girls before
 * midnight"), optionally gender-restricted. Entries are checked in by name
 * at the door — separate from QR ticket scanning.
 */
export const GuestlistsPanel = ({ eventId }: { eventId: string }) => {
  const [lists, setLists] = useState<GuestlistRow[]>([]);
  const [entries, setEntries] = useState<Record<string, EntryRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const [newListName, setNewListName] = useState("");
  const [newListGender, setNewListGender] = useState<"" | "female" | "male">("");
  const [creatingList, setCreatingList] = useState(false);

  const [entryDrafts, setEntryDrafts] = useState<Record<string, { firstName: string; lastName: string }>>({});

  const load = useCallback(async () => {
    const { data: listData, error: listErr } = await supabase
      .from("event_guestlists")
      .select("id, name, gender_restriction")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });
    if (listErr) {
      console.error("[GuestlistsPanel] load lists failed:", listErr);
      setLoading(false);
      return;
    }
    const listRows = (listData as GuestlistRow[]) ?? [];
    setLists(listRows);

    if (listRows.length > 0) {
      const { data: entryData } = await supabase
        .from("event_guestlist_entries")
        .select("id, guestlist_id, first_name, last_name, gender, checked_in_at")
        .in("guestlist_id", listRows.map((l) => l.id))
        .order("last_name", { ascending: true });
      const grouped: Record<string, EntryRow[]> = {};
      for (const e of (entryData as EntryRow[]) ?? []) {
        (grouped[e.guestlist_id] ??= []).push(e);
      }
      setEntries(grouped);
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  const createList = async () => {
    const trimmed = newListName.trim();
    if (!trimmed) {
      toast.error("Give the list a name, e.g. \"Girls before midnight\".");
      return;
    }
    setCreatingList(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase.from("event_guestlists").insert({
        event_id: eventId,
        name: trimmed,
        gender_restriction: newListGender || null,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      setNewListName("");
      setNewListGender("");
      await load();
      toast.success("Guestlist created.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the list.");
    } finally {
      setCreatingList(false);
    }
  };

  const deleteList = async (id: string) => {
    const { error } = await supabase.from("event_guestlists").delete().eq("id", id);
    if (error) {
      toast.error("Could not delete the list.");
      return;
    }
    setLists((prev) => prev.filter((l) => l.id !== id));
    toast.success("List deleted.");
  };

  const addEntry = async (listId: string, genderRestriction: "female" | "male" | null) => {
    const draft = entryDrafts[listId];
    const firstName = draft?.firstName.trim();
    const lastName = draft?.lastName.trim();
    if (!firstName || !lastName) {
      toast.error("Enter a first and last name.");
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("event_guestlist_entries").insert({
      guestlist_id: listId,
      first_name: firstName,
      last_name: lastName,
      gender: genderRestriction,
      added_by: user?.id ?? null,
    });
    if (error) {
      toast.error("Could not add this name.");
      return;
    }
    setEntryDrafts((prev) => ({ ...prev, [listId]: { firstName: "", lastName: "" } }));
    await load();
  };

  const removeEntry = async (id: string, guestlistId: string) => {
    const { error } = await supabase.from("event_guestlist_entries").delete().eq("id", id);
    if (error) {
      toast.error("Could not remove this name.");
      return;
    }
    setEntries((prev) => ({ ...prev, [guestlistId]: (prev[guestlistId] ?? []).filter((e) => e.id !== id) }));
  };

  const toggleCheckedIn = async (entry: EntryRow) => {
    const { data: { user } } = await supabase.auth.getUser();
    const patch = entry.checked_in_at
      ? { checked_in_at: null, checked_in_by: null }
      : { checked_in_at: new Date().toISOString(), checked_in_by: user?.id ?? null };
    const { error } = await supabase.from("event_guestlist_entries").update(patch).eq("id", entry.id);
    if (error) {
      toast.error("Could not update check-in status.");
      return;
    }
    setEntries((prev) => ({
      ...prev,
      [entry.guestlist_id]: (prev[entry.guestlist_id] ?? []).map((e) => (e.id === entry.id ? { ...e, ...patch } : e)),
    }));
  };

  return (
    <section className="bg-card border border-border rounded-2xl p-5 md:p-6">
      <div className="flex items-center justify-between mb-2 gap-3">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-primary" />
          Guestlists
        </h2>
        <span className="text-xs text-muted-foreground">{lists.length} list{lists.length === 1 ? "" : "s"}</span>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Free, no-payment name lists — checked in by name at the door. Optionally restrict a list to one gender.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        <input
          value={newListName}
          onChange={(e) => setNewListName(e.target.value)}
          placeholder="e.g. Girls before midnight"
          maxLength={120}
          className="flex-1 min-w-[160px] px-3 py-2 rounded-lg border border-border bg-background text-sm"
        />
        <select
          value={newListGender}
          onChange={(e) => setNewListGender(e.target.value as "" | "female" | "male")}
          className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
        >
          <option value="">Any gender</option>
          <option value="female">Girls only</option>
          <option value="male">Boys only</option>
        </select>
        <button
          type="button"
          onClick={createList}
          disabled={creatingList}
          className="inline-flex items-center gap-1.5 px-4 min-h-[40px] rounded-lg font-bold text-sm bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-60 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Create list
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : lists.length === 0 ? (
        <div className="text-center py-6 text-sm text-muted-foreground border border-dashed border-border rounded-xl">
          No guestlists yet.
        </div>
      ) : (
        <div className="space-y-2">
          {lists.map((list) => {
            const listEntries = entries[list.id] ?? [];
            const checkedInCount = listEntries.filter((e) => e.checked_in_at).length;
            const isOpen = openId === list.id;
            return (
              <div key={list.id} className="rounded-lg border border-border overflow-hidden">
                <div className="flex items-center gap-3 p-3">
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : list.id)}
                    className="flex-1 min-w-0 flex items-center gap-2 text-left"
                  >
                    {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{list.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {list.gender_restriction ? `${GENDER_LABEL[list.gender_restriction]} only · ` : ""}
                        {checkedInCount}/{listEntries.length} arrived
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteList(list.id)}
                    title="Delete this list"
                    className="w-9 h-9 rounded-lg border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 flex items-center justify-center shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {isOpen && (
                  <div className="border-t border-border p-3 space-y-2 bg-muted/20">
                    <div className="flex gap-2">
                      <input
                        value={entryDrafts[list.id]?.firstName ?? ""}
                        onChange={(e) => setEntryDrafts((prev) => ({ ...prev, [list.id]: { firstName: e.target.value, lastName: prev[list.id]?.lastName ?? "" } }))}
                        placeholder="First name"
                        className="flex-1 px-2.5 py-1.5 rounded-md border border-border bg-background text-sm"
                      />
                      <input
                        value={entryDrafts[list.id]?.lastName ?? ""}
                        onChange={(e) => setEntryDrafts((prev) => ({ ...prev, [list.id]: { firstName: prev[list.id]?.firstName ?? "", lastName: e.target.value } }))}
                        placeholder="Last name"
                        className="flex-1 px-2.5 py-1.5 rounded-md border border-border bg-background text-sm"
                        onKeyDown={(e) => e.key === "Enter" && addEntry(list.id, list.gender_restriction)}
                      />
                      <button
                        type="button"
                        onClick={() => addEntry(list.id, list.gender_restriction)}
                        className="px-3 rounded-md bg-primary text-primary-foreground text-xs font-bold shrink-0"
                      >
                        Add
                      </button>
                    </div>
                    {listEntries.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-2">No names yet.</p>
                    ) : (
                      <div className="space-y-1 max-h-64 overflow-y-auto">
                        {listEntries.map((e) => (
                          <div key={e.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-card border border-border text-sm">
                            <button type="button" onClick={() => toggleCheckedIn(e)} className="shrink-0">
                              {e.checked_in_at ? <CheckCircle2 className="w-4 h-4 text-success" /> : <Circle className="w-4 h-4 text-muted-foreground" />}
                            </button>
                            <span className={`flex-1 min-w-0 truncate ${e.checked_in_at ? "text-muted-foreground line-through" : ""}`}>
                              {e.first_name} {e.last_name}
                            </span>
                            <button type="button" onClick={() => removeEntry(e.id, list.id)} className="text-muted-foreground hover:text-destructive shrink-0">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
