import { Avatar } from '../ui/Avatar';
import { createContractorPhotoUrl } from '../../lib/contractorsApi';

interface ContractorAvatarProps {
  name: string;
  photoPath: string;
  size?: 'sm' | 'lg';
  className?: string;
}

export function ContractorAvatar(props: ContractorAvatarProps) {
  return <Avatar {...props} resolveUrl={createContractorPhotoUrl} />;
}
