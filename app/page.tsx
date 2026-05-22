import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { todoDB } from "@/lib/db";
import TodoClient from "@/app/todo-client";

export default async function Home() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const todos = todoDB.getAllDetailedByUser(session.userId);
  return <TodoClient initialTodos={todos} />;
}
