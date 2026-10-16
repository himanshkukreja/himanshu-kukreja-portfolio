import { Suspense } from "react";
import PreviewFrame from "@/components/admin/case-files/PreviewFrame";

/** Preview iframe for the case file editor (rendered without the admin shell, see AdminShell). */
export default function CaseFilePreviewFrame() {
  return (
    <Suspense fallback={null}>
      <PreviewFrame />
    </Suspense>
  );
}
