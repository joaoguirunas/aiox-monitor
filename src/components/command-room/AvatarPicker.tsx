'use client';

export type AvatarId = string;

export const AIOX_AGENT_TO_AVATAR: Record<string, AvatarId> = {};

export function AvatarImage({ avatar }: { avatar?: AvatarId }) {
  return null;
}

export function AvatarPicker({
  value,
  onChange,
}: {
  value?: AvatarId;
  onChange?: (avatar: AvatarId) => void;
}) {
  return null;
}
