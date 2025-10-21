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
import {
  getAllProjects,
  deleteProject,
  renameProject,
  exportProjectAsJSON,
  type SavedProject,
} from "@/lib/library-storage";
import CreateProjectDialog from "@/components/create-project-dialog";
import Navbar from "@/components/navbar";
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
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameProjectId, setRenameProjectId] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState("");

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = () => {
    const allProjects = getAllProjects();
    // Sort by last modified date (newest first)
    allProjects.sort(
      (a, b) =>
        new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
    );
    setProjects(allProjects);
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

      // Delete project from localStorage
      deleteProject(projectId);
      loadProjects();
      console.log("✅ [Library] Project deleted successfully");
    } catch (error) {
      console.error("❌ [Library] Error during deletion:", error);
      alert("Failed to delete project. Please try again.");
    }
  };

  const handleExport = (project: SavedProject) => {
    exportProjectAsJSON(project);
  };

  const handleOpenRename = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (project) {
      setRenameProjectId(projectId);
      setNewProjectName(project.name);
      setShowRenameDialog(true);
    }
  };

  const handleRename = () => {
    if (!renameProjectId || !newProjectName.trim()) return;

    try {
      renameProject(renameProjectId, newProjectName.trim());
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
      <div className="container mx-auto px-4 py-8 pt-24">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              Project Library
            </h1>
            <p className="text-muted-foreground mt-2">
              Your saved segmentation projects
            </p>
          </div>
          <Button
            onClick={() => setShowCreateDialog(true)}
            className="cursor-pointer gap-2"
          >
            <FiPlus /> Create New Project
          </Button>
        </div>

        {projects.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
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
          <div className="grid gap-4">
            {projects.map((project) => (
              <Card
                key={project.id}
                className="transition-all duration-200 hover:border-primary/30"
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-xl">{project.name}</CardTitle>
                      <CardDescription className="mt-2 space-y-1">
                        <div className="flex items-center gap-4 text-sm">
                          <span className="flex items-center gap-1">
                            <FiFile size={14} /> {project.fileName || "No file"}
                          </span>
                          <span className="flex items-center gap-1">
                            <FiBook size={14} /> Surah {project.surahNumber} -{" "}
                            {project.surahName}
                          </span>
                          <span className="flex items-center gap-1">
                            <FiHash size={14} /> {project.segments.length}{" "}
                            segments
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="flex items-center gap-1">
                            <FiCalendar size={12} /> Created:{" "}
                            {formatDate(project.dateCreated)}
                          </span>
                          <span className="flex items-center gap-1">
                            <FiClock size={12} /> Modified:{" "}
                            {formatDate(project.lastModified)}
                          </span>
                        </div>
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/reader/${project.id}`}>
                        <Button
                          size="sm"
                          variant="outline"
                          className="cursor-pointer gap-1"
                        >
                          <FiBook size={14} /> Read
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenRename(project.id)}
                        className="cursor-pointer gap-1"
                      >
                        <FiEdit2 size={14} /> Rename
                      </Button>
                      <Link href={`/editor/${project.id}`}>
                        <Button size="sm" className="cursor-pointer gap-1">
                          <FiEdit size={14} /> Edit
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleExport(project)}
                        className="cursor-pointer gap-1"
                      >
                        <FiDownload size={14} /> Export
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(project.id)}
                        className="cursor-pointer text-destructive hover:bg-destructive/10 gap-1"
                      >
                        <FiTrash2 size={14} /> Delete
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {project.ayahTexts.length > 0 && (
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
