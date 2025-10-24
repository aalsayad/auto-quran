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
import type { SavedProject } from "@/lib/types";
import CreateProjectDialog from "@/components/create-project-dialog";
import Navbar from "@/components/navbar";
import { useAuth } from "@/contexts/auth-context";
import {
  getRecitations,
  deleteRecitation,
  updateRecitation,
} from "@/lib/supabase-storage";
import { recitationToSavedProject } from "@/lib/types";
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
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameProjectId, setRenameProjectId] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadProjects = async () => {
    setLoading(true);
    try {
      if (!user) {
        setProjects([]);
        return;
      }

      // Load from Supabase
      const recitations = await getRecitations(user.id);
      const projectsData = recitations.map(recitationToSavedProject);
      // Sort by last modified date (newest first)
      projectsData.sort(
        (a, b) =>
          new Date(b.lastModified).getTime() -
          new Date(a.lastModified).getTime()
      );
      setProjects(projectsData);
    } catch (error) {
      console.error("❌ [Library] Error loading projects:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);

    if (!project) return;

    if (
      !confirm(
        "Are you sure you want to delete this project? This will also delete the audio file from cloud storage."
      )
    ) {
      return;
    }

    try {
      // If project has an audio URL, delete from S3 first
      if (project.audioUrl) {
        console.log("🗑️  [Library] Deleting audio from S3:", project.audioUrl);

        const response = await fetch("/api/delete-audio", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ audioUrl: project.audioUrl }),
        });

        if (response.ok) {
          console.log("✅ [Library] Audio deleted from S3 successfully");
        } else {
          console.warn(
            "⚠️  [Library] Failed to delete audio from S3, continuing with project deletion"
          );
        }
      } else {
        console.log("ℹ️  [Library] No audio URL found, skipping S3 deletion");
      }

      if (!user) {
        alert("Please sign in to delete projects");
        return;
      }

      // Delete from Supabase
      await deleteRecitation(projectId);
      console.log("✅ [Library] Recitation deleted from Supabase");

      loadProjects();
      console.log("✅ [Library] Project deleted successfully");
    } catch (error) {
      console.error("❌ [Library] Error during deletion:", error);
      alert("Failed to delete project. Please try again.");
    }
  };

  const handleExport = (project: SavedProject) => {
    const dataStr = JSON.stringify(project, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${project.name.replace(/[^a-z0-9]/gi, "-")}-${
      new Date().toISOString().split("T")[0]
    }.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleOpenRename = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (project) {
      setRenameProjectId(projectId);
      setNewProjectName(project.name);
      setShowRenameDialog(true);
    }
  };

  const handleRename = async () => {
    if (!renameProjectId || !newProjectName.trim()) return;

    try {
      if (!user) {
        alert("Please sign in to rename projects");
        return;
      }

      // Update in Supabase (update reciter_name)
      const newReciterName = newProjectName.trim().split(" - ")[0];
      await updateRecitation(renameProjectId, {
        reciter_name: newReciterName,
      });
      console.log("✅ [Library] Recitation renamed in Supabase");

      loadProjects();
      setShowRenameDialog(false);
      setRenameProjectId(null);
      setNewProjectName("");
    } catch (error) {
      console.error("Failed to rename project:", error);
      alert("Failed to rename project. Please try again.");
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
      <Navbar />
      <div className="container mx-auto px-4 py-4 sm:py-6 pt-20 sm:pt-24">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 sm:mb-6">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2 sm:gap-3">
              Project Library
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
              Your saved segmentation projects
            </p>
          </div>
          <Button
            onClick={() => setShowCreateDialog(true)}
            className="cursor-pointer gap-1 sm:gap-2 text-sm sm:text-base px-3 sm:px-4 py-2 sm:py-2 w-full sm:w-auto"
          >
            <FiPlus className="h-4 w-4" />
            <span className="hidden xs:inline">Create New Project</span>
            <span className="xs:hidden">New Project</span>
          </Button>
        </div>

        {!user ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-lg text-muted-foreground mb-4">
                Please sign in to view and manage your projects
              </p>
            </CardContent>
          </Card>
        ) : loading ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-lg text-muted-foreground">
                Loading projects...
              </p>
            </CardContent>
          </Card>
        ) : projects.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-lg text-muted-foreground mb-4">
                No saved projects yet
              </p>
              <Button
                onClick={() => setShowCreateDialog(true)}
                className="cursor-pointer"
              >
                Create Your First Project
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:gap-4 items-start">
            {projects.map((project) => (
              <Card
                key={project.id}
                className="transition-all duration-200 hover:border-primary/30"
              >
                <CardHeader className="p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-4">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg sm:text-xl wrap-break-word">
                        {project.name}
                      </CardTitle>
                      <CardDescription className="mt-2 space-y-2">
                        <div className="flex flex-col gap-2 text-xs sm:text-sm">
                          <div className="flex items-start gap-1">
                            <FiFile size={12} className="shrink-0 mt-0.5" />
                            <span className="wrap-break-word min-w-0">
                              {project.fileName || "No file"}
                            </span>
                          </div>
                          <div className="flex items-start gap-1">
                            <FiBook size={12} className="shrink-0 mt-0.5" />
                            <span className="wrap-break-word min-w-0">
                              Surah {project.surahNumber} - {project.surahName}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <FiHash size={12} className="shrink-0" />
                            <span>{project.segments.length} segments</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 text-xs">
                          <div className="flex items-start gap-1">
                            <FiCalendar size={10} className="shrink-0 mt-0.5" />
                            <span className="wrap-break-word min-w-0">
                              Created:{" "}
                              {formatDate(
                                project.dateCreated || project.createdAt
                              )}
                            </span>
                          </div>
                          <div className="flex items-start gap-1">
                            <FiClock size={10} className="shrink-0 mt-0.5" />
                            <span className="wrap-break-word min-w-0">
                              Modified: {formatDate(project.lastModified)}
                            </span>
                          </div>
                        </div>
                      </CardDescription>
                    </div>

                    {/* Mobile: Stack buttons vertically, Desktop: Horizontal */}
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                      <div className="flex gap-1 sm:gap-2 flex-wrap">
                        {project.segments.length > 0 ? (
                          <Link
                            href={`/reader/${project.id}`}
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
                          onClick={() => handleOpenRename(project.id)}
                          className="cursor-pointer gap-1 text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2 w-auto opacity-60 hover:opacity-100 transition-opacity"
                        >
                          <FiEdit2 size={12} className="sm:hidden" />
                          <FiEdit2 size={14} className="hidden sm:block" />
                          <span className="text-xs">Rename</span>
                        </Button>
                      </div>

                      <div className="flex gap-1 sm:gap-2 flex-wrap">
                        <Link
                          href={`/editor/${project.id}`}
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
                          onClick={() => handleExport(project)}
                          className="cursor-pointer gap-1 text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2 w-auto opacity-60 hover:opacity-100 transition-opacity"
                        >
                          <FiDownload size={12} className="sm:hidden" />
                          <FiDownload size={14} className="hidden sm:block" />
                          <span className="text-xs">Export</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDelete(project.id)}
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
                {project.ayahTexts && project.ayahTexts.length > 0 && (
                  <CardContent>
                    <div className="text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <FiCheckCircle size={12} /> Ayah text loaded (
                        {project.ayahTexts.length} ayahs)
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
            <li>• Projects are saved in your browser&apos;s localStorage</li>
            <li>• Export projects as JSON for backup</li>
            <li>
              • Click &quot;Load&quot; to continue editing a saved project
            </li>
            <li>
              • Clearing browser data will delete all saved projects (export to
              backup!)
            </li>
          </ul>
        </div>
      </div>

      <CreateProjectDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
      />

      {/* Rename Project Dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FiEdit2 /> Rename Project
            </DialogTitle>
            <DialogDescription>
              Enter a new name for your project.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="projectName">Project Name</Label>
              <Input
                id="projectName"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleRename();
                  }
                }}
                placeholder="Enter project name"
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
              disabled={!newProjectName.trim()}
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
