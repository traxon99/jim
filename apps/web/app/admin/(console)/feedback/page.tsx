import { AdminFeedback } from "@/components/admin/admin-feedback";
import { loadFeedback, pickFeedbackState, pickFeedbackType } from "@/lib/admin/feedback-data";
import { requireAdmin } from "@/lib/admin/load-access";

export default async function AdminFeedbackPage(props: PageProps<"/admin/feedback">) {
  await requireAdmin();
  const searchParams = await props.searchParams;
  const state = pickFeedbackState(searchParams.state);
  const type = pickFeedbackType(searchParams.type);
  const result = await loadFeedback({ state, type });
  return <AdminFeedback state={state} type={type} result={result} />;
}
