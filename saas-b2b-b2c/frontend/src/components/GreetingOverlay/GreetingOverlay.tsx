import React, { useEffect, useState, useCallback } from 'react';
import styles from './GreetingOverlay.module.css';

interface GreetingOverlayProps {
  firstName?: string;
  lastName?: string;
  onComplete: () => void;
}

type Period = 'morning' | 'day' | 'evening' | 'night';

function getPeriod(): Period {
  const h = new Date().getHours();
  if (h >= 4 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'day';
  if (h >= 17 && h < 24) return 'evening';
  return 'night';
}

function getGreeting(period: Period): string {
  switch (period) {
    case 'morning': return 'Доброе утро';
    case 'day':     return 'Добрый день';
    case 'evening': return 'Добрый вечер';
    case 'night':   return 'Доброй ночи';
  }
}

function getEmoji(period: Period): string {
  switch (period) {
    case 'morning': return '🌅';
    case 'day':     return '☀️';
    case 'evening': return '🌇';
    case 'night':   return '🌙';
  }
}

function getSubtitle(period: Period): string {
  switch (period) {
    case 'morning': return 'Хорошего рабочего дня!';
    case 'day':     return 'Продуктивного дня!';
    case 'evening': return 'Хорошего завершения дня!';
    case 'night':   return 'Удачной смены!';
  }
}

const GreetingOverlay: React.FC<GreetingOverlayProps> = ({ firstName, lastName, onComplete }) => {
  const period = getPeriod();
  const [fadingOut, setFadingOut] = useState(false);

  const handleComplete = useCallback(() => {
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFadingOut(true), 1700);
    const doneTimer = setTimeout(handleComplete, 2200);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [handleComplete]);

  const gradientClass = styles[period] || styles.day;
  const fullName = [firstName, lastName].filter(Boolean).join(' ');
  const displayName = fullName ? `, ${fullName}!` : '!';

  return (
    <div className={`${styles.overlay} ${gradientClass}`}>
      <div className={`${styles.content} ${fadingOut ? styles.fadeOut : ''}`}>
        <span className={styles.emoji}>{getEmoji(period)}</span>
        <h1 className={styles.greeting}>
          {getGreeting(period)}{displayName}
        </h1>
        <p className={styles.subtitle}>{getSubtitle(period)}</p>
      </div>
    </div>
  );
};

export default GreetingOverlay;
