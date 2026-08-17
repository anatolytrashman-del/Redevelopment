import { Avatar } from '../ui/Avatar';
import { createLeadPhotoUrl } from '../../lib/leadsApi';

interface LeadAvatarProps {
  name: string;
  photoPath: string;
  size?: 'sm' | 'lg';
  className?: string;
}

export function LeadAvatar(props: LeadAvatarProps) {
  return <Avatar {...props} resolveUrl={createLeadPhotoUrl} />;
}
