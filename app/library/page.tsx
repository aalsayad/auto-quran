"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { SavedRecitation } from "@/lib/types";
import CreateRecitationDialog from "@/components/create-recitation-dialog";
import TopNavbar from "@/components/top-navbar";
import { useAuth } from "@/contexts/auth-context";
import {
  getRecitations,
  deleteRecitation,
  updateRecitation,
} from "@/lib/supabase-storage";
import { recitationToSavedRecitation } from "@/lib/types";
import {
  FiBook,
  FiPlus,
  FiEdit,
  FiEdit2,
  FiDownload,
  FiTrash2,
  FiFile,
  FiHash,
  FiCalendar,
  FiClock,
  FiInfo,
  FiCheckCircle,
} from "react-icons/fi";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LibraryPage() {
  const { user } = useAuth();
  const [recitations, setRecitations] = useState<SavedRecitation[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameRecitationId, setRenameRecitationId] = useState<string | null>(
    null
  );
  const [newRecitationName, setNewRecitationName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecitations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadRecitations = async () => {
    setLoading(true);
    try {
      if (!user) {
        setRecitations([]);
        return;
      }

      // Load from Supabase
      const recitationsData = await getRecitations(user.id);
      const recitationsFormatted = recitationsData.map(
        recitationToSavedRecitation
      );
      // Sort by last modified date (newest first)
      recitationsFormatted.sort(
        (a, b) =>
          new Date(b.lastModified).getTime() -
          new Date(a.lastModified).getTime()
      );
      setRecitations(recitationsFormatted);
    } catch (error) {
      console.error("❌ [Library] Error loading recitations:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (recitationId: string) => {
    const recitation = recitations.find((p) => p.id === recitationId);

    if (!recitation) return;

    if (
      !confirm(
        "Are you sure you want to delete this recitation? This will also delete the audio file from cloud storage."
      )
    ) {
      return;
    }

    try {
      // If recitation has an audio URL, delete from S3 first
      if (recitation.audioUrl) {
        console.log(
          "🗑️  [Library] Deleting audio from S3:",
          recitation.audioUrl
        );

        const response = await fetch("/api/delete-audio", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ audioUrl: recitation.audioUrl }),
        });

        if (response.ok) {
          console.log("✅ [Library] Audio deleted from S3 successfully");
        } else {
          console.warn(
            "⚠️  [Library] Failed to delete audio from S3, continuing with recitation deletion"
          );
        }
      } else {
        console.log("ℹ️  [Library] No audio URL found, skipping S3 deletion");
      }

      if (!user) {
        alert("Please sign in to delete recitations");
        return;
      }

      // Delete from Supabase
      await deleteRecitation(recitationId);
      console.log("✅ [Library] Recitation deleted from Supabase");

      loadRecitations();
      console.log("✅ [Library] Recitation deleted successfully");
    } catch (error) {
      console.error("❌ [Library] Error during deletion:", error);
      alert("Failed to delete recitation. Please try again.");
    }
  };

  const handleExport = (recitation: SavedRecitation) => {
    const dataStr = JSON.stringify(recitation, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${recitation.name.replace(/[^a-z0-9]/gi, "-")}-${
      new Date().toISOString().split("T")[0]
    }.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleOpenRename = (recitationId: string) => {
    const recitation = recitations.find((p) => p.id === recitationId);
    if (recitation) {
      setRenameRecitationId(recitationId);
      setNewRecitationName(recitation.name);
      setShowRenameDialog(true);
    }
  };

  const handleRename = async () => {
    if (!renameRecitationId || !newRecitationName.trim()) return;

    try {
      if (!user) {
        alert("Please sign in to rename recitations");
        return;
      }

      // Update in Supabase (update reciter_name)
      const newReciterName = newRecitationName.trim().split(" - ")[0];
      await updateRecitation(renameRecitationId, {
        reciter_name: newReciterName,
      });
      console.log("✅ [Library] Recitation renamed in Supabase");

      loadRecitations();
      setShowRenameDialog(false);
      setRenameRecitationId(null);
      setNewRecitationName("");
    } catch (error) {
      console.error("Failed to rename recitation:", error);
      alert("Failed to rename recitation. Please try again.");
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <>
      <TopNavbar />
      <div className="container mx-auto px-4 py-4 sm:py-6 pt-4 sm:pt-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 sm:mb-6">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2 sm:gap-3">
              Recitation Library
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
              Your saved recitations
            </p>
          </div>
          <Button
            onClick={() => setShowCreateDialog(true)}
            className="cursor-pointer gap-1 sm:gap-2 text-sm sm:text-base px-3 sm:px-4 py-2 sm:py-2 w-full sm:w-auto"
          >
            <FiPlus className="h-4 w-4" />
            <span className="hidden xs:inline">Create New Recitation</span>
            <span className="xs:hidden">New Recitation</span>
          </Button>
        </div>

        {!user ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-lg text-muted-foreground mb-4">
                Please sign in to view and manage your recitations
              </p>
            </CardContent>
          </Card>
        ) : loading ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-lg text-muted-foreground">
                Loading recitations...
              </p>
            </CardContent>
          </Card>
        ) : recitations.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-lg text-muted-foreground mb-4">
                No saved recitations yet
              </p>
              <Button
                onClick={() => setShowCreateDialog(true)}
                className="cursor-pointer"
              >
                Create Your First Recitation
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:gap-4 items-start">
            {recitations.map((recitation) => (
              <Card
                key={recitation.id}
                className="transition-all duration-200 hover:border-primary/30"
              >
                <CardHeader className="p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-4">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg sm:text-xl wrap-break-word">
                        {recitation.name}
                      </CardTitle>
                      <CardDescription className="mt-2 space-y-2">
                        <div className="flex flex-col gap-2 text-xs sm:text-sm">
                          <div className="flex items-start gap-1">
                            <FiFile size={12} className="shrink-0 mt-0.5" />
                            <span className="wrap-break-word min-w-0">
                              {recitation.fileName || "No file"}
                            </span>
                          </div>
                          <div className="flex items-start gap-1">
                            <FiBook size={12} className="shrink-0 mt-0.5" />
                            <span className="wrap-break-word min-w-0">
                              Surah {recitation.surahNumber} -{" "}
                              {recitation.surahName}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <FiHash size={12} className="shrink-0" />
                            <span>{recitation.segments.length} segments</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 text-xs">
                          <div className="flex items-start gap-1">
                            <FiCalendar size={10} className="shrink-0 mt-0.5" />
                            <span className="wrap-break-word min-w-0">
                              Created:{" "}
                              {formatDate(
                                recitation.dateCreated || recitation.createdAt
                              )}
                            </span>
                          </div>
                          <div className="flex items-start gap-1">
                            <FiClock size={10} className="shrink-0 mt-0.5" />
                            <span className="wrap-break-word min-w-0">
                              Modified: {formatDate(recitation.lastModified)}
                            </span>
                          </div>
                        </div>
                      </CardDescription>
                    </div>

                    {/* Mobile: Stack buttons vertically, Desktop: Horizontal */}
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                      <div className="flex gap-1 sm:gap-2 flex-wrap">
                        {recitation.segments.length > 0 ? (
                          <Link
                            href={`/reader/${recitation.id}`}
                            className="flex-none"
                          >
                            <Button
                              size="sm"
                              className="cursor-pointer gap-1 text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2 w-auto bg-primary text-primary-foreground hover:bg-primary/90"
                            >
                              <FiBook size={12} className="sm:hidden" />
                              <FiBook size={14} className="hidden sm:block" />
                              <span className="text-xs">Read</span>
                            </Button>
                          </Link>
                        ) : (
                          <Button
                            size="sm"
                            disabled
                            className="gap-1 text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2 w-auto opacity-50 cursor-not-allowed"
                          >
                            <FiBook size={12} className="sm:hidden" />
                            <FiBook size={14} className="hidden sm:block" />
                            <span className="text-xs">Read</span>
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenRename(recitation.id)}
                          className="cursor-pointer gap-1 text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2 w-auto opacity-60 hover:opacity-100 transition-opacity"
                        >
                          <FiEdit2 size={12} className="sm:hidden" />
                          <FiEdit2 size={14} className="hidden sm:block" />
                          <span className="text-xs">Rename</span>
                        </Button>
                      </div>

                      <div className="flex gap-1 sm:gap-2 flex-wrap">
                        <Link
                          href={`/editor/${recitation.id}`}
                          className="flex-none"
                        >
                          <Button
                            size="sm"
                            variant="outline"
                            className="cursor-pointer gap-1 text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2 w-auto opacity-60 hover:opacity-100 transition-opacity"
                          >
                            <FiEdit size={12} className="sm:hidden" />
                            <FiEdit size={14} className="hidden sm:block" />
                            <span className="text-xs">Edit</span>
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleExport(recitation)}
                          className="cursor-pointer gap-1 text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2 w-auto opacity-60 hover:opacity-100 transition-opacity"
                        >
                          <FiDownload size={12} className="sm:hidden" />
                          <FiDownload size={14} className="hidden sm:block" />
                          <span className="text-xs">Export</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDelete(recitation.id)}
                          className="cursor-pointer gap-1 text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2 w-auto opacity-60 hover:opacity-100 text-muted-foreground hover:text-destructive hover:border-destructive transition-all"
                        >
                          <FiTrash2 size={12} className="sm:hidden" />
                          <FiTrash2 size={14} className="hidden sm:block" />
                          <span className="text-xs">Delete</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                {recitation.ayahTexts && recitation.ayahTexts.length > 0 && (
                  <CardContent>
                    <div className="text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <FiCheckCircle size={12} /> Ayah text loaded (
                        {recitation.ayahTexts.length} ayahs)
                      </span>
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}

        <div className="mt-8 p-4 bg-muted/30 rounded-lg">
          <h3 className="font-semibold mb-2 flex items-center gap-2">
            <FiInfo /> Tips
          </h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Recitations are saved to the cloud</li>
            <li>• Export recitations as JSON for backup</li>
            <li>• Click &quot;Read&quot; to view your completed recitation</li>
            <li>• Click &quot;Edit&quot; to continue editing a recitation</li>
          </ul>
        </div>
      </div>

      <CreateRecitationDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
      />

      {/* Rename Recitation Dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FiEdit2 /> Rename Recitation
            </DialogTitle>
            <DialogDescription>
              Enter a new name for your recitation.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="recitationName">Recitation Name</Label>
              <Input
                id="recitationName"
                value={newRecitationName}
                onChange={(e) => setNewRecitationName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleRename();
                  }
                }}
                placeholder="Enter recitation name"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRenameDialog(false)}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRename}
              disabled={!newRecitationName.trim()}
              className="cursor-pointer gap-2"
            >
              <FiEdit2 /> Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
