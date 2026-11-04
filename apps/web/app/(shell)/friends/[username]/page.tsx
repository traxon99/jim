import { FriendProfileScreen } from "@/components/profile/friend-profile-screen";

export default async function FriendProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  return <FriendProfileScreen username={username} />;
}
