import type { Metadata } from "next";
import { ProjectGrid } from "@/components/app/project-grid";
import { requireSession } from "@/lib/auth/session";
import { SiteFontsLoader } from "@/components/shared/font-loader";

export const metadata: Metadata = { title: "Projects" };

export default async function DashboardPage() {
  const { store } = await requireSession("/dashboard");
  const projects = await store.listProjects();
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <SiteFontsLoader families={Array.from(new Set(projects.flatMap((p) => (p.thumb ? [p.thumb.display] : []))))} text={null} />
      <ProjectGrid initial={projects} />
    </div>
  );
}
