import { prisma } from "@/lib/db";
import { NewJobForm } from "./form";

export const dynamic = "force-dynamic";

export default async function NewJobPage() {
  const clients = await prisma.client.findMany({ orderBy: { name: "asc" }, select: { name: true } });
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">New job</h1>
      <NewJobForm clientNames={clients.map((c) => c.name)} />
    </div>
  );
}
