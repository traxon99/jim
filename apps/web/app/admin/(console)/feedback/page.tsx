import { AdminFeedback } from "@/components/admin/admin-feedback";
import { requireAdmin } from "@/lib/admin/load-access";
import { serviceDb } from "@/lib/db/user-scoped";
import { loadFeedback, pickFeedbackState, pickFeedbackType } from "@jim/db/admin";

export default async function AdminFeedbackPage(props: PageProps<"/admin/feedback">) {
  await requireAdmin();
  const searchParams = await props.searchParams;
  const state = pickFeedbackState(searchParams.state);
  const type = pickFeedbackType(searchParams.type);
  const result = await loadFeedback({ state, type }, serviceDb());
  return <AdminFeedback state={state} type={type} result={result} />;
}
