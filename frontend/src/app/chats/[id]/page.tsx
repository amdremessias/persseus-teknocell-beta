import { redirect } from "next/navigation";

export default function ChatRedirect({ params }: { params: { id: string } }) {
  redirect(`/chats?selected=${encodeURIComponent(params.id)}`);
}
