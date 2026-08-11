import React, { useState } from 'react';

export const isImageUrl = (str?: string): boolean => {
  if (!str) return false;
  return (
    str.startsWith('http://') ||
    str.startsWith('https://') ||
    str.startsWith('data:') ||
    str.startsWith('/')
  );
};

interface AvatarDisplayProps {
  avatar?: string;
  username?: string;
  className?: string;
  textClassName?: string;
}

export const AvatarDisplay: React.FC<AvatarDisplayProps> = ({
  avatar,
  username,
  className = "w-8 h-8 rounded-full bg-purple-900/60 border border-purple-500/30 flex items-center justify-center shrink-0 overflow-hidden",
  textClassName = "text-base"
}) => {
  const [imgError, setImgError] = useState(false);

  if (avatar && isImageUrl(avatar) && !imgError) {
    return (
      <img
        src={avatar}
        alt={username || 'Avatar'}
        className={className}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div className={className}>
      <span className={textClassName}>{avatar || '🎮'}</span>
    </div>
  );
};

export default AvatarDisplay;
