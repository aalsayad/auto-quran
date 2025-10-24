/**
 * Custom hook for project management (save, load, rename)
 */

import { useState, useEffect } from "react";
import {
  saveProject,
  getProject,
  renameProject,
  type SavedProject,
} from "@/lib/library-storage";
import type { FinalSegment, WhisperTranscription } from "@/lib/types";

export function useProjectManagement(projectId: string | null) {
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  /**
   * Loads a project from localStorage
   */
  const loadProject = (id: string): SavedProject | null => {
    const project = getProject(id);
    if (project) {
      setCurrentProjectId(project.id);
      setProjectName(project.name);
      console.log("✅ Loaded project:", project.name);
    }
    return project;
  };

  /**
   * Saves the current project (create or update)
   */
  const save = async (data: {
    name: string;
    surahNumber: number;
    segments: FinalSegment[];
    audioUrl?: string;
    audioFileName?: string;
    whisperTranscription?: WhisperTranscription;
  }): Promise<boolean> => {
    setIsSaving(true);

    try {
      const projectToSave: SavedProject = {
        id: currentProjectId || crypto.randomUUID(),
        name: data.name,
        surahNumber: data.surahNumber,
        segments: data.segments,
        audioUrl: data.audioUrl || "",
        fileName: data.audioFileName || "",
        audioFileName: data.audioFileName,
        whisperTranscription: data.whisperTranscription,
        createdAt: currentProjectId
          ? getProject(currentProjectId)?.createdAt || new Date().toISOString()
          : new Date().toISOString(),
        dateCreated: currentProjectId
          ? getProject(currentProjectId)?.dateCreated ||
            new Date().toISOString()
          : new Date().toISOString(),
        lastModified: new Date().toISOString(),
        reciter: "",
        surahName: "",
        ayahTexts: [],
        silenceThreshold: 0.01,
        minSilenceDuration: 0.5,
        endPadding: 0.3,
        startPadding: 0.1,
      };

      saveProject(projectToSave);
      setCurrentProjectId(projectToSave.id);
      setProjectName(projectToSave.name);

      console.log(
        currentProjectId ? "✅ Project updated" : "✅ Project created",
        projectToSave.name
      );

      return true;
    } catch (error) {
      console.error("❌ Save failed:", error);
      alert("Failed to save project");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Renames the current project
   */
  const rename = (newName: string): boolean => {
    if (!currentProjectId) return false;

    try {
      renameProject(currentProjectId, newName);
      setProjectName(newName);
      console.log("✅ Project renamed:", newName);
      return true;
    } catch (error) {
      console.error("❌ Rename failed:", error);
      alert("Failed to rename project");
      return false;
    }
  };

  // Auto-load project on mount
  useEffect(() => {
    if (projectId && !currentProjectId) {
      loadProject(projectId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  return {
    currentProjectId,
    projectName,
    isSaving,
    loadProject,
    save,
    rename,
  };
}
