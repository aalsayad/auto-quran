export interface SavedProject {
  id: string;
  name: string;
  fileName: string;
  audioUrl?: string; // S3 URL for the uploaded audio file
  surahNumber: number;
  surahName: string;
  dateCreated: string;
  lastModified: string;
  segments: {
    start: number;
    end: number;
    text: string;
    ayahNumber?: number;
    ayahNumbers?: number[];
  }[];
  ayahTexts: string[];
  silenceThreshold?: number;
  minSilenceDuration?: number;
  endPadding?: number;
  startPadding?: number;
  whisperTranscription?: {
    segments: { start: number; end: number; text: string }[];
    text: string;
  };
}

const STORAGE_KEY = "quran-splitter-library";

export function getAllProjects(): SavedProject[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch (error) {
    console.error("Failed to load projects:", error);
    return [];
  }
}

export function saveProject(project: SavedProject): void {
  try {
    const projects = getAllProjects();
    const existingIndex = projects.findIndex((p) => p.id === project.id);

    if (existingIndex >= 0) {
      // Update existing project
      projects[existingIndex] = {
        ...project,
        lastModified: new Date().toISOString(),
      };
    } else {
      // Add new project
      projects.push(project);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch (error) {
    console.error("Failed to save project:", error);
    throw new Error("Failed to save project. Storage might be full.");
  }
}

export function deleteProject(id: string): void {
  try {
    const projects = getAllProjects();
    const filtered = projects.filter((p) => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error("Failed to delete project:", error);
    throw new Error("Failed to delete project.");
  }
}

export function renameProject(id: string, newName: string): void {
  try {
    const projects = getAllProjects();
    const projectIndex = projects.findIndex((p) => p.id === id);

    if (projectIndex === -1) {
      throw new Error("Project not found");
    }

    projects[projectIndex] = {
      ...projects[projectIndex],
      name: newName,
      lastModified: new Date().toISOString(),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch (error) {
    console.error("Failed to rename project:", error);
    throw new Error("Failed to rename project.");
  }
}

export function getProject(id: string): SavedProject | null {
  const projects = getAllProjects();
  return projects.find((p) => p.id === id) || null;
}

export function exportProjectAsJSON(project: SavedProject): void {
  const dataStr = JSON.stringify(project, null, 2);
  const dataBlob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${project.name.replace(/\s+/g, "_")}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function importProjectFromJSON(jsonString: string): SavedProject {
  try {
    const project = JSON.parse(jsonString) as SavedProject;
    // Validate required fields
    if (!project.id || !project.name || !project.segments) {
      throw new Error("Invalid project file");
    }
    return project;
  } catch (error) {
    console.error("Failed to import project:", error);
    throw new Error("Invalid project file format.");
  }
}
