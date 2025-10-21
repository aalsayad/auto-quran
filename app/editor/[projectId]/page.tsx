import { Suspense } from "react";
import Navbar from "@/components/navbar";
import AudioUploader from "@/components/audio-uploader";

export default function EditorPage() {
  return (
    <>
      <Navbar />
      <div className="pt-16">
        <Suspense
          fallback={
            <div className="flex items-center justify-center min-h-screen">
              <p className="text-muted-foreground">Loading...</p>
            </div>
          }
        >
          <AudioUploader />
        </Suspense>
      </div>
    </>
  );
}
